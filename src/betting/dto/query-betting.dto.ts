import { IsInt, IsOptional, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryBettingDto {
  @IsInt()
  @Type(() => Number)
  @IsOptional()
  month?: number;

  @IsInt()
  @Type(() => Number)
  @IsOptional()
  year?: number;

  @IsUUID()
  @IsOptional()
  userId?: string;
}
