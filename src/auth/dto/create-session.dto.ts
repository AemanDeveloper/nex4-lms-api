import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSessionDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @IsString()
  organisationSlug?: string;
}

