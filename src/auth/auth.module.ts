import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MemberAuthGuard } from './member-auth.guard';
import { OrganisationWriteGuard } from './organisation-write.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, MemberAuthGuard, OrganisationWriteGuard],
  exports: [JwtModule, MemberAuthGuard, OrganisationWriteGuard],
})
export class AuthModule {}
