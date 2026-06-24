import { IsUUID, IsNumber, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for tipping a staff member from the customer's wallet balance.
 * The customer's wallet is implicit (the authenticated customer's wallet).
 * The staff wallet is resolved from the staffProfileId.
 */
export class TipFromWalletDto {
  @ApiProperty({ example: 'staff-profile-uuid', description: 'Staff profile to tip' })
  @IsUUID()
  staffProfileId: string;

  @ApiProperty({ example: 500.0, description: 'Tip amount (minimum 1.00)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  amount: number;

  @ApiPropertyOptional({ example: 'Great service!', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
