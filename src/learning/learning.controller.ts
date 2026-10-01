import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberRequest } from '../auth/auth.types';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';

@ApiTags('learning')
@ApiBearerAuth()
@UseGuards(MemberAuthGuard, OrganisationWriteGuard)
@Controller('courses')
export class LearningController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Req() request: MemberRequest) {
    return this.prisma.forOrganisation(request.member.organisationId, (transaction) => transaction.course.findMany({ where: { organisationId: request.member.organisationId }, include: { lessons: { orderBy: { position: 'asc' } }, assignments: true }, orderBy: { createdAt: 'desc' } }));
  }

  @Post()
  create(@Req() request: MemberRequest, @Body() body: CreateCourseDto) {
    this.requireStaff(request.member.role);
    return this.prisma.forOrganisation(request.member.organisationId, (transaction) => transaction.course.create({ data: { organisationId: request.member.organisationId, title: body.title, description: body.description } }));
  }

  @Post(':courseId/lessons')
  createLesson(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateLessonDto,
  ) {
    this.requireStaff(request.member.role);
    return this.prisma.forOrganisation(request.member.organisationId, async (transaction) => {
      const course = await transaction.course.findFirst({ where: { id: courseId, organisationId: request.member.organisationId } });
      if (!course) throw new NotFoundException();
      const lesson = await transaction.lesson.create({
        data: { courseId, title: body.title.trim(), content: body.content as Prisma.InputJsonValue, position: body.position },
      });
      await transaction.auditLog.create({
        data: { organisationId: request.member.organisationId, actorUserId: request.member.sub, action: 'lesson.created', targetType: 'lesson', targetId: lesson.id, metadata: { courseId } },
      });
      return lesson;
    });
  }

  @Post(':courseId/assignments')
  createAssignment(
    @Req() request: MemberRequest,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() body: CreateAssignmentDto,
  ) {
    this.requireStaff(request.member.role);
    return this.prisma.forOrganisation(request.member.organisationId, async (transaction) => {
      const course = await transaction.course.findFirst({ where: { id: courseId, organisationId: request.member.organisationId } });
      if (!course) throw new NotFoundException();
      const assignment = await transaction.assignment.create({
        data: { courseId, title: body.title.trim(), points: body.points, dueAt: body.dueAt ? new Date(body.dueAt) : null },
      });
      await transaction.auditLog.create({
        data: { organisationId: request.member.organisationId, actorUserId: request.member.sub, action: 'assignment.created', targetType: 'assignment', targetId: assignment.id, metadata: { courseId } },
      });
      return assignment;
    });
  }

  private requireStaff(role: MembershipRole) {
    if (role !== MembershipRole.TEACHER && role !== MembershipRole.ORGANISATION_ADMIN) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Only staff can author learning content.' });
    }
  }
}
