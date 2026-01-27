/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Controller,
  Post,
  Get,
  Query,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { RacesService } from './races.service';
import { CreateRaceDto } from './dtos/create-race.dto';

@Controller('races')
export class RacesController {
  private readonly logger = new Logger(RacesController.name);

  constructor(private racesService: RacesService) {}

  // POST /races
  @Post()
  async createRace(@Body() dto: CreateRaceDto) {
    try {
      const race = await this.racesService.createRace(dto);
      return race;
    } catch (error) {
      this.logger.error('Error creating race:', error.stack);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        error.message || 'Error creating race',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
      this.logger.error('Error finding races:', error.stack);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        error.message || 'Error finding races',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
      this.logger.error('Error finding similar races:', error.stack);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        error.message || 'Error finding similar races',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
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
      this.logger.error('Error finding race:', error.stack);
      throw new HttpException(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        error.message || 'Error finding race',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
