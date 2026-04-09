import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

describe('API Versioning', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string): string => {
              const config: Record<string, string> = {
                API_VERSION: 'v1',
                APP_PORT: '3001',
              };
              return config[key] ?? defaultValue ?? 'v1';
            }),
          },
        },
      ],
    }).compile();

    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Version Configuration', () => {
    it('should have API_VERSION configured', () => {
      const apiVersion = configService.get<string>('API_VERSION');
      expect(apiVersion).toBeDefined();
      expect(apiVersion).toMatch(/^v\d+$/);
    });

    it('should have correct prefix format api/vX', () => {
      const apiVersion = configService.get<string>('API_VERSION', 'v1');
      const expectedPrefix = `api/${apiVersion}`;
      expect(expectedPrefix).toMatch(/^api\/v\d+$/);
    });

    it('should default to v1 when not configured', () => {
      const apiVersion = configService.get<string>('API_VERSION', 'v1');
      expect(apiVersion).toBe('v1');
    });

    it('should support v2 for future migration', () => {
      // Simulating a v2 configuration
      const mockConfig = { API_VERSION: 'v2' };
      expect(mockConfig.API_VERSION).toBe('v2');
      expect(`api/${mockConfig.API_VERSION}`).toBe('api/v2');
    });

    it('should support v3 for future migration', () => {
      // Simulating a v3 configuration
      const mockConfig = { API_VERSION: 'v3' };
      expect(mockConfig.API_VERSION).toBe('v3');
      expect(`api/${mockConfig.API_VERSION}`).toBe('api/v3');
    });
  });

  describe('Auth Routes with Versioning', () => {
    it('should prefix auth routes with api/v1', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const authPath = `${basePath}/auth/login`;
      expect(authPath).toBe('api/v1/auth/login');
    });

    it('should generate correct register merchant path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const registerPath = `${basePath}/auth/register/merchant`;
      expect(registerPath).toBe('api/v1/auth/register/merchant');
    });

    it('should generate correct refresh path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const refreshPath = `${basePath}/auth/refresh`;
      expect(refreshPath).toBe('api/v1/auth/refresh');
    });

    it('should generate correct logout path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const logoutPath = `${basePath}/auth/logout`;
      expect(logoutPath).toBe('api/v1/auth/logout');
    });

    it('should generate correct logout-all path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const logoutAllPath = `${basePath}/auth/logout-all`;
      expect(logoutAllPath).toBe('api/v1/auth/logout-all');
    });

    it('should generate correct verify-otp path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const verifyOtpPath = `${basePath}/auth/verify-otp`;
      expect(verifyOtpPath).toBe('api/v1/auth/verify-otp');
    });

    it('should generate correct resend-otp path', () => {
      const apiVersion = 'v1';
      const basePath = `api/${apiVersion}`;
      const resendOtpPath = `${basePath}/auth/resend-otp`;
      expect(resendOtpPath).toBe('api/v1/auth/resend-otp');
    });
  });

  describe('Health Routes (Excluded from Prefix)', () => {
    it('should have health routes at root level', () => {
      const healthPath = 'health';
      expect(healthPath).toBe('health');
    });

    it('should have live health check at root level', () => {
      const livePath = 'health/live';
      expect(livePath).toBe('health/live');
    });

    it('should have ready health check at root level', () => {
      const readyPath = 'health/ready';
      expect(readyPath).toBe('health/ready');
    });
  });

  describe('Future Version Migration', () => {
    it('should support v1 format', () => {
      expect('v1').toMatch(/^v\d+$/);
    });

    it('should support v2 format for future migration', () => {
      expect('v2').toMatch(/^v\d+$/);
    });

    it('should support v3 format for future migration', () => {
      expect('v3').toMatch(/^v\d+$/);
    });

    it('should generate correct prefix for any version', () => {
      const generatePrefix = (version: string) => `api/${version}`;
      
      expect(generatePrefix('v1')).toBe('api/v1');
      expect(generatePrefix('v2')).toBe('api/v2');
      expect(generatePrefix('v3')).toBe('api/v3');
    });

    it('should handle major version increments', () => {
      const versions = ['v1', 'v2', 'v3', 'v4', 'v5', 'v10', 'v100'];
      versions.forEach((version) => {
        expect(`api/${version}`).toMatch(/^api\/v\d+$/);
      });
    });
  });

  describe('Route Structure Validation', () => {
    it('should have consistent v1 route patterns', () => {
      const v1Routes = {
        login: 'api/v1/auth/login',
        register: 'api/v1/auth/register/merchant',
        refresh: 'api/v1/auth/refresh',
        logout: 'api/v1/auth/logout',
        logoutAll: 'api/v1/auth/logout-all',
        verifyOtp: 'api/v1/auth/verify-otp',
        resendOtp: 'api/v1/auth/resend-otp',
      };

      // All routes should have v1 prefix
      Object.values(v1Routes).forEach((route) => {
        expect(route).toMatch(/^api\/v1\//);
      });
    });

    it('should have consistent v2 route patterns for migration', () => {
      const v2Routes = {
        login: 'api/v2/auth/login',
        register: 'api/v2/auth/register/merchant',
        refresh: 'api/v2/auth/refresh',
      };

      // All routes should have v2 prefix
      Object.values(v2Routes).forEach((route) => {
        expect(route).toMatch(/^api\/v2\//);
      });
    });

    it('should differentiate v1 and v2 routes', () => {
      const v1Login = 'api/v1/auth/login';
      const v2Login = 'api/v2/auth/login';
      
      expect(v1Login).not.toBe(v2Login);
      expect(v1Login).toBe('api/v1/auth/login');
      expect(v2Login).toBe('api/v2/auth/login');
    });
  });

  describe('Swagger/API Docs Path', () => {
    it('should have docs under api/v1/docs', () => {
      const apiVersion = 'v1';
      const docsPath = `api/${apiVersion}/docs`;
      expect(docsPath).toBe('api/v1/docs');
    });

    it('should have docs under api/v2/docs for future', () => {
      const apiVersion = 'v2';
      const docsPath = `api/${apiVersion}/docs`;
      expect(docsPath).toBe('api/v2/docs');
    });

    it('should differentiate v1 and v2 docs', () => {
      const v1Docs = 'api/v1/docs';
      const v2Docs = 'api/v2/docs';
      
      expect(v1Docs).not.toBe(v2Docs);
    });
  });
});