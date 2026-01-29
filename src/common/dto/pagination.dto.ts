import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standard pagination query parameters
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Number of items to return (1-50)',
    default: 10,
    minimum: 1,
    maximum: 50,
    example: 10,
  })
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Number of items to skip (offset)',
    default: 0,
    minimum: 0,
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  offset?: number = 0;
}
