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
  [key: string]: unknown;
}

/**
 * Global exception filter that formats all errors as:
 * { status: <httpCode>, message: <string>, ...extraProperties }
 *
 * Extra properties from HttpException response objects (e.g. requiresTwoFactor)
 * are passed through so frontend can detect specific error conditions.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    const extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      const httpException = exception as HttpException;
      status = httpException.getStatus();
      const exceptionResponse = httpException.getResponse();

      // Extract message and extra properties from HttpException response
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        if (typeof responseObj.message === 'string') {
          message = responseObj.message as string;
        } else if (Array.isArray(responseObj.message)) {
          // Handle validation errors array
          message = responseObj.message.join(', ');
        }

        // Pass through extra properties (e.g. requiresTwoFactor)
        for (const [key, value] of Object.entries(responseObj)) {
          if (key !== 'message' && key !== 'statusCode' && key !== 'error') {
            extra[key] = value;
          }
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
      ...extra,
    };

    response.status(status).json(errorResponse);
  }
}
