import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for verifying a Paystack wallet deposit after redirect.
 * The front-end calls this after Paystack redirects the user back to the app.
 */
export class VerifyDepositDto {
  @ApiProperty({
    example: 'TXT-1712345678-abc',
    description: 'Paystack transaction reference returned by the deposit initiation endpoint',
  })
  @IsString()
  reference: string;
}
