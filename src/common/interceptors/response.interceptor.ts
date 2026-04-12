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
      map((data): ResponseWrapper<T> => ({
        status: statusCode,
        message: 'Success',
        data: data as T,
      })),
    );
  }
}
