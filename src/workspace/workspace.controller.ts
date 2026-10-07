import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MemberRequest } from '../auth/auth.types';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ChangeEmailDto, ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
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

  @Get('profile')
  profile(@Req() request: MemberRequest) {
    return this.workspace.getProfile(request.member.organisationId, request.member.sub, request.member.role);
  }

  @Patch('profile')
  updateProfile(@Req() request: MemberRequest, @Body() body: UpdateProfileDto) {
    return this.workspace.updateProfile(request.member.organisationId, request.member.sub, request.member.role, body);
  }

  @Patch('profile/email')
  changeEmail(@Req() request: MemberRequest, @Body() body: ChangeEmailDto) {
    return this.workspace.changeEmail(request.member.organisationId, request.member.sub, request.member.role, body);
  }

  @Patch('profile/password')
  changePassword(@Req() request: MemberRequest, @Body() body: ChangePasswordDto) {
    return this.workspace.changePassword(request.member.organisationId, request.member.sub, request.member.role, body);
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
