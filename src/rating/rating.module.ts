import { Module } from '@nestjs/common';
import { RatingCalculationService } from './rating-calculation.service';

/**
 * Rating module
 *
 * Contains Glicko-2 rating calculation services.
 * Previously contained TrueSkill implementation which has been removed.
 */
@Module({
  providers: [RatingCalculationService],
  exports: [RatingCalculationService],
})
export class RatingModule {}
