/**
 * Standard paginated result wrapper.
 *
 * Every list endpoint returning paginated data must use this shape so the
 * FE can rely on a consistent `{ items, total, page, limit }` contract
 * across the entire platform.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
