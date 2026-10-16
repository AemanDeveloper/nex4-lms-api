import { AttendanceStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from "class-validator";

export class AttendanceRecordDto {
  @IsUUID()
  studentMembershipId!: string;

  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class SaveAttendanceDto {
  @IsUUID()
  classId!: string;

  @IsDateString()
  attendanceDate!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  notes?: string;

  @IsArray()
  @ArrayMaxSize(250)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordDto)
  records!: AttendanceRecordDto[];
}

export class CreateTimetableEntryDto {
  @IsUUID()
  classId!: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsString()
  @Length(2, 160)
  title!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2_000)
  notes?: string;
}
