import { IsInt, IsString, Length, Max, Min } from 'class-validator';

export class CreateUploadIntentDto {
  @IsString()
  @Length(1, 180)
  fileName!: string;

  @IsString()
  @Length(3, 127)
  contentType!: string;

  @IsInt()
  @Min(1)
  @Max(26_214_400)
  sizeBytes!: number;
}
