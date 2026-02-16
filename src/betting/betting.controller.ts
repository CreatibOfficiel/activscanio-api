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
}
