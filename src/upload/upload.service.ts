import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadService {
  getFilePath(filename: string): string {
    return path.join(process.cwd(), 'uploads', filename);
  }

  removeFile(filename: string): void {
    const filepath = this.getFilePath(filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }
  }
}
