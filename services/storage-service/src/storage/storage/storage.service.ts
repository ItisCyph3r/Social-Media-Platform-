import { Injectable, OnModuleInit, Inject, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IStorageAdapter } from '../adapters/storage-adapter.interface';
import { FileValidationService } from '../../validation/file-validation/file-validation.service';
import { FileProcessingService } from '../file-processing/file-processing.service';
import { DeduplicationService } from '../../deduplication/deduplication/deduplication.service';
import { FileMetadata } from '../../entities/file-metadata/file-metadata';

@Injectable()
export class StorageService implements OnModuleInit {
  constructor(
    private configService: ConfigService,
    @Inject('IStorageAdapter') private storageAdapter: IStorageAdapter,
    private fileValidationService: FileValidationService,
    private fileProcessingService: FileProcessingService,
    private deduplicationService: DeduplicationService,
  ) {}

  async onModuleInit() {
    await this.storageAdapter.ensureBucketExists();
  }

  /**
   * Generate object name with service prefix and date-based organization
   * Format: {service}/{fileType}/{YYYY}/{MM}/{DD}/{hash}-{timestamp}-{filename}
   */
  generateObjectName(
    serviceName: string,
    fileType: string,
    fileHash: string,
    fileName: string,
  ): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const timestamp = Date.now();
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

    return `${serviceName}/${fileType}/${year}/${month}/${day}/${fileHash}-${timestamp}-${sanitized}`;
  }

  /**
   * Generate thumbnail object name
   */
  generateThumbnailObjectName(objectName: string): string {
    const parts = objectName.split('/');
    parts[parts.length - 2] = 'thumbnails';
    return parts.join('/');
  }

  /**
   * Upload file with deduplication and processing
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
    serviceName: string,
    fileType?: string,
  ): Promise<{
    objectName: string;
    fileHash: string;
    accessUrl: string;
    thumbnailObjectName: string | null;
    thumbnailAccessUrl: string | null;
    isNew: boolean;
  }> {
    // 1. Validate file
    const validation = await this.fileValidationService.validateFile(
      fileBuffer,
      fileName,
      mimeType,
      fileSize,
    );

    if (!validation.valid || !validation.fileType) {
      throw new BadRequestException(validation.error || 'File validation failed');
    }

    const detectedFileType = fileType || validation.fileType;

    // 2. Calculate hash for deduplication
    const fileHash = this.fileValidationService.calculateFileHash(fileBuffer);

    // 3. Check if file already exists
    const existingFile = await this.deduplicationService.findExistingFile(fileHash);

    if (existingFile) {
      // File exists - increment reference count
      const updated = await this.deduplicationService.incrementReferenceCount(
        existingFile,
        serviceName,
      );

      // Generate access URLs
      const accessUrl = await this.storageAdapter.getAccessUrl(existingFile.objectName, 7 * 24 * 60 * 60);
      let thumbnailAccessUrl: string | null = null;
      if (existingFile.thumbnailObjectName) {
        thumbnailAccessUrl = await this.storageAdapter.getAccessUrl(
          existingFile.thumbnailObjectName,
          7 * 24 * 60 * 60,
        );
      }

      return {
        objectName: existingFile.objectName,
        fileHash: existingFile.fileHash,
        accessUrl,
        thumbnailObjectName: existingFile.thumbnailObjectName,
        thumbnailAccessUrl,
        isNew: false,
      };
    }

    // 4. File is new - process and upload
    let processedBuffer = fileBuffer;
    let thumbnailBuffer: Buffer | null = null;

    // Compress images
    if (detectedFileType === 'image') {
      processedBuffer = await this.fileProcessingService.compressImage(fileBuffer);
      thumbnailBuffer = await this.fileProcessingService.generateThumbnail(
        processedBuffer,
        'image',
      );
    }

    // Generate object names
    const objectName = this.generateObjectName(serviceName, detectedFileType, fileHash, fileName);
    let thumbnailObjectName: string | null = null;

    if (thumbnailBuffer) {
      thumbnailObjectName = this.generateThumbnailObjectName(objectName);
    }

    // Upload files
    await this.storageAdapter.uploadFile(objectName, processedBuffer, mimeType);

    if (thumbnailBuffer && thumbnailObjectName) {
      await this.storageAdapter.uploadFile(thumbnailObjectName, thumbnailBuffer, 'image/jpeg');
    }

    // Create file metadata
    await this.deduplicationService.createFileMetadata(
      fileHash,
      objectName,
      thumbnailObjectName,
      detectedFileType,
      fileName,
      mimeType,
      fileSize,
      serviceName,
    );

    // Generate access URLs
    const accessUrl = await this.storageAdapter.getAccessUrl(objectName, 7 * 24 * 60 * 60);
    let thumbnailAccessUrl: string | null = null;
    if (thumbnailObjectName) {
      thumbnailAccessUrl = await this.storageAdapter.getAccessUrl(thumbnailObjectName, 7 * 24 * 60 * 60);
    }

    return {
      objectName,
      fileHash,
      accessUrl,
      thumbnailObjectName,
      thumbnailAccessUrl,
      isNew: true,
    };
  }

  /**
   * Get presigned upload URL (for direct client-to-storage upload)
   */
  async getUploadUrl(
    fileName: string,
    mimeType: string,
    serviceName: string,
    fileType?: string,
    expiresIn: number = 60 * 60,
  ): Promise<{ uploadUrl: string; objectName: string; accessUrl: string }> {
    // Detect file type from mime type and extension if not provided
    const detectedFileType = fileType || this.fileValidationService.detectFileTypeFromMetadata(fileName, mimeType) || 'image';
    
    // Generate a temporary hash for object name
    const tempHash = Date.now().toString(36);
    const objectName = this.generateObjectName(serviceName, detectedFileType, tempHash, fileName);

    // Pass mimeType to include Content-Type in presigned URL
    const uploadUrl = await this.storageAdapter.getUploadUrl(objectName, expiresIn, mimeType);
    const accessUrl = await this.storageAdapter.getAccessUrl(objectName, 7 * 24 * 60 * 60);

    return {
      uploadUrl,
      objectName,
      accessUrl,
    };
  }

  /**
   * Get presigned access URL
   */
  async getAccessUrl(
    objectName: string,
    expiresIn: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    return await this.storageAdapter.getAccessUrl(objectName, expiresIn);
  }

  /**
   * Delete file (with reference counting)
   * Finds file metadata by objectName and uses deleteFileByHash
   */
  async deleteFile(objectName: string, serviceName: string): Promise<void> {
    // Find file metadata by objectName
    const fileMetadata = await this.deduplicationService.findFileByObjectName(objectName);
    
    if (!fileMetadata) {
      await this.storageAdapter.deleteFile(objectName);
      return;
    }

    await this.deleteFileByHash(fileMetadata.fileHash, serviceName);
  }

  /**
   * Delete file by hash (with reference counting)
   */
  async deleteFileByHash(fileHash: string, serviceName: string): Promise<void> {
    const result = await this.deduplicationService.decrementReferenceCount(fileHash, serviceName);

    if (result.shouldDelete && result.fileMetadata) {
      // Delete from storage
      await this.storageAdapter.deleteFile(result.fileMetadata.objectName);
      if (result.fileMetadata.thumbnailObjectName) {
        await this.storageAdapter.deleteFile(result.fileMetadata.thumbnailObjectName);
      }
    }
  }

  /**
   * Delete multiple files
   * Processes deletions in parallel for better performance
   */
  async deleteFiles(objectNames: string[], serviceName: string): Promise<void> {
    await Promise.allSettled(
      objectNames.map((objectName) => 
        this.deleteFile(objectName, serviceName).catch((error) => {
          console.error(`Failed to delete file ${objectName}:`, error);
          // Continue with other deletions even if one fails
        })
      )
    );
  }

  /**
   * Check if file exists
   */
  async fileExists(objectName: string): Promise<boolean> {
    return await this.storageAdapter.fileExists(objectName);
  }
}
