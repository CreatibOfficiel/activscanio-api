import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  ImageProcessingService,
  PROCESSED_IMAGE_EXTENSION,
  PROFILE_PICTURE_PROFILE,
  PROOF_PROFILE,
} from './image-processing.service';

@Injectable()
export class UploadService {
  private readonly profilesDir = path.join(
    process.cwd(),
    'public',
    'images',
    'profiles',
  );

  private readonly proofsDir = path.join(
    process.cwd(),
    'public',
    'images',
    'proofs',
  );

  private readonly publicImageUrl =
    process.env.PUBLIC_IMAGE_URL || 'http://localhost:3002/images';

  constructor(private readonly imageProcessing: ImageProcessingService) {
    // Ensure served image directories exist
    fs.mkdirSync(this.profilesDir, { recursive: true });
    fs.mkdirSync(this.proofsDir, { recursive: true });
  }

  /**
   * Swap a staged upload's extension for the processed output's.
   *
   * Multer names the temp file `<uuid><original ext>` (.jpg/.png/.webp).
   * Processing always emits WebP, so the stored file — and therefore the URL
   * persisted in `profilePictureUrl` / `proofPhotoUrl` — must carry `.webp`.
   * Deriving both the destination path and the returned URL from this single
   * function is what keeps the two in sync; a mismatch here would produce
   * rows pointing at files that do not exist.
   *
   * The UUID stem is preserved, so nothing about existing files changes: only
   * uploads made from now on get a `.webp` suffix. Old `.jpg`/`.png` rows keep
   * pointing at their untouched files.
   */
  private processedFilename(filename: string): string {
    const stem = path.basename(filename, path.extname(filename));
    return `${stem}${PROCESSED_IMAGE_EXTENSION}`;
  }

  getFilePath(filename: string): string {
    return path.join(process.cwd(), 'uploads', filename);
  }

  removeFile(filename: string): void {
    const filepath = this.getFilePath(filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  // Downscale + re-encode the staged upload into the served profiles dir and
  // return its public URL. Replaces the previous raw copyFileSync: a 3.3 MB
  // 3024x4032 phone photo used to be stored, and served, at full size behind
  // a 38x38 avatar.
  //
  // The staged file is unlinked whether or not processing succeeds, so a
  // corrupt upload cannot leak into uploads/.
  async moveToProfiles(filename: string): Promise<string> {
    const src = this.getFilePath(filename);
    const outName = this.processedFilename(filename);
    const dest = path.join(this.profilesDir, outName);

    try {
      await this.imageProcessing.processToWebp(
        src,
        dest,
        PROFILE_PICTURE_PROFILE,
      );
    } finally {
      if (fs.existsSync(src)) fs.unlinkSync(src);
    }

    return `${this.publicImageUrl}/profiles/${outName}`;
  }

  removeProfileImage(urlPath: string): void {
    // Only delete files hosted locally (contain /images/profiles/)
    if (!urlPath.includes('/images/profiles/')) return;
    const filename = path.basename(urlPath);
    const filepath = path.join(this.profilesDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }

  // Move an uploaded file into the statically-served proofs dir and return its
  // public URL. Routed through public/images (served via /images) rather than
  // the unserved uploads/ dir so the proof photo displays in the duel feed.
  async moveToProofs(filename: string): Promise<string> {
    const src = this.getFilePath(filename);
    const outName = this.processedFilename(filename);
    const dest = path.join(this.proofsDir, outName);

    try {
      await this.imageProcessing.processToWebp(src, dest, PROOF_PROFILE);
    } finally {
      if (fs.existsSync(src)) fs.unlinkSync(src);
    }

    return `${this.publicImageUrl}/proofs/${outName}`;
  }

  removeProofImage(urlPath: string): void {
    if (!urlPath.includes('/images/proofs/')) return;
    const filename = path.basename(urlPath);
    const filepath = path.join(this.proofsDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}
