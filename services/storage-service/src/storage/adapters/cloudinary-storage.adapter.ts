import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { IStorageAdapter } from './storage-adapter.interface';

@Injectable()
export class CloudinaryStorageAdapter implements IStorageAdapter, OnModuleInit {
  private folder: string;

  constructor(private configService: ConfigService) {
    // Initialize folder in constructor to ensure it's available before onModuleInit
    this.folder = this.configService.get<string>('CLOUDINARY_FOLDER') || 'files';
  }

  async onModuleInit() {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error('Cloudinary credentials not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    console.log(`[CloudinaryStorageAdapter] Configured with cloud: ${cloudName}, folder: ${this.folder}`);
  }

  async ensureBucketExists(): Promise<void> {
    // Folder is already initialized in constructor, so this should always have a value
    console.log(`[CloudinaryStorageAdapter] Using folder: ${this.folder}`);
  }

  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    try {
      const publicId = this.getPublicId(objectName);
      
      await new Promise<void>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: this.folder,
            public_id: publicId,
            resource_type: this.getResourceType(contentType),
            overwrite: true,
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          },
        );
        uploadStream.end(buffer);
      });
    } catch (error) {
      throw new Error(`Failed to upload file to Cloudinary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getUploadUrl(
    objectName: string,
    expiresIn: number = 60 * 60,
    contentType?: string,
  ): Promise<string> {
    const uploadPreset = this.configService.get<string>('CLOUDINARY_UPLOAD_PRESET');
    const publicId = this.getPublicId(objectName);
    const resourceType = contentType ? this.getResourceType(contentType) : 'auto';
    
    if (uploadPreset) {
      const uploadUrl = `https://api.cloudinary.com/v1_1/${this.configService.get<string>('CLOUDINARY_CLOUD_NAME')}/${resourceType}/upload`;

      const fullPublicId = `${this.folder}/${publicId}`;
      const params = new URLSearchParams({
        upload_preset: uploadPreset,
        public_id: fullPublicId, // Full path including base folder
      });
      return `${uploadUrl}?${params.toString()}`;
    } else {
      // Generate signed upload URL
      const timestamp = Math.round(Date.now() / 1000);
      const fullPublicId = `${this.folder}/${publicId}`;
      const params = {
        timestamp,
        public_id: fullPublicId,
        resource_type: resourceType,
      };

      const signature = cloudinary.utils.api_sign_request(params, this.configService.get<string>('CLOUDINARY_API_SECRET') || '');
      
      const uploadUrl = `https://api.cloudinary.com/v1_1/${this.configService.get<string>('CLOUDINARY_CLOUD_NAME')}/${resourceType}/upload`;
      
      const paramsString = new URLSearchParams({
        ...params,
        signature,
        api_key: this.configService.get<string>('CLOUDINARY_API_KEY') || '',
      } as any).toString();

      return `${uploadUrl}?${paramsString}`;
    }
  }

  async getAccessUrl(
    objectName: string,
    expiresIn: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    let cleanObjectName = objectName;
    
    if (cleanObjectName.startsWith(`${this.folder}/`)) {
      cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
      // Check for double folder
      if (cleanObjectName.startsWith(`${this.folder}/`)) {
        cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
      }
    }
    
    const publicId = this.getPublicId(cleanObjectName);
    const resourceType = this.getResourceTypeFromObjectName(cleanObjectName);
    
    const fullPublicId = `${this.folder}/${publicId}`;
    
    // Generate a secure URL
    const url = cloudinary.url(fullPublicId, {
      resource_type: resourceType,
      secure: true,
    });

    return url;
  }

  async deleteFile(objectName: string): Promise<void> {
    try {
      // Handle folder prefix in objectName
      let cleanObjectName = objectName;
      if (cleanObjectName.startsWith(`${this.folder}/`)) {
        cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
        if (cleanObjectName.startsWith(`${this.folder}/`)) {
          cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
        }
      }
      
      const publicId = this.getPublicId(cleanObjectName);
      const resourceType = this.getResourceTypeFromObjectName(cleanObjectName);
      
      await cloudinary.uploader.destroy(`${this.folder}/${publicId}`, {
        resource_type: resourceType,
      });
    } catch (error) {
      throw new Error(`Failed to delete file from Cloudinary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteFiles(objectNames: string[]): Promise<void> {
    if (objectNames.length === 0) return;
    
    // Delete files in parallel
    await Promise.all(objectNames.map((objectName) => this.deleteFile(objectName)));
  }

  async fileExists(objectName: string): Promise<boolean> {
    try {
      // Handle folder prefix in objectName
      let cleanObjectName = objectName;
      if (cleanObjectName.startsWith(`${this.folder}/`)) {
        cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
        if (cleanObjectName.startsWith(`${this.folder}/`)) {
          cleanObjectName = cleanObjectName.substring(this.folder.length + 1);
        }
      }
      
      const publicId = this.getPublicId(cleanObjectName);
      const resourceType = this.getResourceTypeFromObjectName(cleanObjectName);
      
      const result = await cloudinary.api.resource(`${this.folder}/${publicId}`, {
        resource_type: resourceType,
      });
      
      return !!result;
    } catch (error) {
      return false;
    }
  }

  private getPublicId(objectName: string): string {
    const lastDotIndex = objectName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      return objectName.substring(0, lastDotIndex);
    }
    return objectName;
  }

  private getResourceType(contentType: string): 'auto' | 'image' | 'raw' | 'video' {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('audio/')) return 'video'; // Cloudinary uses 'video' for audio
    return 'raw';
  }

  private getResourceTypeFromObjectName(objectName: string): 'auto' | 'image' | 'raw' | 'video' {
    // Infer resource type from object name path
    if (objectName.includes('/image/')) return 'image';
    if (objectName.includes('/video/')) return 'video';
    if (objectName.includes('/audio/')) return 'video';
    return 'raw';
  }
}




