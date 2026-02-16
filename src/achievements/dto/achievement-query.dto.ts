import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  AchievementCategory,
  AchievementDomain,
  AchievementRarity,
} from '../entities/achievement.entity';

/**
 * Query DTO for listing achievements
 */
export class AchievementQueryDto {
  @IsOptional()
  @IsEnum(AchievementCategory)
  category?: AchievementCategory;

  @IsOptional()
  @IsEnum(AchievementRarity)
  rarity?: AchievementRarity;

  @IsOptional()
  @IsEnum(AchievementDomain)
  domain?: AchievementDomain;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  unlockedOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  lockedOnly?: boolean;
}
