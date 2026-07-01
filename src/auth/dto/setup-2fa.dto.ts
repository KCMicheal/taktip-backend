import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for 2FA setup — returned to the client,
 * not used as an input (setup requires no body, just auth).
 */
export class Setup2FaResponseDto {
  @ApiProperty({
    description: 'Base32-encoded TOTP secret for manual entry into authenticator app',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'QR code as a data URL for scanning with authenticator app',
    example: 'data:image/png;base64,iVBOR...',
  })
  qrCode: string;

  @ApiProperty({
    description: '10 single-use backup codes. Save these somewhere safe — they won\'t be shown again.',
    example: ['A1B2C3D4', 'E5F6G7H8'],
  })
  backupCodes: string[];
}
