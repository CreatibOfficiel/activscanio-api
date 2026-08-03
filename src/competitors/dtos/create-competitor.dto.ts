import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Creating a competitor.
 *
 * Only the name is required. Every rating and statistics column carries a
 * database default — rating 1500, rd 350, vol 0.06, counters at zero — so a
 * competitor can be created from a name alone, which is exactly what the
 * add-competitor screen offers.
 *
 * This DTO used to demand `mu` and `sigma`, TrueSkill vocabulary from before
 * the move to Glicko-2, plus `rank`, `raceCount` and `avgRank12` — all three
 * computed from race history and therefore unknowable at creation. It never
 * failed because nothing ran it: the project had no global ValidationPipe,
 * so the decorators were decorative. Installing the pipe made the DTO real
 * and the add screen started returning 400.
 *
 * The optional fields stay typed: a caller that does send a rating must send
 * a number, because a string would be stored and then break every comparison
 * downstream.
 */
export class CreateCompetitorDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  /**
   * Often empty for someone added by hand.
   *
   * `@IsOptional` alone would not do: it exempts undefined and null, but the
   * add screen sends an empty string, which @IsUrl then rejects. Treating ''
   * as absent is what makes the form completable without a photo.
   */
  @ValidateIf((_, value) => value !== undefined && value !== null && value !== '')
  @IsUrl()
  profilePictureUrl?: string;

  @IsOptional()
  @IsNumber()
  rating?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rd?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  vol?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  raceCount?: number;

  @IsOptional()
  @IsNumber()
  avgRank12?: number;
}
