import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { SearchCompetitorDto } from './dto/search-competitor.dto';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Helper method to get userId from clerkId
   */
  private async getUserIdFromClerkId(clerkId: string): Promise<string> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) {
      throw new Error(`User with clerkId ${clerkId} not found`);
    }
    return user.id;
  }

  /**
   * GET /onboarding/search?query=john
   * Search for competitors by name
   * Rate limited to 20 requests per minute
   */
  @Get('search')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Search competitors by name' })
  @ApiQuery({
    name: 'query',
    description: 'Search query (min 2 characters)',
    example: 'john',
  })
  @ApiResponse({ status: 200, description: 'List of matching competitors' })
  @ApiResponse({ status: 400, description: 'Invalid query' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests (rate limit exceeded)',
  })
  async searchCompetitors(@Query() dto: SearchCompetitorDto) {
    return await this.onboardingService.searchCompetitors(dto.query);
  }

  /**
   * POST /onboarding/complete
   * Complete onboarding flow
   */
  @Post('complete')
  @ApiOperation({
    summary: 'Complete onboarding by linking competitor and character',
  })
  @ApiResponse({
    status: 200,
    description: 'Onboarding completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or already completed',
  })
  @ApiResponse({
    status: 404,
    description: 'Competitor or character variant not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Competitor or character already linked',
  })
  async completeOnboarding(
    @CurrentUser('clerkId') clerkId: string,
    @Body() dto: CompleteOnboardingDto,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.onboardingService.completeOnboarding(userId, dto);
  }
}
