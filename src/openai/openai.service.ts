import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';

export interface ImageAnalysisRow {
  character: string; // doit correspondre EXACTEMENT à la whitelist
  rank12: number; // 1-12
  score: number; // 0-60
}

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async analyzeRaceImage(
    imagePath: string,
    whitelist: string[], // noms autorisés, ortho exacte
  ): Promise<ImageAnalysisRow[]> {
    const base64 = fs.readFileSync(imagePath).toString('base64');

    const prompt = buildPrompt(whitelist);

    const resp = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 600,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt.trim() },
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content ?? '';
    console.log('OpenAI response:', txt);
    const json = txt.match(/\[[\s\S]*]/);
    if (!json) throw new Error('JSON absent de la réponse OpenAI');

    return JSON.parse(json[0]) as ImageAnalysisRow[];
  }
}

function buildPrompt(whitelist: string[]) {
  return `
  🎮 CONTEXTE
  Tu analyses la capture d’écran d’un tableau de résultats Mario Kart 8 Deluxe.
  12 lignes, de la première (rang 1) à la dernière (rang 12).
  Chaque ligne affiche :
  • l’icône du personnage
  • parfois son nom écrit
  • son score (0 – 60)
  
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
  
  📋 FORMAT DE SORTIE — STRICTEMENT
  Rends **uniquement** ce tableau JSON, pas de texte ni markdown :
  
  [
    { "character": "<NomExact>", "rank12": 1, "score": 60 },
    { "character": "<NomExact>", "rank12": 2, "score": 52 }
    // uniquement les lignes des joueurs humains détectés
  ]
  
  Règles :
  • 'character' → l’un des libellés autorisés, après application éventuelle de la couleur.  
  • 'rank12'   → numéro de ligne (1 = ligne 1, 2 = ligne 2, …).  
  • 'score'     → valeur entière affichée (0 – 60).  
  • Conserve l’ordre naturel (rang 1 en premier, etc.).  
  • Si un joueur humain est absent du tableau, ne l’inclus pas dans le JSON.
  
  ⚠️ Aucun commentaire, aucune prose : **juste le JSON**.  
  `;
}
