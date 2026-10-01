import { ApiProperty } from '@nestjs/swagger';
import { OrganisationType } from '@prisma/client';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsString, Length, Max, Min, MinLength } from 'class-validator';

export class RequestTrialDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(2, 160)
  organisationName!: string;

  @ApiProperty({ enum: OrganisationType })
  @IsEnum(OrganisationType)
  organisationType!: OrganisationType;

  @IsString()
  @Length(2, 2)
  country!: string;

  @IsString()
  @MinLength(20)
  intendedUse!: string;

  @IsInt()
  @Min(1)
  @Max(100_000)
  estimatedLearners!: number;

  @IsInt()
  @Min(1)
  @Max(10_000)
  estimatedTeachers!: number;

  @IsString()
  @Length(3, 3)
  preferredCurrency!: string;

  @IsBoolean()
  acceptedPrivacyAndTrialTerms!: boolean;
}
