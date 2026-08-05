import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import type { Sharp, SharpOptions } from 'sharp';

// sharp is loaded with `require`, deliberately, and this must not be
// "cleaned up" into an import:
//   - `import sharp from 'sharp'` type-checks (allowSyntheticDefaultImports is
//     on) but CRASHES AT RUNTIME. tsconfig has no `esModuleInterop`, so TS
//     emits `sharp_1.default(...)`, and sharp's CommonJS export has no
//     `.default` — verified: `require('sharp').default === undefined`.
//   - `import * as sharp from 'sharp'` fails to compile: TS2349, a namespace
//     object is not callable.
// Enabling esModuleInterop project-wide would fix both but changes emit for
// every other module, so the narrow fix stays local to this file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: (input: Buffer, options?: SharpOptions) => Sharp = require('sharp');

/**
 * Output profile for a processed image.
 *
 * `maxDimension` bounds the LONGEST side and preserves aspect ratio.
 * `withoutEnlargement` is always on: an image already smaller than the bound
 * is never upscaled (that would only add bytes, never detail).
 */
export interface ImageProcessingProfile {
  maxDimension: number;
  quality: number;
}

/** Avatars render at 28-80 CSS px. 512 covers retina + the profile header. */
export const PROFILE_PICTURE_PROFILE: ImageProcessingProfile = {
  maxDimension: 512,
  quality: 82,
};

/**
 * Duel proofs are screenshots of race result screens, opened full-screen in a
 * lightbox. Legibility of small scoreboard text matters, hence the larger
 * bound than avatars.
 */
export const PROOF_PROFILE: ImageProcessingProfile = {
  maxDimension: 1600,
  quality: 80,
};

/** Every processed image is normalized to this container format. */
export const PROCESSED_IMAGE_EXTENSION = '.webp';

@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  /**
   * Read `srcPath`, downscale + re-encode to WebP, write to `destPath`.
   *
   * Behaviour worth knowing:
   *  - `.rotate()` with no argument applies the EXIF Orientation tag and then
   *    drops it. Without this, portrait phone photos land sideways, because
   *    the pixel data is landscape and only the tag says otherwise.
   *  - Metadata is NOT copied. sharp strips EXIF/XMP/ICC by default (we never
   *    call `.withMetadata()`), which removes embedded GPS coordinates from
   *    phone photos along with a few KB of overhead.
   *  - `fit: 'inside'` + `withoutEnlargement` bounds the longest side while
   *    preserving the aspect ratio and never upscaling.
   *
   * Throws if the source is not a decodable image, so the caller can reject
   * the upload rather than persist a broken path.
   */
  async processToWebp(
    srcPath: string,
    destPath: string,
    profile: ImageProcessingProfile,
  ): Promise<void> {
    const input = await fs.readFile(srcPath);

    const output = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({
        width: profile.maxDimension,
        height: profile.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: profile.quality, effort: 4 })
      .toBuffer();

    await fs.writeFile(destPath, output);

    this.logger.log(
      `Processed image: ${input.length} B -> ${output.length} B ` +
        `(${Math.round((1 - output.length / input.length) * 100)}% smaller, ` +
        `max ${profile.maxDimension}px, q${profile.quality})`,
    );
  }
}
