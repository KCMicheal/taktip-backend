import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectPayoutDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting the payout', example: 'Insufficient funds' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
