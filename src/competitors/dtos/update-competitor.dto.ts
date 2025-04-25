import {
  IsOptional,
  IsString,
  IsUrl,
  IsInt,
  IsNumber,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class UpdateCompetitorDto {
  @IsOptional() @IsString()
  firstName?: string;

  @IsOptional() @IsString()
  lastName?: string;

  @IsOptional() @IsUrl()
  profilePictureUrl?: string;

  @IsOptional() @IsInt()
  rank?: number;

  @IsOptional() @IsInt()
  raceCount?: number;

  @IsOptional() @IsNumber()
  avgRank12?: number;

  /**
   * id du CharacterVariant OU null pour retirer le lien.
   * On utilise ValidateIf pour pouvoir envoyer explicitement `null`.
   */
  @ValidateIf((o) => 'characterVariantId' in o)
  @IsUUID('4', { message: 'characterVariantId must be a UUID' })
  characterVariantId: string | null;
}
