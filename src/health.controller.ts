import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok', service: 'nex4-lms-api', timestamp: new Date().toISOString() };
  }
}

