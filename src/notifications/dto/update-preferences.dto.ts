import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NotificationCategoriesDto {
  @IsOptional()
  @IsBoolean()
  betting?: boolean;

  @IsOptional()
  @IsBoolean()
  achievements?: boolean;

  @IsOptional()
  @IsBoolean()
  rankings?: boolean;

  @IsOptional()
  @IsBoolean()
  races?: boolean;

  @IsOptional()
  @IsBoolean()
  special?: boolean;
}

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  enablePush?: boolean;

  @IsOptional()
  @IsBoolean()
  enableInApp?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationCategoriesDto)
  categories?: NotificationCategoriesDto;
}
