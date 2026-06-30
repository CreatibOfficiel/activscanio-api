import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @Get('balances')
  @ApiOperation({
    summary: 'Get who-owes-whom balances (À payer / À recevoir)',
  })
  async getBalances(@CurrentUser('clerkId') clerkId: string) {
    return this.duelsService.getBalances(clerkId);
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

  @Patch(':id/proof')
  @ApiOperation({
    summary: 'Upload payment proof and settle the duel (loser only)',
  })
  @UseInterceptors(FileInterceptor('photo'))
  async uploadProof(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Photo is required');
    }
    const duel = await this.duelsService.uploadProof(id, clerkId, file);
    return {
      ...duel,
      challengerUser: sanitizeUser(duel.challengerUser),
      challengedUser: sanitizeUser(duel.challengedUser),
    };
  }

  @Delete(':id/proof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo a settlement (loser only)' })
  async undoProof(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    const duel = await this.duelsService.undoProof(id, clerkId);
    return {
      ...duel,
      challengerUser: sanitizeUser(duel.challengerUser),
      challengedUser: sanitizeUser(duel.challengedUser),
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
