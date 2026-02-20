import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BettingService } from './betting.service';
import { PlaceBetDto } from './dto/place-bet.dto';
import { CreateBettingWeekDto } from './dto/create-betting-week.dto';
import { QueryBettingDto } from './dto/query-betting.dto';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UsersService } from '../users/users.service';
import { OddsCalculatorService } from './services/odds-calculator.service';
import { RankingsService } from './services/rankings.service';
import { PaginationQueryDto } from '../common';
import { QueryCommunityBetsDto } from './dto/query-community-bets.dto';

@ApiTags('betting')
@ApiBearerAuth()
@Controller('betting')
@UseGuards(ClerkGuard)
export class BettingController {
  constructor(
    private readonly bettingService: BettingService,
    private readonly usersService: UsersService,
    private readonly oddsCalculatorService: OddsCalculatorService,
    private readonly rankingsService: RankingsService,
  ) {}

  /**
   * Helper method to get userId from clerkId
   */
  private async getUserIdFromClerkId(clerkId: string): Promise<string> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) {
      throw new NotFoundException(`User with clerkId ${clerkId} not found`);
    }
    return user.id;
  }

  /**
   * Get current open week
   */
  @Public()
  @Get('current-week')
  @ApiOperation({ summary: 'Get the current open betting week' })
  @ApiResponse({ status: 200, description: 'Current open week details' })
  @ApiResponse({ status: 404, description: 'No open week found' })
  async getCurrentWeek() {
    return await this.bettingService.getCurrentWeek();
  }

  /**
   * Get all weeks (optionally filter by month/year)
   */
  @Public()
  @Get('weeks')
  @ApiOperation({ summary: 'Get all betting weeks with optional filters' })
  @ApiQuery({
    name: 'month',
    required: false,
    description: 'Filter by month (1-12)',
    example: '1',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Filter by year',
    example: '2024',
  })
  @ApiResponse({ status: 200, description: 'List of betting weeks' })
  async getWeeks(@Query() query: QueryBettingDto) {
    return await this.bettingService.getWeeks(query.month, query.year);
  }

  /**
   * Get week by ID
   */
  @Public()
  @Get('weeks/:weekId')
  @ApiOperation({ summary: 'Get a specific betting week by ID' })
  @ApiParam({ name: 'weekId', description: 'Betting week UUID' })
  @ApiResponse({ status: 200, description: 'Betting week details' })
  @ApiResponse({ status: 404, description: 'Week not found' })
  async getWeek(@Param('weekId') weekId: string) {
    return await this.bettingService.getWeekById(weekId);
  }

  /**
   * Get current odds for a week
   */
  @Public()
  @Get('weeks/:weekId/odds')
  @ApiOperation({ summary: 'Get current betting odds for a week' })
  @ApiParam({ name: 'weekId', description: 'Betting week UUID' })
  @ApiResponse({ status: 200, description: 'Current odds for all competitors' })
  @ApiResponse({ status: 404, description: 'Week not found' })
  async getOdds(@Param('weekId') weekId: string) {
    return await this.bettingService.getCurrentOdds(weekId);
  }

  /**
   * Get eligible competitors for a week (lifetime calibration + 30-day activity)
   */
  @Public()
  @Get('weeks/:weekId/eligible-competitors')
  @ApiOperation({ summary: 'Get eligible competitors for a week' })
  @ApiParam({ name: 'weekId', description: 'Betting week UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of eligible competitors with stats',
  })
  @ApiResponse({ status: 404, description: 'Betting week not found' })
  async getEligibleCompetitors(@Param('weekId') weekId: string) {
    return await this.oddsCalculatorService.getEligibleCompetitors(weekId);
  }

  /**
   * Recalculate odds for a week (admin trigger)
   */
  @Public()
  @Post('weeks/:weekId/recalculate-odds')
  @ApiOperation({ summary: 'Recalculate odds for a betting week' })
  @ApiParam({ name: 'weekId', description: 'Betting week UUID' })
  @ApiResponse({ status: 200, description: 'Odds recalculated successfully' })
  @ApiResponse({ status: 404, description: 'Week not found' })
  async recalculateOdds(@Param('weekId') weekId: string) {
    return await this.oddsCalculatorService.calculateOddsForWeek(weekId);
  }

  /**
   * Create a new betting week (admin only for now)
   */
  @Post('weeks')
  @ApiOperation({ summary: 'Create a new betting week (admin only)' })
  @ApiResponse({
    status: 201,
    description: 'Betting week created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiResponse({ status: 409, description: 'Betting week already exists' })
  async createWeek(@Body() createWeekDto: CreateBettingWeekDto) {
    return await this.bettingService.createWeek(createWeekDto);
  }

  /**
   * Place a bet
   */
  @Post('bets')
  @ApiOperation({ summary: 'Place a bet on competitors for the current week' })
  @ApiResponse({ status: 201, description: 'Bet placed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid bet data or week is closed',
  })
  @ApiResponse({ status: 404, description: 'User or week not found' })
  @ApiResponse({ status: 409, description: 'User already bet for this week' })
  async placeBet(
    @CurrentUser('clerkId') clerkId: string,
    @Body() placeBetDto: PlaceBetDto,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.bettingService.placeBet(userId, placeBetDto);
  }

  /**
   * Get community bets (all users, public)
   */
  @Public()
  @Get('bets/community')
  @ApiOperation({ summary: 'Get all community bets with pagination and filters' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items (1-50)', example: 10 })
  @ApiQuery({ name: 'offset', required: false, description: 'Items to skip', example: 0 })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by bet status', enum: ['pending', 'won', 'lost', 'cancelled'] })
  @ApiResponse({ status: 200, description: 'Paginated community bets' })
  async getCommunityBets(@Query() query: QueryCommunityBetsDto) {
    const result = await this.bettingService.getCommunityBets(
      query.limit ?? 10,
      query.offset ?? 0,
      query.userId,
      query.status,
    );

    // Whitelist user fields to avoid leaking sensitive data
    return {
      ...result,
      data: result.data.map((bet) => ({
        ...bet,
        user: bet.user
          ? {
              id: bet.user.id,
              firstName: bet.user.firstName,
              lastName: bet.user.lastName,
              profilePictureUrl: bet.user.profilePictureUrl,
              level: bet.user.level,
              currentTitle: bet.user.currentTitle,
            }
          : undefined,
      })),
    };
  }

  /**
   * Get my bets
   */
  @Get('bets/my-bets')
  @ApiOperation({
    summary: 'Get all my bets with pagination or filter by week',
  })
  @ApiQuery({
    name: 'weekId',
    required: false,
    description: 'Filter by betting week UUID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of items to return (1-50)',
    example: 10,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of items to skip',
    example: 0,
  })
  @ApiResponse({ status: 200, description: 'Paginated user bets' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getMyBets(
    @CurrentUser('clerkId') clerkId: string,
    @Query('weekId') weekId?: string,
    @Query() pagination?: PaginationQueryDto,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    if (weekId) {
      return await this.bettingService.getUserBet(userId, weekId);
    }
    return await this.bettingService.getUserBets(
      userId,
      pagination?.limit ?? 10,
      pagination?.offset ?? 0,
    );
  }

  /**
   * Check if user can use boost this month
   */
  @Get('boost-availability')
  @ApiOperation({
    summary: 'Check if user can use boost multiplier this month',
  })
  @ApiResponse({ status: 200, description: 'Boost availability status' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getBoostAvailability(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.bettingService.getBoostAvailability(userId);
  }

  /**
   * Get results for a finalized week
   */
  @Public()
  @Get('weeks/:weekId/results')
  @ApiOperation({ summary: 'Get betting results for a finalized week' })
  @ApiParam({ name: 'weekId', description: 'Betting week UUID' })
  @ApiResponse({
    status: 200,
    description: 'Week results with all bets and points',
  })
  @ApiResponse({ status: 404, description: 'Week not found' })
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
   */
  @Public()
  @Get('rankings/monthly')
  @ApiOperation({ summary: 'Get monthly rankings for bettors' })
  @ApiQuery({
    name: 'month',
    required: false,
    description: 'Filter by month (1-12)',
    example: '1',
  })
  @ApiQuery({
    name: 'year',
    required: false,
    description: 'Filter by year',
    example: '2024',
  })
  @ApiResponse({ status: 200, description: 'Monthly rankings with stats' })
  async getMonthlyRankings(@Query() query: QueryBettingDto) {
    return await this.rankingsService.getMonthlyRankings(
      query.month,
      query.year,
    );
  }

  /**
   * Get unseen bet result for current user
   */
  @Get('bets/unseen-result')
  @ApiOperation({ summary: 'Get most recent unseen finalized bet result' })
  @ApiResponse({ status: 200, description: 'Unseen bet result or null' })
  async getUnseenBetResult(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    const bet = await this.bettingService.getUnseenBetResult(userId);
    if (!bet) return null;

    const correctPicks = bet.picks.filter((p) => p.isCorrect).length;
    const hasBoost = bet.picks.some((p) => p.hasBoost);
    const isPerfectPodium = bet.picks.every((p) => p.isCorrect);
    const pointsBeforeBonus = bet.picks.reduce(
      (sum, p) => sum + (p.pointsEarned || 0),
      0,
    );
    const perfectPodiumBonus = isPerfectPodium ? pointsBeforeBonus : 0;

    return {
      betId: bet.id,
      weekId: bet.bettingWeekId,
      status: (bet.pointsEarned ?? 0) > 0 ? 'won' : 'lost',
      pointsEarned: bet.pointsEarned ?? 0,
      isPerfectPodium,
      perfectPodiumBonus,
      correctPicks,
      totalPicks: bet.picks.length,
      hasBoost,
      picks: bet.picks.map((p) => ({
        competitorName: p.competitor
          ? `${p.competitor.firstName} ${p.competitor.lastName}`
          : 'Unknown',
        position: p.position,
        isCorrect: p.isCorrect,
        oddAtBet: p.oddAtBet,
        hasBoost: p.hasBoost,
        pointsEarned: p.pointsEarned ?? 0,
        usedBogOdd: p.usedBogOdd ?? false,
      })),
    };
  }

  /**
   * Mark a bet result as seen
   */
  @Post('bets/:betId/mark-result-seen')
  @ApiOperation({ summary: 'Mark a bet result as seen' })
  @ApiParam({ name: 'betId', description: 'Bet UUID' })
  @ApiResponse({ status: 200, description: 'Result marked as seen' })
  async markBetResultSeen(
    @CurrentUser('clerkId') clerkId: string,
    @Param('betId') betId: string,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    await this.bettingService.markBetResultSeen(userId, betId);
    return { success: true };
  }

  /**
   * Get unseen streak losses for current user
   */
  @Get('streaks/unseen-losses')
  @ApiOperation({ summary: 'Get unseen streak losses (betting + play)' })
  @ApiResponse({ status: 200, description: 'Unseen streak losses' })
  async getUnseenStreakLosses(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.bettingService.getUnseenStreakLosses(userId);
  }

  /**
   * Mark all streak losses as seen
   */
  @Post('streaks/mark-losses-seen')
  @ApiOperation({ summary: 'Mark all streak losses as seen' })
  @ApiResponse({ status: 200, description: 'Streak losses marked as seen' })
  async markStreakLossesSeen(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    await this.bettingService.markStreakLossesSeen(userId);
    return { success: true };
  }
}
