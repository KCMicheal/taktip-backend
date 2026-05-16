import { IsUUID, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({ example: 'merchant-uuid' })
  @IsUUID()
  merchantId: string;

  @ApiProperty({ example: 'NGN', required: false, default: 'NGN' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}
