import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common';
import { BetStatus } from '../entities/bet.entity';

export class QueryCommunityBetsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by user ID',
    example: 'uuid-here',
  })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by bet status',
    enum: BetStatus,
    example: BetStatus.WON,
  })
  @IsEnum(BetStatus)
  @IsOptional()
  status?: BetStatus;
}
