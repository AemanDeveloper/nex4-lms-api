import { IsEmail } from 'class-validator';

export class ResendTrialEmailDto {
  @IsEmail()
  email!: string;
}
