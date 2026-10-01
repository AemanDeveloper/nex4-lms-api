import { IsString, Matches, MinLength } from 'class-validator';

export class ActivateTrialDto {
  @IsString()
  @MinLength(12)
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter.' })
  @Matches(/[a-z]/, { message: 'Password must contain a lowercase letter.' })
  @Matches(/[0-9]/, { message: 'Password must contain a number.' })
  password!: string;

  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Workspace address may contain lowercase letters, numbers and single hyphens.' })
  organisationSlug!: string;
}
