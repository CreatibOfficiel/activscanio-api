import {
  IsUUID,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { StakeType, DuelConditionType } from '../duel.entity';

export class CreateDuelDto {
  @IsUUID()
  challengedCompetitorId: string;

  @IsEnum(StakeType)
  stakeType: StakeType;

  // Required when stakeType === CUSTOM (validated in the service).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  stakeLabel?: string;

  @IsOptional()
  @IsEnum(DuelConditionType)
  conditionType?: DuelConditionType;

  // Required for MARGIN_GREATER / MARGIN_BETWEEN (validated in the service).
  @IsOptional()
  @IsInt()
  @Min(1)
  conditionValue?: number;
}
