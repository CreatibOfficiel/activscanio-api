import { IsString, IsUrl, IsInt, IsNumber } from 'class-validator';

export class CreateCompetitorDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsUrl()
  profilePictureUrl: string;

  @IsInt()
  elo: number;

  @IsInt()
  rank: number;

  @IsInt()
  raceCount: number;

  @IsNumber()
  avgRank12: number;
}
