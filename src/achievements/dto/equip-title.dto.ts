import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

/**
 * DTO for equipping a title
 */
export class EquipTitleDto {
  @IsString()
  @IsNotEmpty()
  achievementKey: string;
}

/**
 * Response DTO after equipping title
 */
export class EquipTitleResponseDto {
  userId: string;
  currentTitle: string | null;
  equippedAt: Date;
  message: string;
}
