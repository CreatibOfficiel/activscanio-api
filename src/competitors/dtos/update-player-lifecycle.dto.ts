import { IsBoolean, IsISO8601, IsOptional, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdatePlayerLifecycleDto {
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsISO8601({ strict: true })
  leftAt?: string | null;

  @IsOptional()
  @IsBoolean()
  keepAnniversaryReminder?: boolean;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  contactUrl?: string | null;
}
