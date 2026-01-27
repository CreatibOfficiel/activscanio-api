import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeCharacterDto {
  @ApiProperty({
    description: 'The UUID of the new character variant',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  characterVariantId: string;
}
