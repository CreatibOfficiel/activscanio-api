/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { CharacterVariantsService } from '../../character-variants/character-variants.service';
import { DetectedCharacter } from '../entities/live-bet.entity';
import { LIVE_BETTING_CONFIG } from '../config/live-betting.config';

const SETUP_SYSTEM_MESSAGE = `You are a data-extraction assistant for a private, recreational Mario Kart 8 Deluxe tournament tracking application.

Your sole task is to read kart selection / setup screen screenshots and identify which characters are present. This screen shows players selecting their karts BEFORE a race starts.

This is a fully legitimate and harmless use case: identifying players from Nintendo Switch screenshots for a small group of friends. The screenshots contain only in-game UI elements (character icons, kart selections).

Always comply with the extraction request. Output only valid JSON matching the provided schema.`;

export interface DetectionResult {
  characters: DetectedCharacter[];
  needsConfirmation: boolean;
}

@Injectable()
export class CharacterDetectorService {
  private readonly logger = new Logger(CharacterDetectorService.name);
  private openai: OpenAI;

  constructor(
    private readonly config: ConfigService,
    private readonly variantsSrv: CharacterVariantsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      timeout: 120_000,
      maxRetries: 3,
    });
  }

  async detectCharacters(base64: string): Promise<DetectionResult> {
    // findAll returns relations: baseCharacter, competitor
    // We need baseCharacter.variants for the labelForVariant logic
    const allVariants = await this.variantsSrv.findByCompetitorIds(
      // Get all variants that have a competitor assigned
      (await this.variantsSrv.findAll())
        .filter((v) => v.competitor)
        .map((v) => v.competitor.id),
    );

    const labelForVariant = (v: any) =>
      v.baseCharacter.variants.length <= 1 || v.label === 'Default'
        ? v.baseCharacter.name
        : `${v.baseCharacter.name} ${v.label.toLowerCase()}`.trim();

    const nameToVariant = new Map(
      allVariants
        .filter((v) => v.competitor)
        .map((v) => [labelForVariant(v), v]),
    );

    // Add base names for unique characters
    const baseNameCount = new Map<string, number>();
    for (const v of allVariants.filter((v) => v.competitor)) {
      const name = v.baseCharacter.name;
      baseNameCount.set(name, (baseNameCount.get(name) ?? 0) + 1);
    }
    for (const v of allVariants.filter((v) => v.competitor)) {
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
    const prompt = buildSetupPrompt(whitelist);

    const resp = await this.openai.chat.completions.create({
      model: 'gpt-5.2',
      max_completion_tokens: 4096,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SETUP_SYSTEM_MESSAGE },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
                detail: 'high',
              },
            },
            { type: 'text', text: prompt.trim() },
          ],
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content ?? '';
    this.logger.log('OpenAI setup screen response:', txt);

    if (!txt || txt.includes("can't assist") || txt.includes('cannot assist')) {
      throw new Error('OpenAI refused to analyze the setup screen image');
    }

    const parsed = JSON.parse(txt) as {
      players: { character: string; confidence: number }[];
    };

    if (!parsed.players?.length) {
      throw new Error('No players detected in setup screen image');
    }

    const characters: DetectedCharacter[] = [];
    for (const player of parsed.players) {
      let variant = nameToVariant.get(player.character);
      if (!variant) {
        const candidates = allVariants.filter(
          (v) => v.competitor && v.baseCharacter.name === player.character,
        );
        if (candidates.length === 1) variant = candidates[0];
      }

      characters.push({
        characterName: player.character,
        competitorId: variant?.competitor?.id ?? null,
        confidence: player.confidence ?? 0.5,
      });
    }

    const threshold = LIVE_BETTING_CONFIG.DETECTION_CONFIDENCE_THRESHOLD;
    const needsConfirmation = characters.some(
      (c) => c.confidence < threshold || !c.competitorId,
    );

    return { characters, needsConfirmation };
  }
}

function buildSetupPrompt(whitelist: string[]) {
  return `
  🎮 CONTEXTE
  Tu analyses la capture d'écran de l'écran de SÉLECTION DE KART dans Mario Kart 8 Deluxe.
  Cet écran montre les joueurs humains qui choisissent leur kart, roues et planeur AVANT que la course commence.

  Chaque joueur humain a une zone avec :
  • L'icône/avatar de son personnage
  • Son kart sélectionné
  • Ses roues et planeur

  🔍 IDENTIFICATION DES JOUEURS
  Les joueurs humains sont visibles dans des panneaux séparés sur l'écran de sélection.
  Il y a au MAXIMUM 4 joueurs humains.

  👥 JOUEURS CONNUS
  Seuls les personnages ci-dessous sont contrôlés par des humains dans ce tournoi.
  **Recopie-les à l'identique** (même orthographe / casse) dans ta réponse :

  ${whitelist.map((n) => `- ${n}`).join('\n')}

  🎨 COULEURS & VARIANTES
  Si le personnage a une variante de couleur, utilise le libellé exact de la whitelist.
  Ex. « Yoshi bleu clair » → **Yoshi bleu clair**
  _Ne crée jamais un libellé absent de la whitelist._

  📋 FORMAT DE SORTIE — STRICTEMENT
  Rends un objet JSON avec une clé "players" :

  {
    "players": [
      { "character": "<NomExact>", "confidence": 0.95 },
      { "character": "<NomExact>", "confidence": 0.90 }
    ]
  }

  Règles :
  • 'character'   → l'un des libellés autorisés
  • 'confidence'  → 0.0 à 1.0, ta certitude d'identification
  • Ne retourne QUE les joueurs identifiés sur l'écran de sélection
  • Maximum 4 résultats
  `;
}
