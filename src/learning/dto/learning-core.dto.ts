import {
  QuizQuestionType,
  QuizScorePolicy,
  SubmissionStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInvitationDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsIn(['TEACHER', 'STUDENT'])
  role!: 'TEACHER' | 'STUDENT';
}

export class AcceptInvitationDto {
  @IsString()
  @Length(32, 256)
  token!: string;

  @IsString()
  @Length(12, 128)
  @Matches(/[a-z]/, { message: 'Password must include a lowercase letter.' })
  @Matches(/[A-Z]/, { message: 'Password must include an uppercase letter.' })
  @Matches(/[0-9]/, { message: 'Password must include a number.' })
  password!: string;
}

export class CreateClassDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(2, 30)
  academicYear?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class AssignMembershipDto {
  @IsUUID()
  membershipId!: string;
}

export class AssignCourseDto {
  @IsUUID()
  courseId!: string;
}

export class UpdateLessonAvailabilityDto {
  @IsBoolean()
  published!: boolean;

  @IsOptional()
  @IsDateString()
  availableFrom?: string | null;
}

export class SaveSubmissionDto {
  @IsOptional()
  @IsString()
  @Length(1, 20_000)
  body?: string;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;

  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}

export class GradeSubmissionDto {
  @IsIn([SubmissionStatus.GRADED, SubmissionStatus.RETURNED])
  status!: 'GRADED' | 'RETURNED';

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @IsString()
  @Length(1, 10_000)
  feedback!: string;
}

export class CreateQuizQuestionDto {
  @IsEnum(QuizQuestionType)
  type!: QuizQuestionType;

  @IsString()
  @Length(2, 10_000)
  prompt!: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  points!: number;

  @IsInt()
  @Min(1)
  @Max(1_000)
  position!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 2_000)
  correctAnswer?: string;
}

export class CreateQuizDto {
  @IsString()
  @Length(2, 180)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 20_000)
  instructions?: string;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  attemptsAllowed!: number;

  @IsEnum(QuizScorePolicy)
  scorePolicy!: QuizScorePolicy;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions!: CreateQuizQuestionDto[];
}

export class UpdateQuizAvailabilityDto {
  @IsBoolean()
  published!: boolean;
}

export class SaveQuizAnswerDto {
  @IsUUID()
  questionId!: string;

  @IsOptional()
  response?: unknown;

  @IsOptional()
  @IsUUID()
  fileId?: string | null;
}

export class GradeQuizAnswerDto {
  @IsUUID()
  answerId!: string;

  @IsInt()
  @Min(0)
  awardedPoints!: number;

  @IsOptional()
  @IsString()
  @Length(0, 10_000)
  feedback?: string;
}

export class GradeQuizAttemptDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GradeQuizAnswerDto)
  answers!: GradeQuizAnswerDto[];
}
