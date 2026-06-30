import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

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

  constructor() {
    // Ensure served image directories exist
    fs.mkdirSync(this.profilesDir, { recursive: true });
    fs.mkdirSync(this.proofsDir, { recursive: true });
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

  moveToProfiles(filename: string): string {
    const src = this.getFilePath(filename);
    const dest = path.join(this.profilesDir, filename);
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    return `${this.publicImageUrl}/profiles/${filename}`;
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
  moveToProofs(filename: string): string {
    const src = this.getFilePath(filename);
    const dest = path.join(this.proofsDir, filename);
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    return `${this.publicImageUrl}/proofs/${filename}`;
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
