import { IsInt, IsObject, IsString, Length, Min } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  @Length(3, 160)
  title!: string;

  @IsObject()
  content!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  position!: number;
}
