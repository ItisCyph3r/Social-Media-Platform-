import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as MinIO from 'minio';
import { IStorageAdapter } from './storage-adapter.interface';

@Injectable()
export class MinIOStorageAdapter implements IStorageAdapter, OnModuleInit {
  private minioClient: MinIO.Client | null = null;
  private bucketName: string;
  private initializationPromise: Promise<void> | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    this.initializationPromise = this.initialize();
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    const endpoint = this.configService.get<string>('MINIO_ENDPOINT') || 'localhost';
    const port = parseInt(this.configService.get<string>('MINIO_PORT') || '9000', 10);
    const useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') || 'minioadmin';
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY') || 'minioadmin';
    this.bucketName = this.configService.get<string>('MINIO_BUCKET') || 'files';

    this.minioClient = new MinIO.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    const exists = await this.minioClient.bucketExists(this.bucketName);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
      console.log(`[MinIOStorageAdapter] Created bucket: ${this.bucketName}`);
    }
    console.log(`[MinIOStorageAdapter] Note: Ensure CORS is configured for bucket: ${this.bucketName}`);

    console.log(`[MinIOStorageAdapter] Connected to MinIO bucket: ${this.bucketName}`);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize();
    }
    await this.initializationPromise;
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
  }

  async ensureBucketExists(): Promise<void> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    const exists = await this.minioClient.bucketExists(this.bucketName);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
      console.log(`[MinIOStorageAdapter] Created bucket: ${this.bucketName}`);
    }
  }

  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    await this.minioClient.putObject(
      this.bucketName,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': contentType,
      },
    );
  }

  async getUploadUrl(
    objectName: string,
    expiresIn: number = 60 * 60,
    contentType?: string,
  ): Promise<string> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    return await this.minioClient.presignedPutObject(
      this.bucketName,
      objectName,
      expiresIn,
    );
  }

  async getAccessUrl(
    objectName: string,
    expiresIn: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    return await this.minioClient.presignedGetObject(
      this.bucketName,
      objectName,
      expiresIn,
    );
  }

  async deleteFile(objectName: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    await this.minioClient.removeObject(this.bucketName, objectName);
  }

  async deleteFiles(objectNames: string[]): Promise<void> {
    if (objectNames.length === 0) return;
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    await this.minioClient.removeObjects(this.bucketName, objectNames);
  }

  async fileExists(objectName: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.minioClient) {
      throw new Error('MinIO client not initialized');
    }
    try {
      await this.minioClient.statObject(this.bucketName, objectName);
      return true;
    } catch (error) {
      return false;
    }
  }
}

