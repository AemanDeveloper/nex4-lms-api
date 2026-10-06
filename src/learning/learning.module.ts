import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InvitationService } from './invitation.service';
import { LearningController, PublicInvitationController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [AuthModule],
  controllers: [LearningController, PublicInvitationController],
  providers: [LearningService, InvitationService],
  exports: [LearningService],
})
export class LearningModule {}

