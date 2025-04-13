import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';

export interface ImageAnalysisResult {
  character: string;
  rank: number; // 1-12
  score: number; // 0-60
}

@Injectable()
export class OpenAIService {
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Analyzes a Mario Kart race image using GPT, with knowledge of possible characters.
   * @param imagePath The local file path of the image.
   * @param knownCharacters An array of all recognized base characters and their variants (e.g., ["Mario", "Red Yoshi", "Pink Gold Peach", ...]).
   */
  async analyzeRaceImage(
    imagePath: string,
    knownCharacters: string[],
  ): Promise<ImageAnalysisResult> {
    try {
      // Convert the image to a base64 string
      const base64Image = fs.readFileSync(imagePath).toString('base64');

      // Prepare the user prompt with the list of characters
      const userPromptText = `
We have the following recognized Mario Kart characters in our app:

${knownCharacters.join(', ')}

Analyze this Mario Kart race screenshot and identify which character from the above list is present in the image, along with the position (1-12) and the score (0-60). 

Return your result in valid JSON format:
{
  "character": "name_from_list",
  "rank": number,
  "score": number
}
`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini', // or whichever model you're using
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: userPromptText.trim(),
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });

      // Parse the response content to extract JSON
      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content found in the OpenAI response');
      }

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ImageAnalysisResult;
      }

      throw new Error('Failed to parse JSON from the OpenAI response');
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw error;
    }
  }
}
