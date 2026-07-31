import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetScoreDto {
  @IsInt()
  @Min(0)
  @Max(99)
  a: number;

  @IsInt()
  @Min(0)
  @Max(99)
  b: number;
}

export class RecordMatchDto {
  @IsString()
  playerAId: string;

  @IsString()
  playerBId: string;

  /**
   * Set scores from player A's point of view. Two or three, best-of-three.
   *
   * The shape is checked here; the table tennis rules themselves (11 points,
   * two clear, no set after the match is decided) live in the service, so the
   * same validation applies whatever the entry point.
   */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets: SetScoreDto[];

  @IsOptional()
  playedAt?: Date;
}

export class EnrolPlayerDto {
  @IsString()
  competitorId: string;
}
