import { IsOptional, IsString } from 'class-validator';

export class SearchCompetitorDto {
  /**
   * Empty means "everything": the onboarding page loads the full competitor
   * list before the user has typed anything, and filters it client-side.
   * A minimum length here would reject that first call.
   */
  @IsOptional()
  @IsString()
  query?: string;
}
