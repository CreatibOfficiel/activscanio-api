import { IsNotEmpty, IsString } from 'class-validator';

export class CreateLiveBetDto {
  @IsString()
  @IsNotEmpty()
  competitorId: string;
}
