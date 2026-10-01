import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateSessionDto } from './dto/create-session.dto';

@ApiTags('authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('session')
  createSession(@Body() body: CreateSessionDto) {
    return this.auth.createSession(body);
  }
}

