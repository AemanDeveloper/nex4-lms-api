import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DEMO_PERSPECTIVES, type DemoPerspective } from '../demo.types';

export class CreateDemoSessionDto {
  @ApiProperty({ enum: DEMO_PERSPECTIVES })
  @IsIn(DEMO_PERSPECTIVES)
  perspective!: DemoPerspective;
}

