import { IsOptional, IsString, IsUrl, IsInt, IsNumber, IsUUID } from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional() @IsString()
  firstName?: string;

  @IsOptional() @IsString()
  lastName?: string;

  @IsOptional() @IsUrl()
  profilePictureUrl?: string;

  @IsOptional() @IsInt()
  rank?: number;

  @IsOptional() @IsInt()
  raceCount?: number;

  @IsOptional() @IsNumber()
  avgRank12?: number;

  @IsOptional() 
  @IsUUID()
  characterId?: string;
}
