import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { hash, verify } from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { TRIAL_QUOTAS } from '../trial/trial.constants';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organisationId: string, userId: string, role: MembershipRole) {
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      const membership = await transaction.membership.findUniqueOrThrow({ where: { organisationId_userId_role: { organisationId, userId, role } } });
      const courseWhere: Prisma.CourseWhereInput = { organisationId };
      if (role === MembershipRole.TEACHER) {
        courseWhere.classes = { some: { class: { teachers: { some: { teacherMembershipId: membership.id } } } } };
      } else if (role === MembershipRole.STUDENT) {
        courseWhere.published = true;
        courseWhere.classes = { some: { class: { students: { some: { studentMembershipId: membership.id } } } } };
      } else if (role !== MembershipRole.ORGANISATION_ADMIN) {
        courseWhere.id = { equals: '00000000-0000-0000-0000-000000000000' };
      }
      const [organisation, user, branches, courses, announcements, courseCount, lessonCount, assignmentCount, memberCount, fileCount] =
        await Promise.all([
          transaction.organisation.findUniqueOrThrow({
            where: { id: organisationId },
            select: {
              id: true,
              name: true,
              slug: true,
              type: true,
              status: true,
              trialStartedAt: true,
              trialEndsAt: true,
              recoveryEndsAt: true,
              subscriptionPlan: true,
              subscriptionStatus: true,
              storageUsedBytes: true,
            },
          }),
          transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, displayName: true, avatarFileId: true } }),
          transaction.branch.findMany({ where: { organisationId }, orderBy: { name: 'asc' } }),
          transaction.course.findMany({
            where: courseWhere,
            include: {
              lessons: { where: role === MembershipRole.STUDENT ? { published: true } : undefined, include: role === MembershipRole.STUDENT ? { progress: { where: { studentMembershipId: membership.id } } } : undefined, orderBy: { position: 'asc' } },
              assignments: { orderBy: { dueAt: 'asc' } },
              quizzes: { where: role === MembershipRole.STUDENT ? { published: true } : undefined, orderBy: { createdAt: 'desc' } },
              classes: { include: { class: { select: { id: true, name: true } } } },
            },
            orderBy: { updatedAt: 'desc' },
            take: 12,
          }),
          transaction.announcement.findMany({ where: { organisationId }, orderBy: { publishedAt: 'desc' }, take: 10 }),
          transaction.course.count({ where: courseWhere }),
          transaction.lesson.count({ where: { course: courseWhere } }),
          transaction.assignment.count({ where: { course: courseWhere } }),
          transaction.membership.count({ where: { organisationId } }),
          transaction.storedFile.count({ where: { organisationId, status: 'READY' } }),
        ]);

      return {
        user,
        role,
        organisation: { ...organisation, storageUsedBytes: organisation.storageUsedBytes.toString() },
        branches,
        quotas: TRIAL_QUOTAS,
        metrics: { courses: courseCount, lessons: lessonCount, assignments: assignmentCount, members: memberCount, files: fileCount },
        courses,
        announcements,
        capabilities: {
          canAuthor: role === MembershipRole.TEACHER || role === MembershipRole.ORGANISATION_ADMIN,
          canManageOrganisation: role === MembershipRole.ORGANISATION_ADMIN,
          canUpload: role !== MembershipRole.GUARDIAN,
        },
      };
    });
  }

  async getProfile(organisationId: string, userId: string, role: MembershipRole) {
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      await transaction.membership.findUniqueOrThrow({
        where: { organisationId_userId_role: { organisationId, userId, role } },
      });
      return transaction.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, displayName: true, avatarFileId: true, emailVerifiedAt: true, createdAt: true },
      });
    });
  }

  async updateProfile(organisationId: string, userId: string, role: MembershipRole, input: UpdateProfileDto) {
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      await transaction.membership.findUniqueOrThrow({
        where: { organisationId_userId_role: { organisationId, userId, role } },
      });
      if (input.avatarFileId) {
        const avatar = await transaction.storedFile.findFirst({
          where: { id: input.avatarFileId, organisationId, uploadedByUserId: userId, status: 'READY' },
          select: { id: true, contentType: true, sizeBytes: true },
        });
        if (!avatar || !avatar.contentType.startsWith('image/') || avatar.sizeBytes > 5_242_880n) {
          throw new BadRequestException({ code: 'AVATAR_INVALID', message: 'Choose an uploaded image smaller than 5 MB.' });
        }
      }
      const user = await transaction.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
          ...('avatarFileId' in input ? { avatarFileId: input.avatarFileId ?? null } : {}),
        },
        select: { id: true, email: true, displayName: true, avatarFileId: true },
      });
      await transaction.auditLog.create({
        data: { organisationId, actorUserId: userId, action: 'profile.updated', targetType: 'user', targetId: userId, metadata: { avatarChanged: 'avatarFileId' in input } },
      });
      return user;
    });
  }

  async changeEmail(organisationId: string, userId: string, role: MembershipRole, input: ChangeEmailDto) {
    const email = input.email.trim().toLowerCase();
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerifiedAt: true, passwordHash: true } });
    if (!current?.passwordHash || !(await verify(current.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException({ code: 'CURRENT_PASSWORD_INVALID', message: 'The current password is incorrect.' });
    }
    if (current.email === email) return { email, emailVerifiedAt: current.emailVerifiedAt };
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException({ code: 'EMAIL_IN_USE', message: 'This email is already in use.' });
    }
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      await transaction.membership.findUniqueOrThrow({ where: { organisationId_userId_role: { organisationId, userId, role } } });
      const user = await transaction.user.update({
        where: { id: userId },
        data: { email, emailVerifiedAt: new Date() },
        select: { email: true, emailVerifiedAt: true },
      });
      await transaction.auditLog.create({
        data: { organisationId, actorUserId: userId, action: 'profile.email_changed', targetType: 'user', targetId: userId, metadata: { previousEmail: current.email, email } },
      });
      return user;
    });
  }

  async changePassword(organisationId: string, userId: string, role: MembershipRole, input: ChangePasswordDto) {
    const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!current?.passwordHash || !(await verify(current.passwordHash, input.currentPassword))) {
      throw new UnauthorizedException({ code: 'CURRENT_PASSWORD_INVALID', message: 'The current password is incorrect.' });
    }
    if (await verify(current.passwordHash, input.newPassword)) {
      throw new BadRequestException({ code: 'PASSWORD_UNCHANGED', message: 'Choose a different password.' });
    }
    const passwordHash = await hash(input.newPassword);
    await this.prisma.forOrganisation(organisationId, async (transaction) => {
      await transaction.membership.findUniqueOrThrow({ where: { organisationId_userId_role: { organisationId, userId, role } } });
      await transaction.user.update({ where: { id: userId }, data: { passwordHash } });
      await transaction.auditLog.create({
        data: { organisationId, actorUserId: userId, action: 'profile.password_changed', targetType: 'user', targetId: userId, metadata: {} },
      });
    });
    return { changed: true };
  }

  listMembers(organisationId: string, role: MembershipRole) {
    if (role !== MembershipRole.ORGANISATION_ADMIN) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Only organisation administrators can view memberships.' });
    }
    return this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.membership.findMany({
        where: { organisationId },
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, displayName: true, avatarFileId: true, emailVerifiedAt: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  listAnnouncements(organisationId: string) {
    return this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.announcement.findMany({ where: { organisationId }, orderBy: { publishedAt: 'desc' }, take: 100 }),
    );
  }

  createAnnouncement(organisationId: string, userId: string, role: MembershipRole, input: CreateAnnouncementDto) {
    if (role !== MembershipRole.TEACHER && role !== MembershipRole.ORGANISATION_ADMIN) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Only staff can publish announcements.' });
    }
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
      const announcement = await transaction.announcement.create({
        data: { organisationId, title: input.title.trim(), body: input.body.trim(), publishedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: { organisationId, actorUserId: userId, action: 'announcement.created', targetType: 'announcement', targetId: announcement.id, metadata: {} },
      });
      return announcement;
    });
  }
}
