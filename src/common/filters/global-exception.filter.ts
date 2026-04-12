import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

export interface ErrorResponse {
  status: number;
  message: string;
  data: null;
}

/**
 * Global exception filter that formats all errors as:
 * { status: false, message: string, data: null }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Extract message from HttpException response
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        if (typeof responseObj.message === 'string') {
          message = responseObj.message;
        } else if (Array.isArray(responseObj.message)) {
          // Handle validation errors array
          message = responseObj.message.join(', ');
        }
      }
    } else if (exception instanceof Error) {
      // Handle generic Error objects
      message = exception.message;
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    } else {
      // Handle unknown errors
      this.logger.error(`Unknown error type: ${String(exception)}`);
    }

    const errorResponse: ErrorResponse = {
      status,
      message,
      data: null,
    };

    response.status(status).json(errorResponse);
  }
}
