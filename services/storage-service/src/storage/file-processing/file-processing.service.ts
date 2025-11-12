import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

@Injectable()
export class FileProcessingService {
  /**
   * Compress image to optimize storage
   * Target: 80% quality, max 2MB
   */
  async compressImage(fileBuffer: Buffer): Promise<Buffer> {
    try {
      const metadata = await sharp(fileBuffer).metadata();
      let compressed = sharp(fileBuffer);

      // Resize if too large (max 1920x1080)
      if (metadata.width && metadata.width > 1920) {
        compressed = compressed.resize(1920, null, { withoutEnlargement: true });
      }
      if (metadata.height && metadata.height > 1080) {
        compressed = compressed.resize(null, 1080, { withoutEnlargement: true });
      }

      // Compress based on format
      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        compressed = compressed.jpeg({ quality: 80, mozjpeg: true });
      } else if (metadata.format === 'png') {
        compressed = compressed.png({ quality: 80, compressionLevel: 9 });
      } else if (metadata.format === 'webp') {
        compressed = compressed.webp({ quality: 80 });
      }

      const compressedBuffer = await compressed.toBuffer();

      // If still too large, reduce quality further
      if (compressedBuffer.length > 2 * 1024 * 1024) {
        if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
          return await sharp(fileBuffer)
            .resize(1920, 1080, { withoutEnlargement: true })
            .jpeg({ quality: 60, mozjpeg: true })
            .toBuffer();
        }
      }

      return compressedBuffer;
    } catch (error) {
      console.error('[FileProcessingService] Error compressing image:', error);
      return fileBuffer;
    }
  }

  /**
   * Generate thumbnail for image
   * Size: 320x240
   */
  async generateThumbnail(fileBuffer: Buffer, fileType: string): Promise<Buffer | null> {
    try {
      if (fileType === 'image') {
        return await sharp(fileBuffer)
          .resize(320, 240, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
      }
      // todo: For videos, thumbnail generation would require ffmpeg
      // This is a placeholder - implement video thumbnail extraction separately
      return null;
    } catch (error) {
      console.error('[FileProcessingService] Error generating thumbnail:', error);
      return null;
    }
  }
}
