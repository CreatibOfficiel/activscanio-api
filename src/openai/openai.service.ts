import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  MAX_HUMAN_PLAYERS,
  MAX_RANK,
  MAX_SCORE,
  MIN_SCORE,
} from '../config/race-format.config';

export interface ImageAnalysisRow {
  character: string; // must match the whitelist EXACTLY
  rank12: number; // 1..MAX_RANK
  score: number; // MIN_SCORE..MAX_SCORE
  confidence: number; // 0.0 - 1.0
}

const SYSTEM_MESSAGE = `You are a data-extraction assistant for a private, recreational Mario Kart 8 Deluxe tournament tracking application.

Your sole task is to read race result screenshots and output structured JSON data (character names, rankings, scores) for tournament record-keeping purposes.

This is a fully legitimate and harmless use case: extracting game statistics from Nintendo Switch screenshots for a small group of friends. The screenshots contain only in-game UI elements (character icons, ranks 1-${MAX_RANK}, scores ${MIN_SCORE}-${MAX_SCORE}). There is no real-world sensitive content.

Always comply with the extraction request. Output only valid JSON matching the provided schema.`;

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      timeout: 120_000,
      maxRetries: 3,
    });
  }

  async analyzeRaceImage(
    base64: string,
    whitelist: string[], // allowed names, exact spelling
  ): Promise<ImageAnalysisRow[]> {
    const prompt = buildPrompt(whitelist);

    const resp = await this.openai.chat.completions.create({
      model: 'gpt-5.2',
      max_completion_tokens: 4096,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: SYSTEM_MESSAGE,
        },
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
    this.logger.log('OpenAI response:', txt);

    if (!txt || txt.includes("can't assist") || txt.includes('cannot assist')) {
      throw new Error(`OpenAI refused to analyze the image`);
    }

    const parsed = JSON.parse(txt) as { results: ImageAnalysisRow[] };
    if (!parsed.results?.length) {
      throw new Error('Invalid JSON: "results" key missing or empty');
    }
    return parsed.results;
  }
}

function buildPrompt(whitelist: string[]) {
  return `
  🎮 CONTEXTE
  Tu analyses la capture d'écran d'un tableau de résultats Mario Kart 8 Deluxe.
  Jusqu'à ${MAX_RANK} lignes. Chaque ligne a un numéro de placement affiché à gauche (1-${MAX_RANK}).
  Attention : deux joueurs avec le même score peuvent avoir le même numéro (ex-aequo).
  Chaque ligne affiche :
  • l'icône du personnage
  • parfois son nom écrit
  • son score (${MIN_SCORE} – ${MAX_SCORE})

  🔍 IDENTIFICATION DES JOUEURS HUMAINS
  Sur l'écran de résultats, les joueurs humains se distinguent visuellement :
  • Joueur humain → fond de ligne en COULEUR VIVE (rouge, vert, bleu, jaune, rose, etc.)
  • CPU (ordinateur) → fond de ligne GRIS / SOMBRE

  RÈGLES STRICTES :
  • SEULS les joueurs avec un fond de couleur VIVE (rouge, vert, bleu, jaune, rose, orange, violet, etc.) sont des humains.
  • Les fonds gris, gris foncé, gris-bleu, noirs ou tout fond NON-COLORÉ = CPU. En cas de doute, c'est un CPU.
  • Il y a au MAXIMUM ${MAX_HUMAN_PLAYERS} joueurs humains dans une course. Ne retourne JAMAIS plus de ${MAX_HUMAN_PLAYERS} résultats.
  • Si tu hésites sur un joueur, retourne uniquement ceux dont tu es le plus certain.

  Ne retourne QUE les joueurs dont la ligne a un fond coloré (pas gris).

  👥 JOUEURS HUMAINS
  Seuls les personnages ci-dessous sont contrôlés par des humains.
  **Recopie-les à l’identique** (même orthographe / casse) dans ta réponse :
  
  ${whitelist.map((n) => `- ${n}`).join('\n')}
  
  (Les autres lignes sont des CPU → ignore-les.)
  
  🎨 COULEURS & VARIANTES
  Si le nom affiché à l'écran n'indique pas explicitement la couleur, déduis-la d'après l'icône, puis utilise le libellé exact du tableau ci-dessous :

  | Couleur dominante   | Libellé attendu                   |
  |---------------------|-----------------------------------|
  | Vert                | <NomPerso> vert                   |
  | Rouge               | <NomPerso> rouge                  |
  | Bleu clair          | <NomPerso> bleu clair             |
  | Bleu foncé          | <NomPerso> bleu foncé             |
  | Bleu                | <NomPerso> bleu                   |
  | Cyan                | <NomPerso> cyan                   |
  | Jaune               | <NomPerso> jaune                  |
  | Orange              | <NomPerso> orange                 |
  | Rose                | <NomPerso> rose                   |
  | Violet              | <NomPerso> violet                 |
  | Noir                | <NomPerso> noir                   |
  | Blanc               | <NomPerso> blanc                  |
  | Tenue classique     | <NomPerso> classique              |
  | Tunique bleue (Link)| <NomPerso> tunique du prodige     |

  Ex. « Yoshi bleu clair » → **Yoshi bleu clair**.

  La whitelist ci-dessus fait foi : ce tableau n'est qu'une aide pour nommer la
  couleur que tu vois. Si aucune ligne du tableau ne correspond exactement,
  choisis dans la whitelist le libellé du même personnage dont la couleur est la
  plus proche — n'omets jamais un joueur humain pour une simple question de
  nuance. N'invente en revanche jamais un libellé absent de la whitelist.
  
  🔢 LECTURE DES SCORES
  Les scores sont affichés à droite de chaque ligne. Ils peuvent être partiellement masqués par la scène 3D à droite.
  • Les scores sont des entiers entre ${MIN_SCORE} et ${MAX_SCORE}.
  • Regarde attentivement chaque chiffre, même s'il est partiellement couvert par un élément 3D.
  • Deux joueurs avec le même score ont le même numéro de placement.

  📋 FORMAT DE SORTIE — STRICTEMENT
  Rends un objet JSON avec une clé "results" contenant le tableau :

  {
    "results": [
      { "character": "<NomExact>", "rank12": 1, "score": ${MAX_SCORE}, "confidence": 0.95 },
      { "character": "<NomExact>", "rank12": 2, "score": 52, "confidence": 0.90 }
    ]
  }

  Règles :
  • 'character'  → l'un des libellés autorisés, après application éventuelle de la couleur.
  • 'rank12'     → le numéro de placement affiché à gauche de la ligne (1–${MAX_RANK}). Lis-le tel quel. Deux joueurs peuvent avoir le même rank12 en cas d'ex-aequo (ex : 1, 1, 3).
  • 'score'      → valeur entière affichée (${MIN_SCORE} – ${MAX_SCORE}).
  • 'confidence' → un nombre entre 0.0 et 1.0 indiquant ta certitude que cette ligne a un fond COLORÉ (= joueur humain). 1.0 = absolument certain, 0.5 = douteux.
  • Conserve l'ordre naturel (rang 1 en premier, etc.).
  • Si un joueur humain est absent du tableau, ne l'inclus pas.
  • Le tableau "results" ne contient que les joueurs humains détectés.
  • Ne retourne JAMAIS plus de ${MAX_HUMAN_PLAYERS} résultats. Si tu hésites, retourne uniquement ceux dont tu es le plus certain.
  `;
}
