import { Injectable } from '@nestjs/common';
import { Repository, FindOptionsWhere, FindOptionsOrder, ObjectLiteral } from 'typeorm';
import { PaginatedResult } from './pagination-result.interface';

/**
 * Stateless utility that standardises paginated queries and responses.
 *
 * Two usage patterns:
 *
 * 1. **Simple find‑and‑count** — use `paginate()` when you just need
 *    `repository.findAndCount({ where, skip, take })`.
 *
 * 2. **Custom query builders** — build your own QueryBuilder with joins,
 *    filters, etc., call `.skip(skip).take(limit).getManyAndCount()`, then
 *    pass the raw result to `wrap()`.
 */
@Injectable()
export class PaginationService {
  /**
   * Simple pagination for Repository<T>.findAndCount().
   *
   * @example
   *   paginationService.paginate(repo, { walletId }, 1, 20, { order: { createdAt: 'DESC' } })
   */
  async paginate<T extends ObjectLiteral>(
    repository: Repository<T>,
    where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
    page: number,
    limit: number,
    options?: {
      order?: FindOptionsOrder<T>;
      relations?: string[];
    },
  ): Promise<PaginatedResult<T>> {
    const skip = this.getSkip(page, limit);

    const [items, total] = await repository.findAndCount({
      where,
      order: options?.order,
      relations: options?.relations,
      skip,
      take: limit,
    });

    return { items, total, page, limit };
  }

  /**
   * Wrap already-fetched items + total into a standard PaginatedResult.
   * Use this when you need a custom QueryBuilder (joins, ILIKE, etc.).
   */
  wrap<T>(items: T[], total: number, page: number, limit: number): PaginatedResult<T> {
    return { items, total, page, limit };
  }

  /**
   * Compute the OFFSET value for TypeORM skip/take or QueryBuilder.skip().
   */
  getSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }
}
