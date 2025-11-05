import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as MinIO from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private minioClient: MinIO.Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = parseInt(this.configService.get<string>('MINIO_PORT') || '9000', 10);
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') || 'minioadmin';
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY') || 'minioadmin';
    this.bucketName = this.configService.get<string>('MINIO_BUCKET') || 'posts';

    this.minioClient = new MinIO.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    // Ensure bucket exists
    await this.ensureBucketExists();

    console.log('[MinIO Service] Connected to MinIO');
  }

  private async ensureBucketExists() {
    const exists = await this.minioClient.bucketExists(this.bucketName);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
      console.log(`[MinIO Service] Created bucket: ${this.bucketName}`);
    }
  }

  /**
   * Generate a presigned PUT URL for direct client-to-MinIO upload
   * Client will use this URL to upload file directly without touching the server
   */
  async getPresignedUploadUrl( fileName: string, contentType: string, expiresIn: number = 60 * 60 ): Promise<{ uploadUrl: string; objectName: string; accessUrl: string }> {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 15);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const objectName = `posts/${timestamp}-${randomId}-${sanitizedFileName}`;
    
    // Generate presigned PUT URL for upload 
    const uploadUrl = await this.minioClient.presignedPutObject(
      this.bucketName,
      objectName,
      expiresIn,
    );

    // Generate presigned GET URL for accessing the file after upload
    const accessUrl = await this.minioClient.presignedGetObject(
      this.bucketName,
      objectName,
      7 * 24 * 60 * 60, // 7 days
    );

    return {
      uploadUrl,
      objectName,
      accessUrl,
    };
  }

  /**
   * Generate presigned GET URL for file access (read-only)
   */
  async getFileUrl(objectName: string, expiresIn: number = 7 * 24 * 60 * 60): Promise<string> {
    // Generate presigned URL valid for 7 days
    return await this.minioClient.presignedGetObject(
      this.bucketName,
      objectName,
      expiresIn,
    );
  }

  async deleteFile(objectName: string): Promise<void> {
    await this.minioClient.removeObject(this.bucketName, objectName);
  }

  async deleteFiles(objectNames: string[]): Promise<void> {
    await this.minioClient.removeObjects(this.bucketName, objectNames);
  }
}

