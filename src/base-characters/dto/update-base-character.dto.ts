import { PartialType } from '@nestjs/mapped-types';
import { CreateBaseCharacterDto } from './create-base-character.dto';

export class UpdateBaseCharacterDto extends PartialType(
  CreateBaseCharacterDto,
) {}
