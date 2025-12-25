import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  private readonly storageType: 'local' | 's3';
  private readonly publicUrl: string;
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.storageType = this.configService.get<'local' | 's3'>('IMAGE_STORAGE_TYPE', 'local');
    this.publicUrl = this.configService.get<string>(
      'PUBLIC_IMAGE_URL',
      'http://localhost:3002/images',
    );

    this.uploadDir = path.join(process.cwd(), 'public', 'images', 'celebrations');

    if (this.storageType === 'local') {
      this.logger.log(`📁 Using local storage: ${this.uploadDir}`);
      this.logger.log(`🌐 Public URL: ${this.publicUrl}`);
      this.ensureUploadDirExists();
    } else {
      this.logger.log('☁️  Using S3 storage (not yet implemented)');
    }
  }

  /**
   * Ensure the upload directory exists
   */
  private async ensureUploadDirExists(): Promise<void> {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      this.logger.log('✅ Upload directory ready');
    } catch (error) {
      this.logger.error('❌ Failed to create upload directory', error);
    }
  }

  /**
   * Upload an image and return its public URL
   *
   * @param imageBuffer Buffer containing the image data
   * @param type Type of image (celebration, race_announcement, etc.)
   * @returns Public URL of the uploaded image
   */
  async uploadImage(
    imageBuffer: Buffer,
    type: 'celebration' | 'race_announcement' | 'share',
  ): Promise<string> {
    const filename = `${type}-${uuidv4()}.png`;

    if (this.storageType === 's3') {
      return this.uploadToS3(imageBuffer, filename);
    } else {
      return this.uploadToLocal(imageBuffer, filename);
    }
  }

  /**
   * Upload to local filesystem
   */
  private async uploadToLocal(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      const filePath = path.join(this.uploadDir, filename);
      await fs.writeFile(filePath, imageBuffer);

      const imageUrl = `${this.publicUrl}/celebrations/${filename}`;
      this.logger.log(`✅ Image uploaded locally: ${imageUrl}`);

      return imageUrl;
    } catch (error) {
      this.logger.error('❌ Failed to upload image locally', error);
      throw error;
    }
  }

  /**
   * Upload to S3 (placeholder for future implementation)
   */
  private async uploadToS3(imageBuffer: Buffer, filename: string): Promise<string> {
    // TODO: Implement S3 upload when needed
    // Will require @aws-sdk/client-s3
    this.logger.warn('⚠️  S3 upload not yet implemented, falling back to local');
    return this.uploadToLocal(imageBuffer, filename);
  }

  /**
   * Delete an image by URL
   */
  async deleteImage(imageUrl: string): Promise<boolean> {
    try {
      if (this.storageType === 'local') {
        // Extract filename from URL
        const filename = imageUrl.split('/').pop();
        if (!filename) {
          return false;
        }

        const filePath = path.join(this.uploadDir, filename);
        await fs.unlink(filePath);

        this.logger.log(`🗑️  Deleted image: ${filename}`);
        return true;
      }

      // TODO: Implement S3 delete
      return false;
    } catch (error) {
      this.logger.error('❌ Failed to delete image', error);
      return false;
    }
  }

  /**
   * List all images in storage
   */
  async listImages(type?: string): Promise<string[]> {
    try {
      if (this.storageType === 'local') {
        const files = await fs.readdir(this.uploadDir);

        let filteredFiles = files;
        if (type) {
          filteredFiles = files.filter((file) => file.startsWith(`${type}-`));
        }

        return filteredFiles.map((file) => `${this.publicUrl}/celebrations/${file}`);
      }

      // TODO: Implement S3 list
      return [];
    } catch (error) {
      this.logger.error('❌ Failed to list images', error);
      return [];
    }
  }

  /**
   * Get storage stats
   */
  async getStats(): Promise<{
    type: string;
    totalImages: number;
    totalSize: number;
  }> {
    try {
      if (this.storageType === 'local') {
        const files = await fs.readdir(this.uploadDir);
        let totalSize = 0;

        for (const file of files) {
          const filePath = path.join(this.uploadDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }

        return {
          type: 'local',
          totalImages: files.length,
          totalSize,
        };
      }

      // TODO: Implement S3 stats
      return {
        type: 's3',
        totalImages: 0,
        totalSize: 0,
      };
    } catch (error) {
      this.logger.error('❌ Failed to get storage stats', error);
      return {
        type: this.storageType,
        totalImages: 0,
        totalSize: 0,
      };
    }
  }
}
