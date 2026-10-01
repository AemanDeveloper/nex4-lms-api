import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberRequest } from '../auth/auth.types';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { WorkspaceService } from './workspace.service';

@ApiTags('workspace')
@ApiBearerAuth()
@UseGuards(MemberAuthGuard, OrganisationWriteGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  dashboard(@Req() request: MemberRequest) {
    return this.workspace.getDashboard(request.member.organisationId, request.member.sub, request.member.role);
  }

  @Get('members')
  members(@Req() request: MemberRequest) {
    return this.workspace.listMembers(request.member.organisationId, request.member.role);
  }

  @Get('announcements')
  announcements(@Req() request: MemberRequest) {
    return this.workspace.listAnnouncements(request.member.organisationId);
  }

  @Post('announcements')
  createAnnouncement(@Req() request: MemberRequest, @Body() body: CreateAnnouncementDto) {
    return this.workspace.createAnnouncement(request.member.organisationId, request.member.sub, request.member.role, body);
  }
}
