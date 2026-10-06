import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @Length(3, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 20_000)
  instructions?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsInt()
  @Min(1)
  @Max(1_000)
  points!: number;

  @IsOptional()
  @IsBoolean()
  allowLateSubmissions?: boolean;
}
