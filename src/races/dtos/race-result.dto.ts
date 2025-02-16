import { IsString, IsInt } from 'class-validator';

export class RaceResultDto {
  @IsString()
  competitorId: string;

  @IsInt()
  rank12: number;

  @IsInt()
  score: number;
}
