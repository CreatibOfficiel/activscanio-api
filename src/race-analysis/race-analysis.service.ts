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
    /* 0 – Fetch variants linked to the requested competitors */
    const variants = await this.variantsSrv.findByCompetitorIds(competitorIds);

    const missing = competitorIds.filter(
      (id) => !variants.some((v) => v.competitor?.id === id),
    );
    if (missing.length) {
      throw new NotFoundException(
        `No variant linked for: ${missing.join(', ')}`,
      );
    }

    /* 1 – Prepare exact labels and fast lookup maps */

    const labelForVariant = (v: any) =>
      v.baseCharacter.variants.length <= 1 || v.label === 'Default'
        ? v.baseCharacter.name
        : `${v.baseCharacter.name} ${v.label.toLowerCase()}`.trim();

    const nameToVariant = new Map(variants.map((v) => [labelForVariant(v), v]));

    // Add base character names for variant characters (e.g. "Maskass" for "Maskass rouge")
    // only if a single competitor uses that character (otherwise ambiguous)
    const baseNameCount = new Map<string, number>();
    for (const v of variants) {
      const name = v.baseCharacter.name;
      baseNameCount.set(name, (baseNameCount.get(name) ?? 0) + 1);
    }
    for (const v of variants) {
      const baseName = v.baseCharacter.name;
      if (
        v.baseCharacter.variants.length > 1 &&
        !nameToVariant.has(baseName) &&
        baseNameCount.get(baseName) === 1
      ) {
        nameToVariant.set(baseName, v);
      }
    }

    const whitelist = [...nameToVariant.keys()];

    /* 2 – Call OpenAI */
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const aiRows = await this.openai.analyzeRaceImage(base64, whitelist);

    /* 3 – Direct conversion */
    const resultsWithConfidence: (RaceCompetitorResult & {
      confidence: number;
    })[] = [];

    for (const row of aiRows) {
      let variant = nameToVariant.get(row.character);

      // Fallback: if GPT returns a base name without color, match with the single variant of that character
      if (!variant) {
        const candidates = variants.filter(
          (v) => v.baseCharacter.name === row.character,
        );
        if (candidates.length === 1) {
          variant = candidates[0];
        }
      }

      if (!variant) continue; // not in whitelist: skip
      const competitorId = variant.competitor.id;
      resultsWithConfidence.push({
        competitorId,
        rank12: row.rank12,
        score: row.score,
        confidence: row.confidence ?? 1,
      });
    }

    /* 3.5 – Limit to 4 human players max (keep highest confidence) */
    const MAX_HUMAN_PLAYERS = 4;
    if (resultsWithConfidence.length > MAX_HUMAN_PLAYERS) {
      resultsWithConfidence.sort((a, b) => b.confidence - a.confidence);
      resultsWithConfidence.splice(MAX_HUMAN_PLAYERS);
    }

    /* 4 – Final sort by rank */
    resultsWithConfidence.sort((a, b) =>
      a.rank12 !== b.rank12 ? a.rank12 - b.rank12 : b.score - a.score,
    );

    // Strip confidence field before returning
    return resultsWithConfidence.map(({ confidence: _, ...rest }) => rest);
  }
}
