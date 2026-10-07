import { IsEmail, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  avatarFileId?: string | null;
}

export class ChangeEmailDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(200)
  currentPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  currentPassword!: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/, {
    message: 'New password must contain uppercase, lowercase and a number, and be at least 12 characters.',
  })
  newPassword!: string;
}
