import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Base pagination query params.
 * All paginated list endpoints should accept these.
 */
export class PaginationParamsDto {
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
}

/**
 * Pagination params that also support a free-text search filter.
 * Used by endpoints that need server-side search (e.g. staff list).
 */
export class SearchablePaginationParamsDto extends PaginationParamsDto {
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Pagination params for invite listing with an optional status filter.
 */
export class InvitePaginationParamsDto extends PaginationParamsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2)
  status?: number;
}
