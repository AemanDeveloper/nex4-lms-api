import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class OwnerSessionDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsString()
  @Length(6, 6)
  totpCode!: string;
}

