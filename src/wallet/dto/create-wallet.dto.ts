import { IsUUID, IsOptional, IsString, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({ example: 'merchant-uuid', description: 'UUID of the wallet owner (merchant, staff, customer, etc.)' })
  @IsUUID()
  ownerId: string;

  @ApiProperty({ example: 'merchant', description: 'Owner type discriminator: merchant, staff, customer, or independent' })
  @IsString()
  @IsIn(['merchant', 'staff', 'customer', 'independent'])
  ownerType: string;

  @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;
}
