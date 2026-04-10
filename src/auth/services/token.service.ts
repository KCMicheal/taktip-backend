import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { RefreshToken } from '../entities/refresh-token.entity';
import { JwtService } from './jwt.service';
import { Role } from '../enums/role.enum';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RefreshTokenResult {
  tokens: TokenPair;
  userId: string;
  role: Role;
}

export interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class TokenService {
  private readonly saltRounds = 10;
  private readonly accessTokenExpiry = '30m'; // 30 minutes
  private readonly refreshTokenExpiryDays: number;

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.refreshTokenExpiryDays = Number(
      this.configService.get('REFRESH_TOKEN_EXPIRY_DAYS', '7'),
    );
  }

  /**
   * Generate both access and refresh tokens
   */
  async generateTokenPair(userId: string, role: Role): Promise<TokenPair> {
    // Generate refresh token (random string)
    const refreshToken = randomBytes(64).toString('hex');
    const refreshTokenHash = await bcrypt.hash(refreshToken, this.saltRounds);

    // Calculate expiry date for refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiryDays);

    // Store refresh token hash in database
    const refreshTokenEntity = this.refreshTokenRepository.create({
      tokenHash: refreshTokenHash,
      userId,
      expiresAt,
    });
    await this.refreshTokenRepository.save(refreshTokenEntity);

    // Generate access token with JWT
    const payload: JwtPayload = { sub: userId, role };
    const accessToken = await this.jwtService.sign(payload, this.accessTokenExpiry);

    // Calculate expiresIn in seconds (30 minutes = 1800 seconds)
    const expiresIn = 30 * 60;

    return {
      accessToken,
      refreshToken,
      expiresIn,
      tokenType: 'Bearer',
    };
  }

  /**
   * Validate refresh token and return associated user data
   */
  async validateRefreshToken(token: string): Promise<RefreshToken | null> {
    // Find all active refresh tokens for this user (for comparison)
    const refreshTokens = await this.refreshTokenRepository.find({
      where: { revoked: false },
      relations: ['user'],
    });

    // Check each token
    for (const storedToken of refreshTokens) {
      const isValid = await bcrypt.compare(token, storedToken.tokenHash);
      if (isValid && storedToken.expiresAt > new Date()) {
        return storedToken;
      }
    }

    return null;
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(token: string, ipAddress?: string): Promise<boolean> {
    const refreshToken = await this.validateRefreshToken(token);

    if (!refreshToken) {
      return false;
    }

    refreshToken.revoked = true;
    refreshToken.revokedAt = new Date();
    refreshToken.revokedByIp = ipAddress || null;

    await this.refreshTokenRepository.save(refreshToken);
    return true;
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
    return result.affected || 0;
  }

  /**
   * Revoke old refresh tokens for a user (when logging in from same device)
   */
  async revokeOldTokensForUser(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
  }

  /**
   * Generate new token pair from valid refresh token
   * Returns user data along with tokens to avoid re-validation after revocation
   */
  async refreshTokenPair(
    refreshToken: string,
  ): Promise<RefreshTokenResult | null> {
    const storedToken = await this.validateRefreshToken(refreshToken);

    if (!storedToken || !storedToken.user) {
      return null;
    }

    // Save user data before revoking
    const userId = storedToken.userId;
    const role = storedToken.user.role;

    // Revoke the old refresh token
    await this.revokeRefreshToken(refreshToken);

    // Generate new token pair
    const tokens = await this.generateTokenPair(userId, role);

    return {
      tokens,
      userId,
      role,
    };
  }
}
