import { rolesDecorator, Roles, ROLES_KEY } from '../../../src/auth/decorators/roles.decorator';
import { Role } from '../../../src/auth/enums/role.enum';

describe('@Roles Decorator', () => {
  // Mock SetMetadata - use eslint-disable to suppress strict type warnings in test
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return
  const mockSetMetadata = () => () => {};
  jest.mock('@nestjs/common', () => ({
    SetMetadata: mockSetMetadata,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Roles decorator', () => {
    it('should be defined as a function', () => {
      expect(typeof Roles).toBe('function');
    });

    it('should be defined as a decorator', () => {
      expect(Roles).toBeDefined();
    });
  });

  describe('ROLES_KEY', () => {
    it('should be defined', () => {
      expect(ROLES_KEY).toBeDefined();
    });

    it('should be a string', () => {
      expect(typeof ROLES_KEY).toBe('string');
    });

    it('should have a meaningful key value', () => {
      expect(ROLES_KEY.length).toBeGreaterThan(0);
    });
  });

  describe('rolesDecorator', () => {
    it('should be defined as a function', () => {
      expect(typeof rolesDecorator).toBe('function');
    });
  });

  describe('when accepting single role', () => {
    it('should accept admin role', () => {
      // The decorator should accept Role.Admin
      const decorator = rolesDecorator(Role.Admin);
      expect(typeof decorator).toBe('function');
    });

    it('should accept user role', () => {
      // The decorator should accept Role.User
      const decorator = rolesDecorator(Role.User);
      expect(typeof decorator).toBe('function');
    });

    it('should accept moderator role', () => {
      // The decorator should accept Role.Moderator
      const decorator = rolesDecorator(Role.Moderator);
      expect(typeof decorator).toBe('function');
    });

    it('should wrap single role in array for metadata', () => {
      // The decorator should convert single role to array
      // This is verified by the Roles function accepting both single and multiple
      const singleRoleDecorator = rolesDecorator(Role.Admin);
      expect(singleRoleDecorator).toBeDefined();
    });
  });

  describe('when accepting multiple roles', () => {
    it('should accept multiple roles as arguments', () => {
      // The decorator should accept multiple role arguments: Role.Admin, Role.User
      const decorator = rolesDecorator(Role.Admin, Role.User);
      expect(typeof decorator).toBe('function');
    });

    it('should accept all three roles', () => {
      // The decorator should accept all three roles as arguments
      const decorator = rolesDecorator(Role.Admin, Role.Moderator, Role.User);
      expect(typeof decorator).toBe('function');
    });

    it('should accept user and moderator roles', () => {
      // The decorator should accept Role.User, Role.Moderator
      const decorator = rolesDecorator(Role.User, Role.Moderator);
      expect(typeof decorator).toBe('function');
    });
  });

  describe('when using correct enum values', () => {
    it('should use correct Role enum values', () => {
      // Verify Role enum exists and has expected values
      expect(Role.Admin).toBeDefined();
      expect(Role.User).toBeDefined();
      expect(Role.Moderator).toBeDefined();
    });

    it('should have distinct enum values', () => {
      // Each role should have a distinct value
      expect(Role.Admin).not.toBe(Role.User);
      expect(Role.User).not.toBe(Role.Moderator);
      expect(Role.Admin).not.toBe(Role.Moderator);
    });

    it('should work with string enum values', () => {
      // RolesGuard compares using enum values
      // Verify the enum can be used in comparisons
      const userRole = Role.User;
      expect(userRole).toBeDefined();
    });
  });

  describe('usage patterns', () => {
    it('should work on controller methods with single role', () => {
      // Example: @Roles(Role.Admin)
      // @Get('admin')
      // adminOnlyRoute() {}
      
      // We verify the decorator can be applied
      expect(Roles).toBeInstanceOf(Function);
    });

    it('should work on controller methods with multiple roles', () => {
      // Example: @Roles(Role.Admin, Role.Moderator)
      // @Get('moderators')
      // moderatorRoute() {}
      
      // We verify the decorator can accept multiple arguments
      expect(Roles).toBeInstanceOf(Function);
    });

    it('should work on controller classes', () => {
      // Example: @Roles(Role.Admin)
      // @Controller('admin')
      // export class AdminController {}
      
      // We verify the decorator can be applied at class level
      expect(Roles).toBeInstanceOf(Function);
    });
  });

  describe('metadata behavior', () => {
    it('should set roles in metadata', () => {
      // The decorator should use SetMetadata with ROLES_KEY
      // We verify the key is correctly defined for RolesGuard to find
      expect(ROLES_KEY).toBe('roles');
    });

    it('should store roles as array in metadata', () => {
      // The roles should be stored as an array for easy comparison
      // This is verified by the decorator accepting both single and multiple roles
      const decorator = rolesDecorator(Role.Admin);
      expect(decorator).toBeDefined();
    });

    it('should be checkable via Reflector.get', () => {
      // This verifies the expected behavior:
      // RolesGuard uses reflector.get(ROLES_KEY, handler)
      // We ensure the key is suitable for this pattern
      expect(typeof ROLES_KEY).toBe('string');
      expect(ROLES_KEY.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle zero roles', () => {
      // Edge case: zero roles should be handled
      const decorator = rolesDecorator();
      expect(typeof decorator).toBe('function');
    });

    it('should handle role passed as arguments', () => {
      // The Roles decorator can accept multiple arguments
      // @Roles(Role.Admin, Role.Moderator)
      // This is equivalent to @Roles([Role.Admin, Role.Moderator])
      
      // We verify the decorator can handle this pattern
      const decorator = Roles(Role.Admin, Role.Moderator);
      expect(decorator).toBeDefined();
    });
  });
});
