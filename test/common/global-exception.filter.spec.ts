import { Test, TestingModule } from '@nestjs/testing';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  // Store captured response for assertions
  let capturedStatusCode: number;
  let capturedBody: Record<string, unknown>;

  const createMockResponse = () => {
    return {
      status: jest.fn().mockImplementation((code: number) => {
        capturedStatusCode = code;
        return {
          json: jest.fn().mockImplementation((body: Record<string, unknown>) => {
            capturedBody = body;
            return {};
          }),
        };
      }),
    };
  };

  const createMockArgumentsHost = (): ArgumentsHost => {
    const mockResponse = createMockResponse();
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => ({}),
      }),
      getArgByIndex: () => ({}),
      getArgs: () => [],
      getType: () => 'http',
    } as unknown as ArgumentsHost;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GlobalExceptionFilter],
    }).compile();

    filter = module.get<GlobalExceptionFilter>(GlobalExceptionFilter);
    capturedStatusCode = 0;
    capturedBody = {};
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('HttpException handling', () => {
    it('should format HttpException with string message', () => {
      const exception = new HttpException('Bad Request', HttpStatus.BAD_REQUEST);
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody).toEqual({
        status: HttpStatus.BAD_REQUEST,
        message: 'Bad Request',
        data: null,
      });
    });

    it('should format HttpException with object message', () => {
      const exception = new HttpException(
        { message: 'Validation failed' },
        HttpStatus.BAD_REQUEST,
      );
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody).toEqual({
        status: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        data: null,
      });
    });

    it('should format HttpException with array message', () => {
      const exception = new HttpException(
        { message: ['Field1 is required', 'Field2 is required'] },
        HttpStatus.BAD_REQUEST,
      );
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(capturedBody).toEqual({
        status: HttpStatus.BAD_REQUEST,
        message: 'Field1 is required, Field2 is required',
        data: null,
      });
    });

    it('should format NotFoundException correctly', () => {
      const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.NOT_FOUND);
      expect(capturedBody).toEqual({
        status: HttpStatus.NOT_FOUND,
        message: 'Resource not found',
        data: null,
      });
    });

    it('should format UnauthorizedException correctly', () => {
      const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.UNAUTHORIZED);
      expect(capturedBody).toEqual({
        status: HttpStatus.UNAUTHORIZED,
        message: 'Unauthorized',
        data: null,
      });
    });

    it('should format ForbiddenException correctly', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      const host = createMockArgumentsHost();

      filter.catch(exception, host);

      expect(capturedStatusCode).toBe(HttpStatus.FORBIDDEN);
      expect(capturedBody).toEqual({
        status: HttpStatus.FORBIDDEN,
        message: 'Forbidden',
        data: null,
      });
    });
  });

  describe('Generic Error handling', () => {
    it('should format generic Error correctly', () => {
      const error = new Error('Something went wrong');
      const host = createMockArgumentsHost();

      filter.catch(error, host);

      expect(capturedStatusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Something went wrong',
        data: null,
      });
    });

    it('should format generic Error with custom status via HttpException', () => {
      const error = new Error('Database connection failed');
      const host = createMockArgumentsHost();

      filter.catch(error, host);

      expect(capturedStatusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database connection failed',
        data: null,
      });
    });
  });

  describe('Unknown error handling', () => {
    it('should format unknown error type correctly', () => {
      const error = 'Unknown error string';
      const host = createMockArgumentsHost();

      filter.catch(error, host);

      expect(capturedStatusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        data: null,
      });
    });

    it('should format null error correctly', () => {
      const error: unknown = null;
      const host = createMockArgumentsHost();

      filter.catch(error, host);

      expect(capturedStatusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(capturedBody).toEqual({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        data: null,
      });
    });
  });
});
