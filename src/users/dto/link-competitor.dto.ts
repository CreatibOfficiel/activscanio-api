import { IsUUID } from 'class-validator';

export class LinkCompetitorDto {
  @IsUUID()
  competitorId: string;
}
