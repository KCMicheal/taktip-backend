/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TokenService } from '@/auth/services/token.service';
import { RefreshToken } from '@/auth/entities/refresh-token.entity';
import { JwtService } from '@/auth/services/jwt.service';
import { Role } from '@/auth/enums/role.enum';

jest.mock('bcrypt');
jest.mock('jose');

describe('TokenService', () => {
  let tokenService: TokenService;
  let jwtService: jest.Mocked<JwtService>;

  const mockRefreshTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn().mockResolvedValue('mock-access-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string, defaultValue: string) => {
      if (key === 'REFRESH_TOKEN_EXPIRY_DAYS') return defaultValue;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    })
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
      .compile();

    tokenService = module.get<TokenService>(TokenService);
    jwtService = module.get(JwtService);
  });

  describe('generateTokenPair', () => {
    it('should generate access token, refresh token and store hash', async () => {
      const userId = 'user-uuid';
      const role = Role.MERCHANT;
      const mockAccessToken = 'mock-access-token';

      mockJwtService.sign.mockResolvedValue(mockAccessToken);
      mockRefreshTokenRepository.create.mockReturnValue({
        id: 'refresh-token-id',
        tokenHash: 'hashed-token',
        userId,
        expiresAt: new Date(),
      } as RefreshToken);
      mockRefreshTokenRepository.save.mockResolvedValue({} as RefreshToken);

      const result = await tokenService.generateTokenPair(userId, role);

      expect(result).toMatchObject({
        accessToken: mockAccessToken,
        expiresIn: 1800,
        tokenType: 'Bearer',
      });
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken.length).toBe(128); // 64 bytes in hex

      expect(jwtService.sign).toHaveBeenCalledWith(
        { sub: userId, role },
        '30m',
      );
      expect(mockRefreshTokenRepository.create).toHaveBeenCalled();
      expect(mockRefreshTokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('validateRefreshToken', () => {
    it('should return refresh token entity when valid', async () => {
      const token = 'valid-token';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const storedToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        userId: 'user-id',
        expiresAt: futureDate,
        revoked: false,
        user: {
          id: 'user-id',
          role: Role.MERCHANT,
        },
      } as RefreshToken;

      mockRefreshTokenRepository.find.mockResolvedValue([storedToken]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tokenService.validateRefreshToken(token);

      expect(result).toBeDefined();
      expect(result?.id).toBe('token-id');
    });

    it('should return null when no matching token found', async () => {
      mockRefreshTokenRepository.find.mockResolvedValue([]);

      const result = await tokenService.validateRefreshToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null when token is expired', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const storedToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        userId: 'user-id',
        expiresAt: pastDate,
        revoked: false,
      } as RefreshToken;

      mockRefreshTokenRepository.find.mockResolvedValue([storedToken]);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tokenService.validateRefreshToken('expired-token');

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should revoke valid refresh token', async () => {
      const token = 'valid-token';
      const ipAddress = '127.0.0.1';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const storedToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        userId: 'user-id',
        expiresAt: futureDate,
        revoked: false,
      } as RefreshToken;

      mockRefreshTokenRepository.find.mockResolvedValue([storedToken]);
      mockRefreshTokenRepository.save.mockResolvedValue({} as RefreshToken);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tokenService.revokeRefreshToken(token, ipAddress);

      expect(result).toBe(true);
      expect(mockRefreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked: true,
          revokedAt: expect.any(Date) as Date,
          revokedByIp: ipAddress,
        }),
      );
    });

    it('should return false when token not found', async () => {
      mockRefreshTokenRepository.find.mockResolvedValue([]);

      const result = await tokenService.revokeRefreshToken('invalid-token');

      expect(result).toBe(false);
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for user', async () => {
      mockRefreshTokenRepository.update.mockResolvedValue({ affected: 3 } as any);

      const result = await tokenService.revokeAllUserTokens('user-id');

      expect(result).toBe(3);
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: 'user-id', revoked: false },
        { revoked: true, revokedAt: expect.any(Date) as Date },
      );
    });
  });

  describe('refreshTokenPair', () => {
    it('should generate new token pair from valid refresh token', async () => {
      const oldRefreshToken = 'old-refresh-token';
      const newAccessToken = 'new-access-token';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      const storedToken = {
        id: 'token-id',
        tokenHash: 'hashed-token',
        userId: 'user-id',
        expiresAt: futureDate,
        revoked: false,
        user: {
          id: 'user-id',
          role: Role.MERCHANT,
        },
      } as RefreshToken;

      mockRefreshTokenRepository.find.mockResolvedValue([storedToken]);
      mockRefreshTokenRepository.save.mockResolvedValue({} as RefreshToken);
      mockJwtService.sign.mockResolvedValue(newAccessToken);
      mockRefreshTokenRepository.create.mockReturnValue({} as RefreshToken);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await tokenService.refreshTokenPair(oldRefreshToken);

      expect(result).toBeDefined();
      expect(result?.tokens.accessToken).toBe(newAccessToken);
      expect(result?.userId).toBe('user-id');
      expect(result?.role).toBe(Role.MERCHANT);
    });

    it('should return null for invalid refresh token', async () => {
      mockRefreshTokenRepository.find.mockResolvedValue([]);

      const result = await tokenService.refreshTokenPair('invalid-token');

      expect(result).toBeNull();
    });
  });
});
