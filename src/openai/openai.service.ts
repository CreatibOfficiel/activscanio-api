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

  async analyzeRaceImage(imagePath: string): Promise<ImageAnalysisResult> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: "Analyze this Mario Kart race screenshot. Identify the player's character, position (1-12), and score (0-60). Return JSON format: {\"character\": \"name\", \"rank\": number, \"score\": number}" 
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${fs.readFileSync(imagePath).toString('base64')}`,
                }
              }
            ],
          },
        ],
        max_tokens: 300,
      });
      
      // Parse the response to get structured data
      const content = response?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content found in the OpenAI response');
      }
      
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ImageAnalysisResult;
      }
      
      throw new Error('Failed to parse response from OpenAI');
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw error;
    }
  }
}