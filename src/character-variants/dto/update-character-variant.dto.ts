import { PartialType } from '@nestjs/mapped-types';
import { CreateCharacterVariantDto } from './create-character-variant.dto';

export class UpdateCharacterVariantDto extends PartialType(CreateCharacterVariantDto) {}
