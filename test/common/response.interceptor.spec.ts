import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor, ResponseWrapper } from '../../src/common/interceptors/response.interceptor';

// Mock Response type
interface MockResponse {
  statusCode: number;
}

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<unknown>;

  const createMockExecutionContext = (statusCode: number): ExecutionContext => {
    const mockResponse: MockResponse = { statusCode };
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (data: unknown): CallHandler => ({
    handle: () => of(data),
  }) as unknown as CallHandler;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseInterceptor],
    }).compile();

    interceptor = module.get<ResponseInterceptor<unknown>>(ResponseInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  describe('intercept', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    it('should wrap successful response with status, message, and data', (done) => {
      const mockData = { id: 1, name: 'Test User' };
      const context = createMockExecutionContext(200);
      const next = createMockCallHandler(mockData);

      interceptor.intercept(context, next).subscribe({
        next: (result: ResponseWrapper<unknown>) => {
          expect(result).toEqual({
            status: 200,
            message: 'Success',
            data: mockData,
          });
          done();
        },
        error: done.fail,
      });
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    it('should preserve original HTTP status code', (done) => {
      const mockData = { success: true };
      const context = createMockExecutionContext(201);
      const next = createMockCallHandler(mockData);

      interceptor.intercept(context, next).subscribe({
        next: (result: ResponseWrapper<unknown>) => {
          expect(result.status).toBe(201);
          done();
        },
        error: done.fail,
      });
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    it('should wrap array response correctly', (done) => {
      const mockData = [1, 2, 3];
      const context = createMockExecutionContext(200);
      const next = createMockCallHandler(mockData);

      interceptor.intercept(context, next).subscribe({
        next: (result: ResponseWrapper<unknown>) => {
          expect(result.data).toEqual(mockData);
          done();
        },
        error: done.fail,
      });
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    it('should wrap null response correctly', (done) => {
      const mockData = null;
      const context = createMockExecutionContext(204);
      const next = createMockCallHandler(mockData);

      interceptor.intercept(context, next).subscribe({
        next: (result: ResponseWrapper<unknown>) => {
          expect(result.data).toBeNull();
          done();
        },
        error: done.fail,
      });
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    it('should wrap string response correctly', (done) => {
      const mockData = 'Operation successful';
      const context = createMockExecutionContext(200);
      const next = createMockCallHandler(mockData);

      interceptor.intercept(context, next).subscribe({
        next: (result: ResponseWrapper<unknown>) => {
          expect(result.data).toBe(mockData);
          done();
        },
        error: done.fail,
      });
    });
  });
});
