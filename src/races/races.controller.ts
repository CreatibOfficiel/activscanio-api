import { Controller, Post, Get, Query, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { RacesService } from './races.service';
import { CreateRaceDto } from './dtos/create-race.dto';

@Controller('races')
export class RacesController {
  constructor(private racesService: RacesService) {}

  // POST /races
  @Post()
  async createRace(@Body() dto: CreateRaceDto) {
    try {
      const race = await this.racesService.createRace(dto);
      return race;
    } catch (error) {
      console.error('Error creating race:', error);
      throw new HttpException(
        error.message || 'Error creating race',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /races?recent=true
  @Get()
  async findAll(@Query('recent') recent: string) {
    try {
      const isRecent = recent === 'true';
      return await this.racesService.findAll(isRecent);
    } catch (error) {
      console.error('Error finding races:', error);
      throw new HttpException(
        error.message || 'Error finding races',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /races/:raceId/similar
  @Get(':raceId/similar')
  async findSimilarRaces(@Param('raceId') raceId: string) {
    try {
      return await this.racesService.findSimilarRaces(raceId);
    } catch (error) {
      console.error('Error finding similar races:', error);
      throw new HttpException(
        error.message || 'Error finding similar races',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // GET /races/:raceId
  @Get(':raceId')
  async findOne(@Param('raceId') raceId: string) {
    try {
      return await this.racesService.findOne(raceId);
    } catch (error) {
      console.error('Error finding race:', error);
      throw new HttpException(
        error.message || 'Error finding race',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
