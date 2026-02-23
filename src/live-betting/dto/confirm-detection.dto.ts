import { IsArray, IsString, ArrayMinSize } from 'class-validator';

export class ConfirmDetectionDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  competitorIds: string[];
}
