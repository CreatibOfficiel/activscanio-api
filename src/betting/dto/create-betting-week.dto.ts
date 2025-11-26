import { IsInt, IsDate, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { BettingWeekStatus } from '../entities/betting-week.entity';

export class CreateBettingWeekDto {
  @IsInt()
  weekNumber: number;

  @IsInt()
  year: number;

  @IsInt()
  month: number;

  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @IsDate()
  @Type(() => Date)
  endDate: Date;

  @IsEnum(BettingWeekStatus)
  @IsOptional()
  status?: BettingWeekStatus;
}
