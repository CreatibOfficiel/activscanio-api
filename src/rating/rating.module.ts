import { Module } from '@nestjs/common';
import { RatingService } from './rating.service';

@Module({
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}
