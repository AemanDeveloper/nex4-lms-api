import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TRIAL_QUOTAS } from '../trial/trial.constants';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(organisationId: string, userId: string, role: MembershipRole) {
    return this.prisma.forOrganisation(organisationId, async (transaction) => {
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
            where: { organisationId },
            include: { lessons: { orderBy: { position: 'asc' } }, assignments: { orderBy: { dueAt: 'asc' } } },
            orderBy: { updatedAt: 'desc' },
            take: 12,
          }),
          transaction.announcement.findMany({ where: { organisationId }, orderBy: { publishedAt: 'desc' }, take: 10 }),
          transaction.course.count({ where: { organisationId } }),
          transaction.lesson.count({ where: { course: { organisationId } } }),
          transaction.assignment.count({ where: { course: { organisationId } } }),
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
          canUpload: true,
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
