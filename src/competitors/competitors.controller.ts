import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { RacesService } from 'src/races/races.service';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { LinkCharacterDto } from './dtos/link-character.dto';
import { sanitizeCompetitor } from './utils/sanitize-competitor';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { Public } from '../auth/decorators/public.decorator';

@Controller('competitors')
export class CompetitorsController {
  constructor(
    private competitorsService: CompetitorsService,
    private racesService: RacesService,
  ) {}

  /* ───────── LISTE & DÉTAIL ───────── */

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

  /* --- PUT / POST / DELETE qui renvoient un competitor --- */
  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    const updated = await this.competitorsService.update(id, dto);
    return sanitizeCompetitor(updated);
  }

  @Post(':id/character-variant')
  async linkVariant(@Param('id') id: string, @Body() dto: LinkCharacterDto) {
    const updated = await this.competitorsService.linkCharacterVariant(
      id,
      dto.characterVariantId,
    );
    return sanitizeCompetitor(updated);
  }

  @Delete(':id/character-variant')
  async unlinkVariant(@Param('id') id: string) {
    const updated = await this.competitorsService.unlinkCharacterVariant(id);
    return sanitizeCompetitor(updated);
  }

  /* ───────── RÉCENTES COURSES ───────── */

  @Get(':competitorId/recent-races')
  getRecentRaces(@Param('competitorId') competitorId: string) {
    return this.racesService.getRecentRacesForCompetitor(competitorId);
  }
}
