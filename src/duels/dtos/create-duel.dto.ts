import { IsUUID, IsIn } from 'class-validator';

export class CreateDuelDto {
  @IsUUID()
  challengedCompetitorId: string;

  @IsIn([5, 10, 25])
  stake: number;
}
