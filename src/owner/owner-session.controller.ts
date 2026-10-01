import { Body, Controller, Ip, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { OwnerSessionDto } from './dto/owner-session.dto';
import { OwnerAuthService } from './owner-auth.service';

@ApiExcludeController()
@Controller('_control/access')
export class OwnerSessionController {
  constructor(private readonly auth: OwnerAuthService) {}

  @Post('session')
  createSession(@Body() body: OwnerSessionDto, @Ip() ip: string, @Req() request: Request) {
    return this.auth.createSession(body, ip, request.headers['user-agent']);
  }
}

