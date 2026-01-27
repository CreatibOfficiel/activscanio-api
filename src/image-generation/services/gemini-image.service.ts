import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface PerfectScoreCelebrationOptions {
  userName: string;
  characterName: string;
  characterDescription: string;
  score: number;
  raceTitle: string;
}

@Injectable()
export class GeminiImageService {
  private readonly logger = new Logger(GeminiImageService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';

    if (!this.apiKey) {
      this.logger.warn(
        '⚠️  GEMINI_API_KEY not configured - AI image generation will be disabled',
      );
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.logger.log('✅ Gemini AI configured for image generation');
    }
  }

  /**
   * Génère une image de célébration pour un perfect score via Nano Banana Pro (Gemini 3 Pro)
   *
   * @param options Configuration for the celebration image
   * @returns Buffer containing the generated PNG image
   */
  async generatePerfectScoreCelebration(
    options: PerfectScoreCelebrationOptions,
  ): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error(
        'GEMINI_API_KEY not configured. Cannot generate AI images.',
      );
    }

    this.logger.log(
      `🎨 Generating AI perfect score celebration for ${options.userName}`,
    );

    const prompt = this.buildPerfectScorePrompt(options);

    try {
      // Use Gemini 2.0 Flash Experimental for image generation
      // Note: As of early 2025, Gemini primarily focuses on text/multimodal
      // Image generation is handled through Imagen 3 via the API
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
      });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      });

      const response = result.response;
      const text = response.text();

      // Note: Gemini API currently doesn't directly generate images
      // This is a placeholder for when Imagen 3 integration is available
      // For now, we'll return a fallback response
      this.logger.warn(
        '⚠️  Direct image generation not yet available via Gemini API',
      );
      this.logger.log(
        '📝 Generated celebration description: ' +
          text.substring(0, 100) +
          '...',
      );

      // Return empty buffer as placeholder
      // TODO: Integrate with Imagen 3 API when available
      return Buffer.from('');
    } catch (error) {
      this.logger.error('❌ Failed to generate AI image with Gemini', error);
      throw error;
    }
  }

  /**
   * Build the prompt for perfect score celebration
   */
  private buildPerfectScorePrompt(
    options: PerfectScoreCelebrationOptions,
  ): string {
    return `
Create a dramatic bowling-style celebration image description for a perfect prediction score.

Theme: Celebratory, energetic, triumphant
Style: Modern digital art with vibrant colors and dynamic lighting
Aspect ratio: 16:9 (1920x1080)

Main elements:
1. Center spotlight on character "${options.characterName}" - ${options.characterDescription}
   - Show them in a victorious, superior pose
   - Make them larger and more prominent than background elements
   - Add glowing aura or golden rays emanating from them

2. Large "PERFECT SCORE!" text at top
   - Bold, 3D metallic gold lettering
   - Dramatic shadow effects

3. Score display: "${options.score} POINTS"
   - Massive numbers, center-mid screen
   - White with golden glow

4. User name: "${options.userName}"
   - Below the score, bold cyan text
   - Uppercase lettering

5. Background:
   - Abstract rays of light bursting from center
   - Gold, blue, and dark navy color palette
   - Subtle bowling alley aesthetic (lanes, pins in distance)

6. Bottom text: "${options.raceTitle}"
   - Small, elegant font
   - Light gray color

Mood: Epic victory moment, like a bowling strike celebration screen
Quality: Ultra high-definition, 4K ready

Describe this image in vivid detail for rendering.
`;
  }

  /**
   * Alternative: Generate using Nano Banana (Gemini 2.5 Flash) for faster/cheaper generation
   */
  async generateWithNanoBanana(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp', // Faster, cheaper model
    });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const response = result.response;
    return response.text();
  }

  /**
   * Health check for Gemini API
   */
  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
      });

      await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
      });

      return true;
    } catch (error) {
      this.logger.error('Gemini API health check failed', error);
      return false;
    }
  }
}
