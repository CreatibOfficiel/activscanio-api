import { IsString, MinLength } from 'class-validator';

export class SearchCompetitorDto {
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters long' })
  query: string;
}
