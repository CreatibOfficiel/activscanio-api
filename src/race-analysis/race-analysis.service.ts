import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { UploadService } from '../upload/upload.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { CharactersService } from '../characters/characters.service';

export interface AnalysisResult {
  competitorId: string;
  character: string;
  characterId?: string;
  rank: number;
  score: number;
}

@Injectable()
export class RaceAnalysisService {
  constructor(
    private openaiService: OpenAIService,
    private competitorsService: CompetitorsService,
    private charactersService: CharactersService,
  ) {}

  async analyzeRaceImage(
    filePath: string, 
    competitorId: string
  ): Promise<AnalysisResult> {
    // Vérifier que le compétiteur existe
    const competitor = await this.competitorsService.findOne(competitorId);
    if (!competitor) {
      throw new NotFoundException(`Competitor with ID ${competitorId} not found`);
    }

    // Analyser l'image avec OpenAI
    const analysis = await this.openaiService.analyzeRaceImage(filePath);
    
    // Rechercher le personnage dans la base de données
    const characters = await this.charactersService.findAll();
    const matchedCharacter = characters.find(
      c => c.name.toLowerCase() === analysis.character.toLowerCase()
    );

    return {
      competitorId,
      character: analysis.character,
      characterId: matchedCharacter?.id,
      rank: analysis.rank,
      score: analysis.score,
    };
  }
}