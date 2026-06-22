import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { EntityStatus } from '../../common/enums/entity-status.enum';
import { KycStatus } from '../../merchant/enums/kyc-status.enum';

/**
 * Query params for listing merchants in the admin console.
 */
export class MerchantFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: EntityStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  kycStatus?: KycStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
