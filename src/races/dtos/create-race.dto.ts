import { IsISO8601, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RaceResultDto } from './race-result.dto';

export class CreateRaceDto {
  @IsISO8601()
  date: string; // e.g. 2025-02-12T19:30:00Z

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RaceResultDto)
  results: RaceResultDto[];
}
