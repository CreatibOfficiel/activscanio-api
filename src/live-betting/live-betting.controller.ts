import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { LiveBettingService } from './services/live-betting.service';
import { CreateLiveBetDto } from './dto/create-live-bet.dto';
import { ConfirmDetectionDto } from './dto/confirm-detection.dto';

@ApiTags('live-betting')
@ApiBearerAuth()
@Controller('live-betting')
@UseGuards(ClerkGuard)
export class LiveBettingController {
  constructor(private readonly liveBettingService: LiveBettingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new live bet with photo proof' })
  @UseInterceptors(FileInterceptor('photo'))
  async createLiveBet(
    @CurrentUser('clerkId') clerkId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateLiveBetDto,
  ) {
    if (!file) {
      throw new BadRequestException('Photo is required');
    }
    return this.liveBettingService.createLiveBet(
      clerkId,
      dto.competitorId,
      file,
    );
  }

  @Patch(':id/confirm')
  @ApiOperation({ summary: 'Confirm or correct detected players' })
  async confirmDetection(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
    @Body() dto: ConfirmDetectionDto,
  ) {
    return this.liveBettingService.confirmDetection(
      id,
      clerkId,
      dto.competitorIds,
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Get my active live bets' })
  async getActiveBets(@CurrentUser('clerkId') clerkId: string) {
    return this.liveBettingService.getActiveBets(clerkId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get my live bet history' })
  async getHistory(
    @CurrentUser('clerkId') clerkId: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const { data, total } = await this.liveBettingService.getHistory(
      clerkId,
      limit ?? 10,
      offset ?? 0,
    );
    return {
      data,
      meta: {
        total,
        limit: limit ?? 10,
        offset: offset ?? 0,
        hasMore: (offset ?? 0) + (limit ?? 10) < total,
      },
    };
  }

  @Public()
  @Get('recent')
  @ApiOperation({ summary: 'Get recent resolved live bets (public)' })
  async getRecent(@Query('limit') limit?: number) {
    return this.liveBettingService.getRecentResolved(limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific live bet' })
  async getLiveBet(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    return this.liveBettingService.getLiveBet(id, clerkId);
  }
}
