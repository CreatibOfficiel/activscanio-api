import {
  IsUUID,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BetPickDto {
  @IsUUID()
  competitorId: string;

  @IsBoolean()
  @IsOptional()
  hasBoost?: boolean;
}

export class PlaceBetDto {
  @IsUUID()
  bettingWeekId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BetPickDto)
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  picks: BetPickDto[]; // Must have exactly 3 picks (first, second, third)
}
