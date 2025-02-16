import { Controller, Get, Post, Body, Param, Put, Patch } from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dtos/create-competitor.dto';
import { UpdateCompetitorDto } from './dtos/update-competitor.dto';
import { RacesService } from 'src/races/races.service';

@Controller('competitors')
export class CompetitorsController {
  constructor(
    private competitorsService: CompetitorsService,
    private racesService: RacesService,
  ) {}

  // GET /competitors
  @Get()
  findAll() {
    return this.competitorsService.findAll();
  }

  // GET /competitors/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.competitorsService.findOne(id);
  }

  // GET /competitors/:competitorId/recent-races
  @Get(':competitorId/recent-races')
  getRecentRacesForCompetitor(@Param('competitorId') competitorId: string) {
    return this.racesService.getRecentRacesForCompetitor(competitorId);
  }

  // POST /competitors
  @Post()
  create(@Body() dto: CreateCompetitorDto) {
    return this.competitorsService.create(dto);
  }

  // PUT /competitors/:id
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    return this.competitorsService.update(id, dto);
  }

  // PATCH /competitors/:id
  @Patch(':id')
  partialUpdate(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    return this.competitorsService.update(id, dto);
  }
}
