import { IsOptional, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMerchantSettingsDto {
  @ApiPropertyOptional({
    description: 'Tip policy configuration',
    example: {
      platformFeePercent: 5,
      minTipAmount: 100,
      maxTipAmount: 50000,
      allowCustomAmounts: true,
    },
  })
  @IsOptional()
  @IsObject()
  tipPolicy?: {
    platformFeePercent?: number;
    minTipAmount?: number;
    maxTipAmount?: number;
    allowCustomAmounts?: boolean;
  };
}
