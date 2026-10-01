import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ActivateTrialDto } from './dto/activate-trial.dto';
import { RequestTrialDto } from './dto/request-trial.dto';
import { TrialService } from './trial.service';

@ApiTags('trial access')
@Controller('trials')
export class TrialController {
  constructor(private readonly trials: TrialService) {}

  @Post()
  request(@Body() body: RequestTrialDto) {
    return this.trials.requestTrial(body);
  }

  @Post('verify/:token')
  verify(@Param('token') token: string) {
    return this.trials.verifyEmail(token);
  }

  @Post('activate/:token')
  activate(@Param('token') token: string, @Body() body: ActivateTrialDto) {
    return this.trials.activate(token, body);
  }
}

