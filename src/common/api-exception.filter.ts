import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      const error = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `${request.method} ${request.originalUrl} failed: ${error.message}`,
        error.stack,
      );
    }

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

