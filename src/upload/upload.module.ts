import { Global, Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import { UploadService } from './upload.service';

@Global() // ← ① visible dans tous les modules
@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          // ← ② crée le dossier si besoin
          const dir = './uploads';
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error(`File type ${file.mimetype} not allowed. Only JPEG, PNG, and WebP are accepted.`), false);
        }
      },
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 Mo
    }),
  ],
  providers: [UploadService],
  exports: [UploadService, MulterModule], // ← ③
})
export class UploadModule {}
