import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MemberAuthGuard } from '../auth/member-auth.guard';
import { OrganisationWriteGuard } from '../auth/organisation-write.guard';
import type { MemberRequest } from '../auth/auth.types';
import { CreateUploadIntentDto } from './dto/create-upload-intent.dto';
import { StorageService } from './storage.service';

@ApiTags('private files')
@ApiBearerAuth()
@UseGuards(MemberAuthGuard, OrganisationWriteGuard)
@Controller('files')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  list(@Req() request: MemberRequest) {
    return this.storage.list(request.member.organisationId, request.member.sub, request.member.role);
  }

  @Post('upload-intents')
  createUploadIntent(@Req() request: MemberRequest, @Body() body: CreateUploadIntentDto) {
    return this.storage.createUploadIntent(request.member.organisationId, request.member.sub, body);
  }

  @Post(':id/complete')
  complete(@Req() request: MemberRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.storage.completeUpload(request.member.organisationId, request.member.sub, id);
  }

  @Get(':id/download')
  download(@Req() request: MemberRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.storage.createDownload(request.member.organisationId, request.member.sub, request.member.role, id);
  }

  @Delete(':id')
  remove(@Req() request: MemberRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.storage.remove(request.member.organisationId, request.member.sub, request.member.role, id);
  }
}
