import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DemoAuthGuard } from './demo-auth.guard';
import { DemoController } from './demo.controller';
import { DemoService } from './demo.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [DemoController],
  providers: [DemoService, DemoAuthGuard],
})
export class DemoModule {}

