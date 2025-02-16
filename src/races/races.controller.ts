import { Controller, Post, Get, Query, Param, Body } from '@nestjs/common';
import { RacesService } from './races.service';
import { CreateRaceDto } from './dtos/create-race.dto';

@Controller('races')
export class RacesController {
  constructor(private racesService: RacesService) {}

  // POST /races
  @Post()
  createRace(@Body() dto: CreateRaceDto) {
    return this.racesService.createRace(dto);
  }

  // GET /races?recent=true
  @Get()
  findAll(@Query('recent') recent: string) {
    const isRecent = recent === 'true';
    return this.racesService.findAll(isRecent);
  }

  // GET /races/:raceId/similar
  @Get(':raceId/similar')
  findSimilarRaces(@Param('raceId') raceId: string) {
    return this.racesService.findSimilarRaces(raceId);
  }

  // GET /races/:raceId
  @Get(':raceId')
  findOne(@Param('raceId') raceId: string) {
    return this.racesService.findOne(raceId);
  }
}
