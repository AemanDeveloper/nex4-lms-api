import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrialModule } from '../trial/trial.module';
import { OwnerAuthService } from './owner-auth.service';
import { OwnerController } from './owner.controller';
import { OwnerSessionController } from './owner-session.controller';
import { PrivateOwnerGuard } from './private-owner.guard';

@Module({
  imports: [JwtModule.register({}), TrialModule],
  controllers: [OwnerSessionController, OwnerController],
  providers: [OwnerAuthService, PrivateOwnerGuard],
})
export class OwnerModule {}

