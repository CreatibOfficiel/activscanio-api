/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAIService } from 'src/openai/openai.service';
import { CharacterVariantsService } from 'src/character-variants/character-variants.service';

export interface RaceCompetitorResult {
  competitorId: string;
  rank12: number;
  score: number;
}

@Injectable()
export class RaceAnalysisService {
  constructor(
    private readonly openai: OpenAIService,
    private readonly variantsSrv: CharacterVariantsService,
  ) {}

  async analyzeRaceImage(
    base64: string,
    competitorIds: string[],
  ): Promise<RaceCompetitorResult[]> {
    /* 0 – Récupérer les variants liés aux competitors demandés */
    const variants = await this.variantsSrv.findByCompetitorIds(competitorIds);

    const missing = competitorIds.filter(
      (id) => !variants.some((v) => v.competitor?.id === id),
    );
    if (missing.length) {
      throw new NotFoundException(
        `Aucun variant lié pour : ${missing.join(', ')}`,
      );
    }

    /* 1 – Préparer les libellés exacts et les maps rapides */

    const labelForVariant = (v: any) =>
      v.baseCharacter.variants.length <= 1 || v.label === 'Default'
        ? v.baseCharacter.name
        : `${v.label} ${v.baseCharacter.name}`.trim();

    const nameToVariant = new Map(variants.map((v) => [labelForVariant(v), v]));

    const whitelist = [...nameToVariant.keys()];

    /* 2 – Appeler OpenAI */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const aiRows = await this.openai.analyzeRaceImage(base64, whitelist);

    /* 3 – Conversion directe */
    const results: RaceCompetitorResult[] = [];

    for (const row of aiRows) {
      const variant = nameToVariant.get(row.character);
      if (!variant) continue; // ligne hors whitelist : on ignore
      const competitorId = variant.competitor.id;
      results.push({
        competitorId,
        rank12: row.rank12,
        score: row.score,
      });
    }

    /* 4 – Tri final */
    results.sort((a, b) =>
      a.rank12 !== b.rank12 ? a.rank12 - b.rank12 : b.score - a.score,
    );

    return results;
  }
}
