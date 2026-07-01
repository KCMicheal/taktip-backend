import { IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationParamsDto } from '../../common/pagination';
import { TransactionType } from '../enums/transaction-type.enum';
import { TransactionStatus } from '../enums/transaction-status.enum';

/**
 * Query params DTO for GET /customer/wallet/transactions.
 *
 * Extends standard pagination with optional server-side filters:
 * - type:   single TransactionType value (e.g. 1 = DEPOSIT, 2 = WITHDRAW, etc.)
 * - status: single TransactionStatus value (e.g. 1 = PENDING, 2 = COMPLETED, 3 = FAILED)
 */
export class TransactionHistoryQueryDto extends PaginationParamsDto {
  @ApiPropertyOptional({
    description: 'Filter by transaction type (single value)',
    enum: TransactionType,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({
    description: 'Filter by transaction status (single value)',
    enum: TransactionStatus,
    example: 2,
  })
  @IsOptional()
  @Type(() => Number)
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
}
