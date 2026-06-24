import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { C2cTipFundingSource } from '../../tips/enums/c2c-tip-funding-source.enum';

export class SendCustomerTipDto {
  @ApiProperty({
    description: 'Recipient customer profile ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  @IsNotEmpty()
  recipientProfileId: string;

  @ApiProperty({
    description: 'Tip amount in NGN (min: 1, max: 50000)',
    example: 2000,
  })
  @IsNumber()
  @Min(1)
  @Max(50000)
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional message to accompany the tip',
    example: 'Great work!',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiProperty({
    description: 'Funding source: WALLET (1) = from balance, CARD (2) = via Paystack',
    enum: C2cTipFundingSource,
    example: 1,
  })
  @IsEnum(C2cTipFundingSource)
  fundingSource: C2cTipFundingSource;
}

export class SendCustomerTipResponseDto {
  @ApiProperty({ example: 'success' })
  status: string;

  @ApiProperty({
    description: 'The created tip record',
  })
  data: {
    tip: Record<string, unknown>;
    authorizationUrl?: string;
    reference?: string;
  };
}

export class SearchCustomersQueryDto {
  @ApiProperty({
    description: 'Search query (matches displayName, user firstName, lastName, or email)',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;

  @ApiPropertyOptional({
    description: 'Maximum results to return (default: 20, max: 50)',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
