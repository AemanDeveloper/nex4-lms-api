import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { MemberRequest } from "../auth/auth.types";
import { MemberAuthGuard } from "../auth/member-auth.guard";
import { OrganisationWriteGuard } from "../auth/organisation-write.guard";
import {
  CreateTimetableEntryDto,
  SaveAttendanceDto,
} from "./dto/operations.dto";
import { OperationsService } from "./operations.service";

function actor(request: MemberRequest) {
  return {
    organisationId: request.member.organisationId,
    userId: request.member.sub,
    role: request.member.role,
  };
}

@ApiTags("operations")
@ApiBearerAuth()
@UseGuards(MemberAuthGuard, OrganisationWriteGuard)
@Controller()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("attendance")
  listAttendance(@Req() request: MemberRequest) {
    return this.operations.listAttendance(actor(request));
  }

  @Post("attendance")
  saveAttendance(
    @Req() request: MemberRequest,
    @Body() body: SaveAttendanceDto,
  ) {
    return this.operations.saveAttendance(actor(request), body);
  }

  @Get("timetable")
  listTimetable(@Req() request: MemberRequest) {
    return this.operations.listTimetable(actor(request));
  }

  @Post("timetable")
  createTimetableEntry(
    @Req() request: MemberRequest,
    @Body() body: CreateTimetableEntryDto,
  ) {
    return this.operations.createTimetableEntry(actor(request), body);
  }
}
