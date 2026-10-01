import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    if (typeof payload === 'object' && payload && 'code' in payload) {
      response.status(status).json(payload);
      return;
    }

    response.status(status).json({
      code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED',
      message: status === 500 ? 'The request could not be completed.' : String((payload as { message?: unknown })?.message ?? payload),
    });
  }
}

