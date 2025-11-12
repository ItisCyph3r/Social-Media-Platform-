import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface StorageServiceClient {
  UploadFile(
    data: {
      file_buffer: Buffer;
      file_name: string;
      mime_type: string;
      file_size: number;
      service_name: string;
      file_type: string;
    },
    callback: (error: any, response: {
      object_name: string;
      file_hash: string;
      access_url: string;
      thumbnail_object_name: string;
      is_new: boolean;
      success: boolean;
      error: string;
    }) => void,
  ): void;

  GetUploadUrl(
    data: {
      file_name: string;
      mime_type: string;
      service_name: string;
      file_type?: string; 
      expires_in?: number;
    },
    callback: (error: any, response: {
      upload_url: string;
      object_name: string;
      access_url: string;
      success: boolean;
      error: string;
    }) => void,
  ): void;

  GetAccessUrl(
    data: {
      object_name: string;
      expires_in?: number;
    },
    callback: (error: any, response: {
      access_url: string;
      success: boolean;
      error: string;
    }) => void,
  ): void;

  DeleteFile(
    data: {
      object_name: string;
      service_name: string;
    },
    callback: (error: any, response: {
      success: boolean;
      error: string;
    }) => void,
  ): void;
}

@Injectable()
export class StorageClientService implements OnModuleInit {
  private storageService: StorageServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const storageServiceUrl = this.configService.get<string>('STORAGE_SERVICE_GRPC_URL') || 'localhost:5005';
    const protoPath = join(__dirname, '../../../../shared/protos/storage.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const storageProto = grpc.loadPackageDefinition(packageDefinition).storage as any;

    this.storageService = new storageProto.StorageService(
      storageServiceUrl,
      grpc.credentials.createInsecure(),
    ) as StorageServiceClient;

    console.log('[StorageClientService] Connected to Storage Service');
  }

  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
    fileType: string = 'image',
  ): Promise<{
    objectName: string;
    fileHash: string;
    accessUrl: string;
    thumbnailObjectName: string | null;
    isNew: boolean;
  }> {
    return new Promise((resolve, reject) => {
      this.storageService.UploadFile(
        {
          file_buffer: fileBuffer,
          file_name: fileName,
          mime_type: mimeType,
          file_size: fileSize,
          service_name: 'messages',
          file_type: fileType,
        },
        (error, response) => {
          if (error || !response?.success) {
            console.error('[StorageClientService] Failed to upload file:', error || response?.error);
            reject(new Error(error?.message || response?.error || 'Failed to upload file'));
          } else {
            resolve({
              objectName: response.object_name,
              fileHash: response.file_hash,
              accessUrl: response.access_url,
              thumbnailObjectName: response.thumbnail_object_name || null,
              isNew: response.is_new,
            });
          }
        },
      );
    });
  }

  async getPresignedUploadUrl(
    fileName: string,
    contentType: string,
    expiresIn: number = 60 * 60,
  ): Promise<{ uploadUrl: string; objectName: string; accessUrl: string }> {
    return new Promise((resolve, reject) => {
      this.storageService.GetUploadUrl(
        {
          file_name: fileName,
          mime_type: contentType,
          service_name: 'messages',
          expires_in: expiresIn,
        },
        (error, response) => {
          if (error || !response?.success) {
            console.error('[StorageClientService] Failed to get upload URL:', error || response?.error);
            reject(new Error(error?.message || response?.error || 'Failed to get upload URL'));
          } else {
            resolve({
              uploadUrl: response.upload_url,
              objectName: response.object_name,
              accessUrl: response.access_url,
            });
          }
        },
      );
    });
  }

  async getFileAccessUrl(
    objectName: string,
    expiresIn: number = 7 * 24 * 60 * 60,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      this.storageService.GetAccessUrl(
        {
          object_name: objectName,
          expires_in: expiresIn,
        },
        (error, response) => {
          if (error || !response?.success) {
            console.error('[StorageClientService] Failed to get access URL:', error || response?.error);
            reject(new Error(error?.message || response?.error || 'Failed to get access URL'));
          } else {
            resolve(response.access_url);
          }
        },
      );
    });
  }

  async deleteFile(objectName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.storageService.DeleteFile(
        {
          object_name: objectName,
          service_name: 'messages',
        },
        (error, response) => {
          if (error || !response?.success) {
            console.error('[StorageClientService] Failed to delete file:', error || response?.error);
            reject(new Error(error?.message || response?.error || 'Failed to delete file'));
          } else {
            resolve();
          }
        },
      );
    });
  }
}





