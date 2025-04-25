import { IsUUID } from 'class-validator';

export class LinkCharacterDto {
  @IsUUID('4')
  characterVariantId: string;
}
