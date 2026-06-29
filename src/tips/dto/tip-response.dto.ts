import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Unified tip response DTO used by ALL tip endpoints (staff, merchant, customer).
 *
 * Guarantees a consistent contract for the FE:
 * - `senderName`    – person who sent the tip (customer or "Guest")
 * - `recipientName` – person who received it (staff or customer)
 * - `merchantName`  – merchant context (staff tips) or null (C2C tips)
 */
export class TipResponseDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 500.0 })
  amount: number;

  @ApiProperty({ example: 'NGN' })
  currency: string;

  @ApiPropertyOptional({ example: 'Great service!' })
  message?: string;

  @ApiPropertyOptional({ example: 5 })
  rating?: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;

  // ── Unified name fields ────────────────────────────────────────────────

  @ApiPropertyOptional({ example: 'John Doe', description: 'Name of the sender (customer or "Guest")' })
  senderName?: string;

  @ApiPropertyOptional({ example: 'Jane Staff', description: 'Name of the recipient (staff or customer)' })
  recipientName?: string;

  @ApiPropertyOptional({ example: 'Acme Corp', description: 'Merchant name (null for C2C tips)' })
  merchantName?: string;

  // ── IDs for reference ───────────────────────────────────────────────────

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Merchant UUID' })
  merchantId?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001', description: 'Staff profile UUID (recipient for staff tips, recipient for C2C)' })
  staffProfileId?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002', description: 'Customer profile UUID of the sender' })
  customerProfileId?: string | null;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440003', description: 'QR code UUID that initiated this tip' })
  qrCodeId?: string | null;

  // ── Discriminators ─────────────────────────────────────────────────────

  @ApiProperty({ example: 1, description: 'TipSource enum (1=GUEST, 2=WALLET, 3=CUSTOMER_TO_CUSTOMER)' })
  source: number;

  @ApiProperty({ example: 2, description: 'TipStatus enum (1=PENDING, 2=COMPLETED, 3=FAILED)' })
  tipStatus: number;

  @ApiPropertyOptional({ example: 'customer', description: "Recipient type discriminator — 'customer' for C2C, null for staff tips" })
  recipientType?: string | null;
}
