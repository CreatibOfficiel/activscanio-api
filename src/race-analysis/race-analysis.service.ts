import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenAIService } from '../openai/openai.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { BaseCharactersService } from '../base-characters/base-characters.service';
import { CharacterVariant } from 'src/character-variants/character-variant.entity';
import { BaseCharacter } from 'src/base-characters/base-character.entity';

export interface AnalysisResult {
  competitorId: string;
  recognizedString: string;       // What the AI said, e.g. "Red Yoshi"
  baseCharacterName?: string;     // E.g. "Yoshi"
  baseCharacterId?: string;       // If found in DB
  variantLabel?: string;          // E.g. "Red"
  variantId?: string;             // If found in DB
  rank: number;
  score: number;
}

@Injectable()
export class RaceAnalysisService {
  constructor(
    private openaiService: OpenAIService,
    private competitorsService: CompetitorsService,
    private baseCharactersService: BaseCharactersService,
  ) {}

  /**
   * Analyzes a race image, extracting which character/variant was found.
   * Example AI outputs: "Red Yoshi", "Pink Gold Peach", "Green Inkling (Boy)", etc.
   */
  async analyzeRaceImage(
    filePath: string,
    competitorId: string
  ): Promise<AnalysisResult> {
    // 1) Ensure competitor exists
    const competitor = await this.competitorsService.findOne(competitorId);
    if (!competitor) {
      throw new NotFoundException(`Competitor with ID ${competitorId} not found`);
    }

    // 2) Analyze the image via OpenAI
    const baseChars = await this.baseCharactersService.findAll();
    // Flatten base + variants into one list of strings, e.g. ["Yoshi", "Red Yoshi", "Mario", "Pink Gold Peach", ...]
    const knownCharacters: string[] = [];
    for (const bc of baseChars) {
      // Always include the base name
      knownCharacters.push(bc.name);

      // Also include each variant label appended to the base
      // e.g. "Red" + "Yoshi" => "Red Yoshi"
      for (const variant of bc.variants) {
        if (variant.label) {
          knownCharacters.push(`${variant.label} ${bc.name}`.trim());
        }
      }
    }
    const analysis = await this.openaiService.analyzeRaceImage(filePath, knownCharacters);
    // Example output from AI: { character: "Red Yoshi", rank: 1, score: 50 }
    // Suppose `analysis.character` might be something like "Red Yoshi" or "Pink Gold Peach"

    // 3) Parse the recognized string to separate base name and variant
    //    This is naive: it checks for an exact base name or if the string ends with a base name.
    //    If your AI uses a different format (e.g., "Yoshi (Red)"), adapt accordingly.
    const { baseName, variantLabel } = await this.parseCharacterString(analysis.character);

    // 4) Attempt to find a BaseCharacter in DB
    let matchedBase: BaseCharacter | null = null;
    if (baseName) {
      const allBaseChars = await this.baseCharactersService.findAll();
      matchedBase = allBaseChars.find(
        (bc) => bc.name.toLowerCase() === baseName.toLowerCase()
      ) ?? null;
    }

    // 5) Attempt to find a matching variant if we got a matched base
    let matchedVariant: CharacterVariant | null = null;
    if (matchedBase && variantLabel) {
      matchedVariant = matchedBase.variants.find(
        (v: CharacterVariant) => v.label?.toLowerCase() === variantLabel.toLowerCase(),
      ) ?? null;
    }

    // 6) Return the final analysis result
    return {
      competitorId,
      recognizedString: analysis.character,    // The raw string from AI
      baseCharacterName: baseName || undefined,
      baseCharacterId: matchedBase?.id,
      variantLabel: variantLabel || undefined,
      variantId: matchedVariant?.id,
      rank: analysis.rank,
      score: analysis.score,
    };
  }

  /**
   * Tries to parse a string like "Red Yoshi" or "Pink Gold Peach" into:
   *   baseName = "Yoshi"
   *   variantLabel = "Red"
   * ...or...
   *   baseName = "Pink Gold Peach"
   *   variantLabel = "" (no variant)
   * 
   * Customize this logic to match how your AI usually formats character names.
   */
  private async parseCharacterString(
    input: string
  ): Promise<{ baseName: string; variantLabel: string }> {
    // Trim and normalize
    const raw = input.trim();
    const lower = raw.toLowerCase();

    // Approach: gather all known base character names from DB.
    // This might be better done once in constructor or via caching.
    const allBaseChars = await this.baseCharactersService.findAll(); 
    // e.g. allBaseChars = [ { id: '...', name: 'Yoshi', ...}, { name: 'Pink Gold Peach' }, ...]

    // 1) Check if the input EXACTLY matches a known baseName (case-insensitive).
    let match = allBaseChars.find((bc) => bc.name.toLowerCase() === lower);
    if (match) {
      // Exactly "Pink Gold Peach", so no variant label
      return { baseName: match.name, variantLabel: '' };
    }

    // 2) If there's no exact match, let's see if the input ends with a known base name:
    //    e.g. "Red Yoshi" ends with "Yoshi".
    //    We'll do a reverse sort so that longer names are tested first ("Pink Gold Peach" is 3 words).
    const baseCharsSortedByLength = allBaseChars.slice().sort(
      (a, b) => b.name.length - a.name.length,
    );

    for (const bc of baseCharsSortedByLength) {
      const bcNameLower = bc.name.toLowerCase();
      // e.g. raw = "Red Yoshi", bc.name = "Yoshi"
      // We check if raw ends with bc.name ignoring case:
      if (lower.endsWith(bcNameLower)) {
        // The remainder in front might be the variant label
        // For "Red Yoshi", remainder is "Red"
        // For "Light Blue Yoshi", remainder is "Light Blue"
        // For "Pink Gold Peach" (two matches?), we handled exact match above,
        // so in this step it wouldn't match the longer name if it's not exact.
        const index = lower.lastIndexOf(bcNameLower);
        const remainder = raw.substring(0, index).trim();
        if (!remainder) {
          // Means no variant label, just the base
          return { baseName: bc.name, variantLabel: '' };
        }
        return {
          baseName: bc.name,
          variantLabel: remainder,
        };
      }
    }

    // 3) If still not found, fallback with the entire input as a "baseName" (not recommended).
    //    Or return baseName=null, variantLabel=null if you want to indicate "no match".
    return { baseName: raw, variantLabel: '' };
  }
}
