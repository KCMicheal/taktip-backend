import { Injectable, OnModuleInit } from '@nestjs/common';
import * as jose from 'jose';
import * as fs from 'fs/promises';
import { JWTPayload } from 'jose';

@Injectable()
export class JwtService implements OnModuleInit {
  private privateKey!: string;
  private publicKey!: string;
  private edPrivateKey!: CryptoKey;
  private edPublicKey!: CryptoKey;
  
  // Ed25519 algorithm for JWT signing/verification
  private readonly algorithm = 'EdDSA';
  
  // Access token expiry: 15 minutes
  private readonly accessTokenExpiry = '15m';

  async onModuleInit() {
    // Read keys from filesystem - try relative path first, then absolute
    const keysPath = './keys';
    const basePath = process.cwd();
    
    try {
      this.privateKey = await fs.readFile(`${keysPath}/ed25519_private.pem`, 'utf8');
      this.publicKey = await fs.readFile(`${keysPath}/ed25519_public.pem`, 'utf8');
    } catch {
      // Fallback to absolute path for production
      this.privateKey = await fs.readFile(`${basePath}/keys/ed25519_private.pem`, 'utf8');
      this.publicKey = await fs.readFile(`${basePath}/keys/ed25519_public.pem`, 'utf8');
    }

    // Import keys for EdDSA
    this.edPrivateKey = await jose.importPKCS8(this.privateKey, this.algorithm);
    this.edPublicKey = await jose.importSPKI(this.publicKey, this.algorithm);
  }

  /**
   * Sign a JWT token with Ed25519 private key
   * @param payload - The payload to sign
   * @param expiresIn - Token expiration time (default: 15 minutes)
   * @returns Signed JWT token
   */
  async sign(payload: object, expiresIn: string = this.accessTokenExpiry): Promise<string> {
    return await new jose.SignJWT(payload as JWTPayload)
      .setProtectedHeader({ alg: this.algorithm })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.edPrivateKey);
  }

  /**
   * Sign an asynchronous JWT token with Ed25519 private key
   * @param payload - The payload to sign
   * @param options - Sign options
   * @returns Signed JWT token
   */
  async signAsync(payload: object, options?: { expiresIn?: string }): Promise<string> {
    const expiresIn = options?.expiresIn ?? this.accessTokenExpiry;
    
    return await new jose.SignJWT(payload as JWTPayload)
      .setProtectedHeader({ alg: this.algorithm })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(this.edPrivateKey);
  }

  /**
   * Verify a JWT token with Ed25519 public key
   * @param token - The token to verify
   * @returns Decoded payload
   */
  async verify(token: string): Promise<JWTPayload> {
    const { payload } = await jose.jwtVerify(token, this.edPublicKey, {
      algorithms: [this.algorithm],
    });
    return payload;
  }

  /**
   * Verify a JWT token asynchronously with Ed25519 public key
   * @param token - The token to verify
   * @returns Decoded payload
   */
  async verifyAsync(token: string): Promise<JWTPayload> {
    const { payload } = await jose.jwtVerify(token, this.edPublicKey, {
      algorithms: [this.algorithm],
    });
    return payload;
  }

  /**
   * Decode a JWT token without verification
   * @param token - The token to decode
   * @param options - Decode options
   * @returns Decoded payload or null
   */
  decode(token: string): JWTPayload | null {
    try {
      return jose.decodeJwt(token);
    } catch {
      return null;
    }
  }
}
