import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipRole, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateTimetableEntryDto,
  SaveAttendanceDto,
} from "./dto/operations.dto";

type Actor = { organisationId: string; userId: string; role: MembershipRole };

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  listAttendance(actor: Actor) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        if (actor.role === MembershipRole.GUARDIAN) return [];
        const classWhere = this.accessibleClassWhere(actor, membership.id);
        return transaction.attendanceSession.findMany({
          where: { organisationId: actor.organisationId, class: classWhere },
          include: {
            class: { select: { id: true, name: true } },
            records: {
              where:
                actor.role === MembershipRole.STUDENT
                  ? { studentMembershipId: membership.id }
                  : undefined,
              include: {
                student: {
                  include: {
                    user: {
                      select: { id: true, email: true, displayName: true },
                    },
                  },
                },
              },
              orderBy: { student: { user: { email: "asc" } } },
            },
          },
          orderBy: { attendanceDate: "desc" },
          take: 90,
        });
      },
    );
  }

  saveAttendance(actor: Actor, body: SaveAttendanceDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        await this.requireClassAccess(
          transaction,
          actor,
          membership.id,
          body.classId,
        );
        const submittedIds = body.records.map(
          (record) => record.studentMembershipId,
        );
        if (new Set(submittedIds).size !== submittedIds.length) {
          throw new BadRequestException({
            code: "ATTENDANCE_DUPLICATE_STUDENT",
            message: "Each Student can only appear once.",
          });
        }
        const enrolled = await transaction.classStudent.findMany({
          where: {
            organisationId: actor.organisationId,
            classId: body.classId,
            studentMembershipId: { in: submittedIds },
          },
          select: { studentMembershipId: true },
        });
        if (enrolled.length !== submittedIds.length) {
          throw new BadRequestException({
            code: "STUDENT_NOT_ENROLLED",
            message:
              "Attendance can only be recorded for Students enrolled in this class.",
          });
        }
        const attendanceDate = new Date(
          `${body.attendanceDate.slice(0, 10)}T00:00:00.000Z`,
        );
        const session = await transaction.attendanceSession.upsert({
          where: {
            classId_attendanceDate: { classId: body.classId, attendanceDate },
          },
          update: { notes: body.notes?.trim() || null },
          create: {
            organisationId: actor.organisationId,
            classId: body.classId,
            attendanceDate,
            notes: body.notes?.trim() || null,
            createdByMembershipId: membership.id,
          },
        });
        await transaction.attendanceRecord.deleteMany({
          where: {
            sessionId: session.id,
            ...(submittedIds.length
              ? { studentMembershipId: { notIn: submittedIds } }
              : {}),
          },
        });
        for (const record of body.records) {
          await transaction.attendanceRecord.upsert({
            where: {
              sessionId_studentMembershipId: {
                sessionId: session.id,
                studentMembershipId: record.studentMembershipId,
              },
            },
            update: {
              status: record.status,
              note: record.note?.trim() || null,
            },
            create: {
              organisationId: actor.organisationId,
              sessionId: session.id,
              studentMembershipId: record.studentMembershipId,
              status: record.status,
              note: record.note?.trim() || null,
            },
          });
        }
        await this.audit(
          transaction,
          actor,
          "attendance.saved",
          "attendance_session",
          session.id,
          {
            classId: body.classId,
            attendanceDate: body.attendanceDate,
            records: body.records.length,
          },
        );
        return transaction.attendanceSession.findUniqueOrThrow({
          where: { id: session.id },
          include: { records: true },
        });
      },
    );
  }

  listTimetable(actor: Actor) {
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        if (actor.role === MembershipRole.GUARDIAN) return [];
        return transaction.timetableEntry.findMany({
          where: {
            organisationId: actor.organisationId,
            class: this.accessibleClassWhere(actor, membership.id),
          },
          include: {
            class: { select: { id: true, name: true } },
            course: { select: { id: true, title: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 200,
        });
      },
    );
  }

  createTimetableEntry(actor: Actor, body: CreateTimetableEntryDto) {
    this.requireStaff(actor.role);
    return this.prisma.forOrganisation(
      actor.organisationId,
      async (transaction) => {
        const membership = await this.actorMembership(transaction, actor);
        await this.requireClassAccess(
          transaction,
          actor,
          membership.id,
          body.classId,
        );
        const startsAt = new Date(body.startsAt);
        const endsAt = new Date(body.endsAt);
        if (endsAt <= startsAt)
          throw new BadRequestException({
            code: "TIMETABLE_TIME_INVALID",
            message: "End time must be after start time.",
          });
        if (endsAt.getTime() - startsAt.getTime() > 86_400_000)
          throw new BadRequestException({
            code: "TIMETABLE_DURATION_INVALID",
            message: "A timetable entry cannot be longer than 24 hours.",
          });
        if (body.courseId) {
          const assignment = await transaction.courseClass.findFirst({
            where: {
              organisationId: actor.organisationId,
              classId: body.classId,
              courseId: body.courseId,
            },
          });
          if (!assignment)
            throw new BadRequestException({
              code: "COURSE_NOT_ASSIGNED",
              message: "Choose a course assigned to this class.",
            });
        }
        const entry = await transaction.timetableEntry.create({
          data: {
            organisationId: actor.organisationId,
            classId: body.classId,
            courseId: body.courseId || null,
            title: body.title.trim(),
            startsAt,
            endsAt,
            location: body.location?.trim() || null,
            notes: body.notes?.trim() || null,
            createdByMembershipId: membership.id,
          },
          include: {
            class: { select: { id: true, name: true } },
            course: { select: { id: true, title: true } },
          },
        });
        await this.audit(
          transaction,
          actor,
          "timetable.created",
          "timetable_entry",
          entry.id,
          { classId: body.classId },
        );
        return entry;
      },
    );
  }

  private accessibleClassWhere(
    actor: Actor,
    membershipId: string,
  ): Prisma.ClassWhereInput {
    const where: Prisma.ClassWhereInput = {
      organisationId: actor.organisationId,
    };
    if (actor.role === MembershipRole.TEACHER)
      where.teachers = { some: { teacherMembershipId: membershipId } };
    if (actor.role === MembershipRole.STUDENT)
      where.students = { some: { studentMembershipId: membershipId } };
    if (actor.role === MembershipRole.GUARDIAN) where.id = "__unavailable__";
    return where;
  }

  private async requireClassAccess(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    membershipId: string,
    classId: string,
  ) {
    const classroom = await transaction.class.findFirst({
      where: { id: classId, ...this.accessibleClassWhere(actor, membershipId) },
    });
    if (!classroom) throw new NotFoundException();
    return classroom;
  }

  private async actorMembership(
    transaction: Prisma.TransactionClient,
    actor: Actor,
  ) {
    const membership = await transaction.membership.findUnique({
      where: {
        organisationId_userId_role: {
          organisationId: actor.organisationId,
          userId: actor.userId,
          role: actor.role,
        },
      },
    });
    if (!membership)
      throw new ForbiddenException({
        code: "MEMBERSHIP_REQUIRED",
        message: "Membership is no longer active.",
      });
    return membership;
  }

  private requireStaff(role: MembershipRole) {
    if (
      role !== MembershipRole.TEACHER &&
      role !== MembershipRole.ORGANISATION_ADMIN
    )
      throw new ForbiddenException({
        code: "ROLE_NOT_ALLOWED",
        message: "Only assigned staff can manage attendance and schedules.",
      });
  }

  private audit(
    transaction: Prisma.TransactionClient,
    actor: Actor,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Prisma.InputJsonValue,
  ) {
    return transaction.auditLog.create({
      data: {
        organisationId: actor.organisationId,
        actorUserId: actor.userId,
        action,
        targetType,
        targetId,
        metadata,
      },
    });
  }
}
