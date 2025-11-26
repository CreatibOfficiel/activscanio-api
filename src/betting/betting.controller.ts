import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BettingService } from './betting.service';
import { PlaceBetDto } from './dto/place-bet.dto';
import { CreateBettingWeekDto } from './dto/create-betting-week.dto';
import { QueryBettingDto } from './dto/query-betting.dto';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('betting')
@UseGuards(ClerkGuard)
export class BettingController {
  constructor(private readonly bettingService: BettingService) {}

  /**
   * Get current open week
   */
  @Public()
  @Get('current-week')
  async getCurrentWeek() {
    return await this.bettingService.getCurrentWeek();
  }

  /**
   * Get all weeks (optionally filter by month/year)
   */
  @Public()
  @Get('weeks')
  async getWeeks(@Query() query: QueryBettingDto) {
    return await this.bettingService.getWeeks(query.month, query.year);
  }

  /**
   * Get week by ID
   */
  @Public()
  @Get('weeks/:weekId')
  async getWeek(@Param('weekId') weekId: string) {
    return await this.bettingService.getWeekById(weekId);
  }

  /**
   * Get current odds for a week
   */
  @Public()
  @Get('weeks/:weekId/odds')
  async getOdds(@Param('weekId') weekId: string) {
    return await this.bettingService.getCurrentOdds(weekId);
  }

  /**
   * Get eligible competitors for a week (has at least 1 race)
   * This will be implemented in OddsCalculatorService
   */
  @Public()
  @Get('weeks/:weekId/eligible-competitors')
  async getEligibleCompetitors(@Param('weekId') weekId: string) {
    // TODO: Implement in OddsCalculatorService
    return { message: 'Not implemented yet' };
  }

  /**
   * Create a new betting week (admin only for now)
   */
  @Post('weeks')
  async createWeek(@Body() createWeekDto: CreateBettingWeekDto) {
    return await this.bettingService.createWeek(createWeekDto);
  }

  /**
   * Place a bet
   */
  @Post('bets')
  async placeBet(
    @CurrentUser('clerkId') clerkId: string,
    @Body() placeBetDto: PlaceBetDto,
  ) {
    // TODO: Get userId from clerkId via UsersService
    // For now, using clerkId as userId (will fix after integration)
    return await this.bettingService.placeBet(clerkId, placeBetDto);
  }

  /**
   * Get my bets
   */
  @Get('bets/my-bets')
  async getMyBets(
    @CurrentUser('clerkId') clerkId: string,
    @Query('weekId') weekId?: string,
  ) {
    // TODO: Get userId from clerkId
    if (weekId) {
      return await this.bettingService.getUserBet(clerkId, weekId);
    }
    return await this.bettingService.getUserBets(clerkId);
  }

  /**
   * Get results for a finalized week
   */
  @Public()
  @Get('weeks/:weekId/results')
  async getResults(@Param('weekId') weekId: string) {
    const bets = await this.bettingService.getWeekBets(weekId);
    const week = await this.bettingService.getWeekById(weekId);

    return {
      week,
      bets: bets.map((bet) => ({
        user: bet.user,
        picks: bet.picks,
        pointsEarned: bet.pointsEarned,
        isFinalized: bet.isFinalized,
      })),
    };
  }

  /**
   * Get monthly rankings
   * This will be implemented in a separate RankingsService
   */
  @Public()
  @Get('rankings/monthly')
  async getMonthlyRankings(@Query() query: QueryBettingDto) {
    // TODO: Implement in RankingsService
    return { message: 'Not implemented yet' };
  }
}
