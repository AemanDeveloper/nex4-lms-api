import { IsString, Length } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @Length(3, 120)
  title!: string;

  @IsString()
  @Length(10, 5_000)
  body!: string;
}
