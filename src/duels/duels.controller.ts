import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ClerkGuard } from '../auth/clerk.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { DuelsService } from './duels.service';
import { CreateDuelDto } from './dtos/create-duel.dto';
import { User } from '../users/user.entity';

function sanitizeUser(user?: User) {
  if (!user) return undefined;
  return {
    id: user.id,
    clerkId: user.clerkId,
    firstName: user.firstName,
    lastName: user.lastName,
    profilePictureUrl: user.profilePictureUrl,
  };
}

@ApiTags('duels')
@ApiBearerAuth()
@Controller('duels')
@UseGuards(ClerkGuard)
export class DuelsController {
  constructor(private readonly duelsService: DuelsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new duel challenge' })
  async createDuel(
    @CurrentUser('clerkId') clerkId: string,
    @Body() dto: CreateDuelDto,
  ) {
    return this.duelsService.createDuel(clerkId, dto);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept a duel challenge' })
  async acceptDuel(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    return this.duelsService.acceptDuel(id, clerkId);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a duel challenge' })
  async declineDuel(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    return this.duelsService.declineDuel(id, clerkId);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get my duels' })
  async getMyDuels(
    @CurrentUser('clerkId') clerkId: string,
    @Query('status') status?: string,
  ) {
    const duels = await this.duelsService.getMyDuels(clerkId, status);

    return duels.map((duel) => ({
      ...duel,
      challengerUser: sanitizeUser(duel.challengerUser),
      challengedUser: sanitizeUser(duel.challengedUser),
    }));
  }

  @Public()
  @Get('feed')
  @ApiOperation({ summary: 'Get public duel feed (resolved duels)' })
  async getDuelFeed(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const result = await this.duelsService.getDuelFeed(
      limit ?? 10,
      offset ?? 0,
    );

    return {
      ...result,
      data: result.data.map((duel) => ({
        ...duel,
        challengerUser: sanitizeUser(duel.challengerUser),
        challengedUser: sanitizeUser(duel.challengedUser),
      })),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a pending duel (challenger only)' })
  async cancelDuel(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    await this.duelsService.cancelDuel(id, clerkId);
  }
}
