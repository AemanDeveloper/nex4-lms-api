import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TRIAL_QUOTAS } from '../trial/trial.constants';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

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
          transaction.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true } }),
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

  listMembers(organisationId: string, role: MembershipRole) {
    if (role !== MembershipRole.ORGANISATION_ADMIN) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Only organisation administrators can view memberships.' });
    }
    return this.prisma.forOrganisation(organisationId, (transaction) =>
      transaction.membership.findMany({
        where: { organisationId },
        select: { id: true, role: true, createdAt: true, user: { select: { id: true, email: true, emailVerifiedAt: true } } },
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
