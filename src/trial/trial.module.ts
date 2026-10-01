import { Module } from '@nestjs/common';
import { TrialController } from './trial.controller';
import { TrialService } from './trial.service';

@Module({ controllers: [TrialController], providers: [TrialService], exports: [TrialService] })
export class TrialModule {}

