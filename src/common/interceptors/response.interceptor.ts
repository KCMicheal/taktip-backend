import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface ResponseWrapper<T> {
  status: number;
  message: string;
  data: T | null;
}

/**
 * Global response interceptor that wraps all successful responses
 * with a consistent structure: { status, message, data }
 *
 * Handles controllers that manually return { status: 'success', data: ... }
 * by unwrapping them to prevent double-wrapping.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ResponseWrapper<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseWrapper<T>> {
    const response = context.switchToHttp().getResponse<Response>();
    const statusCode: number = response.statusCode;

    return next.handle().pipe(
      map((data: unknown): ResponseWrapper<T> => {
        // Some controllers manually return { status: 'success', data: ... }
        // Detect and unwrap to prevent double-wrapping
        if (data && typeof data === 'object' && 'status' in data) {
          const responseData = data as Record<string, unknown>;
          if (responseData.status === 'success') {
            return {
              status: statusCode,
              message: 'Success',
              data: responseData.data as T ?? null,
            };
          }
        }

        return {
          status: statusCode,
          message: 'Success',
          data: data as T,
        };
      }),
    );
  }
}
