import { ApiProperty } from '@nestjs/swagger';

/**
 * Metadata for pagination response
 */
export class PaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 100 })
  total: number;

  @ApiProperty({ description: 'Number of items returned', example: 10 })
  limit: number;

  @ApiProperty({ description: 'Number of items skipped', example: 0 })
  offset: number;

  @ApiProperty({ description: 'Whether there are more items', example: true })
  hasMore: boolean;
}

/**
 * Generic paginated response wrapper
 */
export class PaginatedResponse<T> {
  @ApiProperty({ isArray: true, description: 'Array of data items' })
  data: T[];

  @ApiProperty({ type: PaginationMeta, description: 'Pagination metadata' })
  meta: PaginationMeta;

  static create<T>(
    data: T[],
    total: number,
    limit: number,
    offset: number,
  ): PaginatedResponse<T> {
    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + data.length < total,
      },
    };
  }
}
