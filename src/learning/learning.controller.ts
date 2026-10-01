import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberRequest } from '../auth/auth.types';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';

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
    const staffRoles = new Set<MembershipRole>([MembershipRole.TEACHER, MembershipRole.ORGANISATION_ADMIN]);
    if (!staffRoles.has(request.member.role)) {
      throw new ForbiddenException({ code: 'ROLE_NOT_ALLOWED', message: 'Only staff can create courses.' });
    }
    return this.prisma.forOrganisation(request.member.organisationId, (transaction) => transaction.course.create({ data: { organisationId: request.member.organisationId, title: body.title, description: body.description } }));
  }
}
