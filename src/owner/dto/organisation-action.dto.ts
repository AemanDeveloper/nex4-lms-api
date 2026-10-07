import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class SuspendOrganisationDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class DeleteOrganisationDto {
  @IsString()
  @Length(1, 160)
  confirmation!: string;
}
