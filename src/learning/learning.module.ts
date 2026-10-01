import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LearningController } from './learning.controller';

@Module({ imports: [AuthModule], controllers: [LearningController] })
export class LearningModule {}

