import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  fileType?: 'image' | 'video' | 'document' | 'audio';
  detectedMimeType?: string;
}

export interface FileTypeConfig {
  mimeTypes: string[];
  extensions: string[];
  maxSize: number; // in bytes
  magicBytes: number[][];
}

@Injectable()
export class FileValidationService {
  private readonly ALLOWED_FILE_TYPES: Record<string, FileTypeConfig> = {
    image: {
      mimeTypes: [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/svg+xml',
      ],
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
      maxSize: 10 * 1024 * 1024, // 10MB
      magicBytes: [
        [0xff, 0xd8, 0xff], // JPEG
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
        [0x47, 0x49, 0x46, 0x38], // GIF
        [0x52, 0x49, 0x46, 0x46], // WEBP (RIFF)
        [0x3c, 0x3f, 0x78, 0x6d, 0x6c], // SVG (XML)
      ],
    },
    video: {
      mimeTypes: [
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
      ],
      extensions: ['.mp4', '.mpeg', '.mov', '.avi', '.webm'],
      maxSize: 50 * 1024 * 1024, // 50MB
      magicBytes: [
        [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70], // MP4
        [0x1a, 0x45, 0xdf, 0xa3], // WebM
        [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70], // QuickTime
      ],
    },
    document: {
      mimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
      ],
      extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv'],
      maxSize: 5 * 1024 * 1024, // 5MB
      magicBytes: [
        [0x25, 0x50, 0x44, 0x46], // PDF
        [0xd0, 0xcf, 0x11, 0xe0], // DOC/XLS (OLE2)
        [0x50, 0x4b, 0x03, 0x04], // DOCX/XLSX (ZIP-based)
      ],
    },
    audio: {
      mimeTypes: [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'audio/webm',
        'audio/aac',
      ],
      extensions: ['.mp3', '.wav', '.ogg', '.webm', '.aac'],
      maxSize: 10 * 1024 * 1024, // 10MB
      magicBytes: [
        [0xff, 0xfb], // MP3
        [0x49, 0x44, 0x33], // MP3 ID3
        [0x52, 0x49, 0x46, 0x46], // WAV (RIFF)
        [0x4f, 0x67, 0x67, 0x53], // OGG
      ],
    },
  };

  private validateExtension(fileName: string, fileType: string): boolean {
    const config = this.ALLOWED_FILE_TYPES[fileType];
    if (!config) return false;

    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return config.extensions.includes(extension);
  }

  private validateMimeType(mimeType: string, fileType: string): boolean {
    const config = this.ALLOWED_FILE_TYPES[fileType];
    if (!config) return false;

    return config.mimeTypes.includes(mimeType.toLowerCase());
  }

  private validateFileSize(fileSize: number, fileType: string): boolean {
    const config = this.ALLOWED_FILE_TYPES[fileType];
    if (!config) return false;

    return fileSize <= config.maxSize;
  }

  private validateMagicBytes(fileBuffer: Buffer, fileType: string): boolean {
    const config = this.ALLOWED_FILE_TYPES[fileType];
    if (!config || config.magicBytes.length === 0) return true;

    for (const signature of config.magicBytes) {
      if (fileBuffer.length < signature.length) continue;

      let matches = true;
      for (let i = 0; i < signature.length; i++) {
        if (fileBuffer[i] !== signature[i]) {
          matches = false;
          break;
        }
      }

      if (matches) return true;
    }

    return false;
  }

  private detectFileType(fileBuffer: Buffer, fileName: string, mimeType: string): string | null {
    for (const [fileType, config] of Object.entries(this.ALLOWED_FILE_TYPES)) {
      if (config.mimeTypes.includes(mimeType.toLowerCase())) {
        if (this.validateMagicBytes(fileBuffer, fileType)) {
          return fileType;
        }
      }

      const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
      if (config.extensions.includes(extension)) {
        if (this.validateMagicBytes(fileBuffer, fileType)) {
          return fileType;
        }
      }
    }

    return null;
  }

  /**
   * Detect file type from mime type and extension
   * Used for presigned URL generation before file upload
   */
  detectFileTypeFromMetadata(fileName: string, mimeType: string): string | null {
    const lowerMimeType = mimeType.toLowerCase();
    const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));

    for (const [fileType, config] of Object.entries(this.ALLOWED_FILE_TYPES)) {
      // Check mime type first
      if (config.mimeTypes.includes(lowerMimeType)) {
        return fileType;
      }

      // Check extension as fallback
      if (config.extensions.includes(extension)) {
        return fileType;
      }
    }

    return null;
  }

  async validateFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
  ): Promise<FileValidationResult> {
    if (fileSize === 0) {
      return { valid: false, error: 'File is empty' };
    }

    const detectedFileType = this.detectFileType(fileBuffer, fileName, mimeType);
    if (!detectedFileType) {
      return {
        valid: false,
        error: 'File type not supported. Allowed types: images, videos, documents, audio',
      };
    }

    if (!this.validateFileSize(fileSize, detectedFileType)) {
      const maxSizeMB = this.ALLOWED_FILE_TYPES[detectedFileType].maxSize / (1024 * 1024);
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${maxSizeMB}MB for ${detectedFileType} files`,
      };
    }

    if (!this.validateExtension(fileName, detectedFileType)) {
      return {
        valid: false,
        error: `File extension does not match ${detectedFileType} file type`,
      };
    }

    if (!this.validateMimeType(mimeType, detectedFileType)) {
      return {
        valid: false,
        error: `MIME type does not match ${detectedFileType} file type`,
      };
    }

    if (!this.validateMagicBytes(fileBuffer, detectedFileType)) {
      return {
        valid: false,
        error: 'File content does not match declared file type (possible file type mismatch)',
      };
    }

    return {
      valid: true,
      fileType: detectedFileType as 'image' | 'video' | 'document' | 'audio',
      detectedMimeType: mimeType,
    };
  }

  calculateFileHash(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  getFileTypeConfig(fileType: string): FileTypeConfig | undefined {
    return this.ALLOWED_FILE_TYPES[fileType];
  }
}
