import {
  IsOptional,
  IsString,
  IsInt,
  IsNumber,
  IsUUID,
  ValidateIf,
  Matches,
} from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|\/images\/)/, {
    message: 'profilePictureUrl must be a valid URL or internal path',
  })
  profilePictureUrl?: string;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsInt()
  raceCount?: number;

  @IsOptional()
  @IsNumber()
  avgRank12?: number;

  /**
   * id du CharacterVariant OU null pour retirer le lien.
   * On utilise ValidateIf pour pouvoir envoyer explicitement `null`.
   */
  @ValidateIf((o) => 'characterVariantId' in o)
  @IsUUID('4', { message: 'characterVariantId must be a UUID' })
  characterVariantId: string | null;
}
