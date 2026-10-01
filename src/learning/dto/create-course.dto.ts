import { IsString, Length, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @Length(2, 140)
  title!: string;

  @IsString()
  @MinLength(20)
  description!: string;
}

