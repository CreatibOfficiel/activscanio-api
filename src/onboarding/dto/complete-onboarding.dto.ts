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
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  // Flag to indicate user is spectator only (no competitor/character)
  @IsBoolean()
  @IsOptional()
  isSpectator?: boolean;

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
