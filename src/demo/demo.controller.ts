import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';
import { DemoAuthGuard, type DemoRequest } from './demo-auth.guard';
import { DemoService } from './demo.service';
import { DEMO_PERSPECTIVES, type DemoPerspective } from './demo.types';

@ApiTags('showcase')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Get('perspectives')
  listPerspectives() {
    return { perspectives: DEMO_PERSPECTIVES };
  }

  @Post('session')
  createSession(@Body() body: CreateDemoSessionDto) {
    return this.demo.createSession(body.perspective);
  }

  @ApiBearerAuth()
  @UseGuards(DemoAuthGuard)
  @Get(':perspective/dashboard')
  getDashboard(@Param('perspective') perspective: DemoPerspective, @Req() request: DemoRequest) {
    if (!DEMO_PERSPECTIVES.includes(perspective) || !request.demo.perspectives.includes(perspective)) throw new NotFoundException();
    return this.demo.getDashboard(perspective);
  }

  @ApiBearerAuth()
  @UseGuards(DemoAuthGuard)
  @Post('actions')
  blockedAction() {
    return { unreachable: true };
  }
}
