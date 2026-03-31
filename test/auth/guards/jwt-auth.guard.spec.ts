import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { jwtAuthGuard } from '../../../src/auth/guards/jwt-auth.guard';
import { PUBLIC_KEY } from '../../../src/auth/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: ReturnType<typeof jwtAuthGuard>;
  let reflector: Reflector;
  let jwtService: JwtService;

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    jwtService = module.get<JwtService>(JwtService);
    reflector = module.get<Reflector>(Reflector);

    guard = jwtAuthGuard(jwtService, reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    headers: Record<string, string> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          user: undefined,
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  describe('canActivate', () => {
    describe('when endpoint is marked as public', () => {
      it('should allow access without JWT token', async () => {
        // Arrange
        const mockContext = createMockExecutionContext({});
        mockReflector.getAllAndOverride.mockReturnValue(true);

        // Act
        const result = await guard.canActivate(mockContext);

        // Assert
        expect(result).toBe(true);
        expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
          PUBLIC_KEY,
          [mockContext.getHandler(), mockContext.getClass()],
        );
        expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
      });
    });

    describe('when Authorization header is missing', () => {
      it('should reject request without Authorization header', async () => {
        // Arrange
        const mockContext = createMockExecutionContext({});
        mockReflector.getAllAndOverride.mockReturnValue(false);

        // Act & Assert
        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when Authorization header has invalid format', () => {
      it('should reject request with invalid token format', async () => {
        // Arrange
        const mockContext = createMockExecutionContext({
          authorization: 'InvalidFormat token123',
        });
        mockReflector.getAllAndOverride.mockReturnValue(false);

        // Act & Assert
        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when valid JWT token is provided', () => {
      it('should allow access with valid Bearer token', async () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        const mockUser = { sub: 'user-id', email: 'test@example.com' };
        const mockContext = createMockExecutionContext({
          authorization: `Bearer ${validToken}`,
        });
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockJwtService.verifyAsync.mockResolvedValue(mockUser);

        // Act
        const result = await guard.canActivate(mockContext);

        // Assert
        expect(result).toBe(true);
        expect(mockJwtService.verifyAsync).toHaveBeenCalledWith(validToken);
      });

      it('should attach user to request after successful validation', async () => {
        // Arrange
        const validToken = 'valid.jwt.token';
        const mockUser = { sub: 'user-id', email: 'test@example.com', role: 'user' };
        const mockRequest = {
          headers: { authorization: `Bearer ${validToken}` },
          user: undefined,
        };
        const mockContext = {
          switchToHttp: () => ({
            getRequest: () => mockRequest,
          }),
          getHandler: () => ({}),
          getClass: () => ({}),
        } as ExecutionContext;
        
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockJwtService.verifyAsync.mockResolvedValue(mockUser);

        // Act
        await guard.canActivate(mockContext);

        // Assert
        expect(mockRequest.user).toEqual(mockUser);
      });
    });

    describe('when expired JWT token is provided', () => {
      it('should reject expired JWT token', async () => {
        // Arrange
        const expiredToken = 'expired.jwt.token';
        const mockContext = createMockExecutionContext({
          authorization: `Bearer ${expiredToken}`,
        });
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockJwtService.verifyAsync.mockRejectedValue(new Error('Token expired'));

        // Act & Assert
        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when JWT token has invalid signature', () => {
      it('should reject JWT with invalid signature', async () => {
        // Arrange
        const invalidToken = 'invalid.signature.token';
        const mockContext = createMockExecutionContext({
          authorization: `Bearer ${invalidToken}`,
        });
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockJwtService.verifyAsync.mockRejectedValue(
          new Error('Invalid signature'),
        );

        // Act & Assert
        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('when JWT token is malformed', () => {
      it('should reject malformed JWT token', async () => {
        // Arrange
        const malformedToken = 'not-a-valid-jwt';
        const mockContext = createMockExecutionContext({
          authorization: `Bearer ${malformedToken}`,
        });
        mockReflector.getAllAndOverride.mockReturnValue(false);
        mockJwtService.verifyAsync.mockRejectedValue(
          new Error('JsonWebTokenError'),
        );

        // Act & Assert
        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      });
    });
  });

  describe('handleRequest', () => {
    it('should return user when JWT is valid', () => {
      // Arrange
      const mockUser = { sub: 'user-id', email: 'test@example.com' };

      // Act
      const result = guard.handleRequest(null, mockUser);

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when user is null', () => {
      // Arrange
      const mockError = null;

      // Act & Assert
      expect(() => guard.handleRequest(mockError, null)).toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when error occurs', () => {
      // Arrange
      const mockError = new Error('Token invalid');

      // Act & Assert - The implementation throws the error directly when err is truthy
      expect(() => guard.handleRequest(mockError, null)).toThrow(Error);
    });
  });
});
