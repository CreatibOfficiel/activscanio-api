import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface TvDisplayMetadata {
  type: 'celebration' | 'race_announcement' | 'notification';
  duration?: number; // Duration in seconds
  priority?: number; // 1-10, higher = more important
  title?: string;
  subtitle?: string;
}

export interface TvDisplayPayload extends TvDisplayMetadata {
  imageUrl: string;
  timestamp: string;
}

@Injectable()
export class TvDisplayService {
  private readonly logger = new Logger(TvDisplayService.name);
  private readonly tvDisplayUrl: string | null;
  private readonly enabled: boolean;
  private readonly retryAttempts = 3;
  private readonly retryDelay = 1000; // ms

  constructor(private readonly configService: ConfigService) {
    this.tvDisplayUrl = this.configService.get<string>('TV_DISPLAY_URL') || null;
    this.enabled = !!this.tvDisplayUrl;

    if (!this.tvDisplayUrl) {
      this.logger.warn('⚠️  TV_DISPLAY_URL not configured - TV display disabled');
    } else {
      this.logger.log(`📺 TV Display configured: ${this.tvDisplayUrl}`);
    }
  }

  /**
   * Send an image URL to the TV display
   *
   * @param imageUrl Public URL of the image to display
   * @param metadata Display configuration (type, duration, priority, etc.)
   * @returns Success status
   */
  async sendImageToTv(
    imageUrl: string,
    metadata: TvDisplayMetadata,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('📺 TV display not configured, skipping');
      return false;
    }

    const payload: TvDisplayPayload = {
      imageUrl,
      ...metadata,
      timestamp: new Date().toISOString(),
    };

    return this.sendWithRetry(payload);
  }

  /**
   * Send payload with retry logic and exponential backoff
   */
  private async sendWithRetry(
    payload: TvDisplayPayload,
    attempt = 1,
  ): Promise<boolean> {
    try {
      this.logger.log(
        `📺 Sending ${payload.type} to TV display (attempt ${attempt}/${this.retryAttempts})`,
      );

      const response = await axios.post(this.tvDisplayUrl!, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 seconds
      });

      if (response.status === 200 || response.status === 201) {
        this.logger.log(
          `✅ Image URL successfully sent to TV display: ${payload.imageUrl}`,
        );
        return true;
      } else {
        this.logger.warn(`⚠️  TV display returned status ${response.status}`);
        return false;
      }
    } catch (error) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNREFUSED') {
        this.logger.error('❌ TV display is unreachable - check if service is running');
      } else if (axiosError.code === 'ETIMEDOUT') {
        this.logger.error('❌ TV display request timed out');
      } else {
        this.logger.error(
          `❌ Failed to send to TV display: ${axiosError.message}`,
        );
      }

      // Retry logic
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.log(`⏳ Retrying in ${delay}ms...`);

        await this.sleep(delay);
        return this.sendWithRetry(payload, attempt + 1);
      }

      return false;
    }
  }

  /**
   * Test the connection to TV display
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const healthUrl = `${this.tvDisplayUrl}/health`;
      const response = await axios.get(healthUrl, {
        timeout: 5000,
      });

      const isHealthy = response.status === 200;

      if (isHealthy) {
        this.logger.log('✅ TV display health check passed');
      } else {
        this.logger.warn(`⚠️  TV display health check returned ${response.status}`);
      }

      return isHealthy;
    } catch (error) {
      this.logger.error('❌ TV display health check failed', error);
      return false;
    }
  }

  /**
   * Send a test image to TV display
   */
  async sendTestImage(): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('TV display not configured');
      return false;
    }

    return this.sendImageToTv('https://via.placeholder.com/1920x1080/FFD700/000000?text=TEST', {
      type: 'notification',
      duration: 5,
      priority: 5,
      title: 'Test Image',
      subtitle: 'This is a test from ActivScanIO API',
    });
  }

  /**
   * Helper to sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if TV display is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get TV display URL
   */
  getUrl(): string | null {
    return this.tvDisplayUrl;
  }
}
