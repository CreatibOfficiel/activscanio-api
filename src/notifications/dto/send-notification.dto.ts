import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, IsObject } from 'class-validator';

export enum NotificationCategory {
  BETTING = 'betting',
  ACHIEVEMENTS = 'achievements',
  RANKINGS = 'rankings',
  RACES = 'races',
  SPECIAL = 'special',
}

export class SendNotificationDto {
  @IsArray()
  @IsString({ each: true })
  userIds: string[]; // Can send to multiple users

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsEnum(NotificationCategory)
  category: NotificationCategory;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  badge?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsBoolean()
  requireInteraction?: boolean;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}
