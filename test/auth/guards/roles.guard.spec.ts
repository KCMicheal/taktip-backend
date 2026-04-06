import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { rolesGuard, RolesGuard } from '@/auth/guards/roles.guard';
import { Role } from '@/auth/enums/role.enum';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const mockReflector = {
    get: jest.fn(),
    getAllAndOverride: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    reflector = module.get<Reflector>(Reflector);
    guard = rolesGuard(reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    user: Record<string, unknown> | undefined | null,
    handler: Record<string, unknown> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
      getHandler: () => handler,
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('canActivate', () => {
    describe('when no roles are specified on endpoint', () => {
      it('should allow access when no roles are defined on endpoint', () => {
        // Arrange
        const mockUser = { sub: 'user-id', role: Role.STAFF };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue(undefined);

        // Act
        const result = guard.canActivate(mockContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access when roles metadata is null', () => {
        // Arrange
        const mockUser = { sub: 'user-id', role: Role.STAFF };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue(null);

        // Act
        const result = guard.canActivate(mockContext);

        // Assert
        expect(result).toBe(true);
      });
    });

    describe('when roles are specified on endpoint', () => {
      describe('and user has correct role', () => {
        it('should allow access for admin role on admin endpoint', () => {
          // Arrange
          const mockUser = { sub: 'user-id', role: Role.ADMIN };
          const mockContext = createMockExecutionContext(mockUser, {});
          mockReflector.get.mockReturnValue([Role.ADMIN]);

          // Act
          const result = guard.canActivate(mockContext);

          // Assert
          expect(result).toBe(true);
        });

        it('should allow access for staff role on staff endpoint', () => {
          // Arrange
          const mockUser = { sub: 'user-id', role: Role.STAFF };
          const mockContext = createMockExecutionContext(mockUser, {});
          mockReflector.get.mockReturnValue([Role.STAFF]);

          // Act
          const result = guard.canActivate(mockContext);

          // Assert
          expect(result).toBe(true);
        });

        it('should allow access when user has one of required roles', () => {
          // Arrange
          const mockUser = { sub: 'user-id', role: Role.MERCHANT };
          const mockContext = createMockExecutionContext(mockUser, {});
          mockReflector.get.mockReturnValue([Role.STAFF, Role.MERCHANT]);

          // Act
          const result = guard.canActivate(mockContext);

          // Assert
          expect(result).toBe(true);
        });
      });

      describe('and user has incorrect role', () => {
        it('should deny access for regular user on admin endpoint', () => {
          // Arrange
          const mockUser = { sub: 'user-id', role: Role.STAFF };
          const mockContext = createMockExecutionContext(mockUser, {});
          mockReflector.get.mockReturnValue([Role.ADMIN]);

          // Act & Assert
          expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
        });

        it('should deny access when user role is not in required roles', () => {
          // Arrange
          const mockUser = { sub: 'user-id', role: Role.STAFF };
          const mockContext = createMockExecutionContext(mockUser, {});
          mockReflector.get.mockReturnValue([Role.ADMIN, Role.MERCHANT]);

          // Act & Assert
          expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
        });
      });
    });

    describe('when user is not authenticated', () => {
      it('should deny access when no user object exists', () => {
        // Arrange
        const mockContext = createMockExecutionContext(undefined, {});
        mockReflector.get.mockReturnValue([Role.STAFF]);

        // Act & Assert
        expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      });

      it('should deny access when user object is null', () => {
        // Arrange
        const mockContext = createMockExecutionContext(null, {});
        mockReflector.get.mockReturnValue([Role.STAFF]);

        // Act & Assert
        expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      });

      it('should deny access when user has no role property', () => {
        // Arrange
        const mockUser = { sub: 'user-id' };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue([Role.STAFF]);

        // Act & Assert
        expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      });
    });

    describe('edge cases', () => {
      it('should handle empty roles array', () => {
        // Arrange
        const mockUser = { sub: 'user-id', role: Role.STAFF };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue([]);

        // Act
        const result = guard.canActivate(mockContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should handle case-sensitive role comparison', () => {
        // Arrange - 'staff' (lowercase) should NOT match Role.STAFF = 'STAFF' (uppercase)
        const mockUser = { sub: 'user-id', role: 'staff' };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue([Role.STAFF]);

        // Act & Assert
        expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      });

      it('should use exact enum value comparison', () => {
        // Arrange - role is a string 'superadmin' not Role.ADMIN enum
        const mockUser = { sub: 'user-id', role: 'superadmin' };
        const mockContext = createMockExecutionContext(mockUser, {});
        mockReflector.get.mockReturnValue([Role.ADMIN]);

        // Act & Assert - This should throw because 'superadmin' !== Role.ADMIN
        expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
      });
    });
  });
});
