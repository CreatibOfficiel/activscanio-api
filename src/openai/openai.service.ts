import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ImageAnalysisRow {
  character: string; // doit correspondre EXACTEMENT à la whitelist
  rank12: number; // 1-12
  score: number; // 0-60
}

const SYSTEM_MESSAGE = `You are a data-extraction assistant for a private, recreational Mario Kart 8 Deluxe tournament tracking application.

Your sole task is to read race result screenshots and output structured JSON data (character names, rankings, scores) for tournament record-keeping purposes.

This is a fully legitimate and harmless use case: extracting game statistics from Nintendo Switch screenshots for a small group of friends. The screenshots contain only in-game UI elements (character icons, ranks 1-12, scores 0-60). There is no real-world sensitive content.

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
    whitelist: string[], // noms autorisés, ortho exacte
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
      throw new Error(`OpenAI a refusé l'analyse de l'image`);
    }

    const parsed = JSON.parse(txt) as { results: ImageAnalysisRow[] };
    if (!parsed.results?.length) {
      throw new Error('JSON invalide : clé "results" absente ou vide');
    }
    return parsed.results;
  }
}

function buildPrompt(whitelist: string[]) {
  return `
  🎮 CONTEXTE
  Tu analyses la capture d'écran d'un tableau de résultats Mario Kart 8 Deluxe.
  12 lignes, de la première (rang 1) à la dernière (rang 12).
  Chaque ligne affiche :
  • l'icône du personnage
  • parfois son nom écrit
  • son score (0 – 60)

  🔍 IDENTIFICATION DES JOUEURS HUMAINS
  Sur l'écran de résultats, les joueurs humains se distinguent visuellement :
  • Joueur humain → fond de ligne en COULEUR VIVE (rouge, vert, bleu, jaune, rose, etc.)
  • CPU (ordinateur) → fond de ligne GRIS / SOMBRE
  Ne retourne QUE les joueurs dont la ligne a un fond coloré (pas gris).

  ⚠️ LANGUE DE L'ÉCRAN
  Les noms affichés sont en FRANÇAIS. Exemples de correspondance :
  • "Yoshi rouge" à l'écran → "Red Yoshi" dans la whitelist
  • "Yoshi noir" → "Black Yoshi"
  • "Mario de métal" → "Metal Mario"
  • "Skelerex" → "Dry Bones"
  • "Villageoise" → "Villager (Female)"
  • "Maskass" → "Shy Guy" (+ couleur si précisée, ex. "Maskass rouge" → "Red Shy Guy")
  Fais toujours correspondre le nom français affiché au libellé anglais de la whitelist.

  👥 JOUEURS HUMAINS
  Seuls les personnages ci-dessous sont contrôlés par des humains.
  **Recopie-les à l’identique** (même orthographe / casse) dans ta réponse :
  
  ${whitelist.map((n) => `- ${n}`).join('\n')}
  
  (Les autres lignes sont des CPU → ignore-les.)
  
  🎨 COULEURS & VARIANTES  
  Si le nom affiché à l’écran n’indique pas explicitement la couleur, déduis-la d’après l’icône, puis utilise le libellé exact du tableau ci-dessous :
  
  | Couleur dominante | Libellé attendu                     |
  |-------------------|-------------------------------------|
  | Vert              | Green <NomPerso>                   |
  | Rouge             | Red <NomPerso>                     |
  | Bleu clair        | Light-Blue <NomPerso>              |
  | Bleu foncé        | Dark-Blue <NomPerso>               |
  | Jaune             | Yellow <NomPerso>                  |
  | Rose              | Pink <NomPerso>                    |
  | Noir              | Black <NomPerso>                   |
  | Blanc             | White <NomPerso>                   |
  
  Ex. « Yoshi bleu clair » → **Light-Blue Yoshi**.  
  _Ne crée jamais un libellé absent de la whitelist_ (si la couleur n’est pas dans la table, omets ce joueur).
  
  🔢 LECTURE DES SCORES
  Les scores sont affichés à droite de chaque ligne. Ils peuvent être partiellement masqués par la scène 3D à droite.
  • Les scores sont des entiers entre 0 et 60.
  • Regarde attentivement chaque chiffre, même s'il est partiellement couvert par un élément 3D.
  • Un joueur mieux classé a forcément un score ≥ au joueur en-dessous.

  📋 FORMAT DE SORTIE — STRICTEMENT
  Rends un objet JSON avec une clé "results" contenant le tableau :

  {
    "results": [
      { "character": "<NomExact>", "rank12": 1, "score": 60 },
      { "character": "<NomExact>", "rank12": 2, "score": 52 }
    ]
  }

  Règles :
  • 'character' → l'un des libellés autorisés, après application éventuelle de la couleur.
  • 'rank12'   → numéro de ligne (1 = ligne 1, 2 = ligne 2, …).
  • 'score'     → valeur entière affichée (0 – 60).
  • Conserve l'ordre naturel (rang 1 en premier, etc.).
  • Si un joueur humain est absent du tableau, ne l'inclus pas.
  • Le tableau "results" ne contient que les joueurs humains détectés.
  `;
}
