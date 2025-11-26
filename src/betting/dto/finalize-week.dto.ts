import { IsUUID, IsOptional } from 'class-validator';

export class FinalizeWeekDto {
  @IsUUID()
  bettingWeekId: string;

  @IsOptional()
  @IsUUID()
  podiumFirstId?: string;

  @IsOptional()
  @IsUUID()
  podiumSecondId?: string;

  @IsOptional()
  @IsUUID()
  podiumThirdId?: string;
}
