import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { RacesService } from 'src/races/races.service';
import { UsersService } from 'src/users/users.service';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { LinkCharacterDto } from './dtos/link-character.dto';
import { sanitizeCompetitor } from './utils/sanitize-competitor';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('competitors')
export class CompetitorsController {
  constructor(
    private competitorsService: CompetitorsService,
    private racesService: RacesService,
    private usersService: UsersService,
  ) {}

  private async assertCompetitorOwnership(
    competitorId: string,
    clerkId: string,
  ): Promise<void> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user || user.competitorId !== competitorId) {
      throw new ForbiddenException(
        'Vous ne pouvez modifier que votre propre compétiteur',
      );
    }
  }

  /* ───────── LIST & DETAIL ───────── */

  /* --- GET all --- */
  @Public()
  @Get()
  async findAll() {
    const list = await this.competitorsService.findAll();
    return list.map(sanitizeCompetitor);
  }

  /* --- GET one --- */
  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const comp = await this.competitorsService.findOne(id);
    return comp ? sanitizeCompetitor(comp) : null;
  }

  /* --- POST --- */
  @Post()
  async create(@Body() dto: CreateCompetitorDto) {
    const created = await this.competitorsService.create(dto);
    return sanitizeCompetitor(created);
  }

  /* --- PUT / POST / DELETE returning a competitor --- */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCompetitorDto,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    await this.assertCompetitorOwnership(id, clerkId);
    const updated = await this.competitorsService.update(id, dto);
    return sanitizeCompetitor(updated);
  }

  @Post(':id/character-variant')
  async linkVariant(
    @Param('id') id: string,
    @Body() dto: LinkCharacterDto,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    await this.assertCompetitorOwnership(id, clerkId);
    const updated = await this.competitorsService.linkCharacterVariant(
      id,
      dto.characterVariantId,
    );
    return sanitizeCompetitor(updated);
  }

  @Delete(':id/character-variant')
  async unlinkVariant(
    @Param('id') id: string,
    @CurrentUser('clerkId') clerkId: string,
  ) {
    await this.assertCompetitorOwnership(id, clerkId);
    const updated = await this.competitorsService.unlinkCharacterVariant(id);
    return sanitizeCompetitor(updated);
  }

  /* ───────── ELO HISTORY ───────── */

  @Get(':id/elo-history')
  getEloHistory(
    @Param('id') id: string,
    @Query('days') daysStr?: string,
  ) {
    const days = daysStr ? parseInt(daysStr, 10) || undefined : undefined;
    return this.competitorsService.getEloHistory(id, days);
  }

  /* ───────── BEST SCORE ───────── */

  @Public()
  @Get(':competitorId/best-score')
  getBestScore(@Param('competitorId') competitorId: string) {
    return this.racesService.getBestScoreForCompetitor(competitorId);
  }

  /* ───────── RECENT RACES ───────── */

  @Get(':competitorId/recent-races')
  getRecentRaces(
    @Param('competitorId') competitorId: string,
    @Query('limit') limitStr?: string,
  ) {
    // Parse limit with default 3, max 10
    const limit = Math.min(Math.max(parseInt(limitStr || '3', 10) || 3, 1), 10);
    return this.racesService.getRecentRacesForCompetitor(competitorId, limit);
  }
}
