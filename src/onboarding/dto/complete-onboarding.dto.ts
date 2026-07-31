import {
  IsUUID,
  IsOptional,
  ValidateNested,
  IsString,
  IsUrl,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SportPreference } from '../../users/user.entity';

export class CreateCompetitorInOnboardingDto {
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  @Matches(/^[a-zA-ZÀ-ÿ\s'-]+$/, {
    message:
      'First name can only contain letters, spaces, hyphens and apostrophes',
  })
  firstName: string;

  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  @Matches(/^[a-zA-ZÀ-ÿ\s'-]+$/, {
    message:
      'Last name can only contain letters, spaces, hyphens and apostrophes',
  })
  lastName: string;

  @IsUrl({}, { message: 'Profile picture URL must be a valid URL' })
  @IsOptional()
  profilePictureUrl?: string;
}

export class CompleteOnboardingDto {
  /**
   * Which sport the user plays. Decides whether a Mario Kart character is
   * required — it is a racing concept, meaningless to a ping-pong player.
   *
   * Replaces the old `isSpectator` flag, a betting-era distinction that
   * assigned UserRole.BETTOR. A ping-pong-only player needs the same shape
   * (competitor identity, no character) but is emphatically not a
   * spectator, and must not be filed under a role meaning "does not
   * compete".
   *
   * Optional so a client that predates the field can still onboard someone;
   * the service defaults it to BOTH.
   */
  @IsEnum(SportPreference)
  @IsOptional()
  sportPreference?: SportPreference;

  // Option 1: Link to existing competitor
  @IsUUID()
  @IsOptional()
  existingCompetitorId?: string;

  // Option 2: Create new competitor
  @ValidateNested()
  @Type(() => CreateCompetitorInOnboardingDto)
  @IsOptional()
  newCompetitor?: CreateCompetitorInOnboardingDto;

  // Character variant selection (now optional, required only for competitors)
  @IsUUID()
  @IsOptional()
  characterVariantId?: string;
}
