import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { StorageService } from './storage/storage.service';

@Controller()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @GrpcMethod('StorageService', 'UploadFile')
  async uploadFile(data: {
    file_buffer: Buffer;
    file_name: string;
    mime_type: string;
    file_size: number;
    service_name: string;
    file_type: string;
  }) {
    try {
      const result = await this.storageService.uploadFile(
        Buffer.from(data.file_buffer),
        data.file_name,
        data.mime_type,
        data.file_size,
        data.service_name,
        data.file_type,
      );

      return {
        object_name: result.objectName,
        file_hash: result.fileHash,
        access_url: result.accessUrl,
        thumbnail_object_name: result.thumbnailObjectName || '',
        is_new: result.isNew,
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        object_name: '',
        file_hash: '',
        access_url: '',
        thumbnail_object_name: '',
        is_new: false,
        success: false,
        error: error.message || 'Upload failed',
      };
    }
  }

  @GrpcMethod('StorageService', 'GetUploadUrl')
  async getUploadUrl(data: {
    file_name: string;
    mime_type: string;
    service_name: string;
    file_type?: string;
    expires_in?: number;
  }) {
    try {
      const result = await this.storageService.getUploadUrl(
        data.file_name,
        data.mime_type,
        data.service_name,
        data.file_type,
        data.expires_in || 3600,
      );

      return {
        upload_url: result.uploadUrl,
        object_name: result.objectName,
        access_url: result.accessUrl,
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        upload_url: '',
        object_name: '',
        access_url: '',
        success: false,
        error: error.message || 'Failed to generate upload URL',
      };
    }
  }

  @GrpcMethod('StorageService', 'GetAccessUrl')
  async getAccessUrl(data: { object_name: string; expires_in?: number }) {
    try {
      const accessUrl = await this.storageService.getAccessUrl(
        data.object_name,
        data.expires_in || 604800, // 7 days
      );

      return {
        access_url: accessUrl,
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        access_url: '',
        success: false,
        error: error.message || 'Failed to generate access URL',
      };
    }
  }

  @GrpcMethod('StorageService', 'DeleteFile')
  async deleteFile(data: { object_name: string; service_name: string }) {
    try {
      // TODO Note: This is a simplified version - in production, you'd want to
      // find the file by objectName and get its hash, then use deleteFileByHash
      // For now, we'll need to implement a lookup by objectName
      await this.storageService.deleteFile(data.object_name, data.service_name);

      return {
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete file',
      };
    }
  }

  @GrpcMethod('StorageService', 'DeleteFiles')
  async deleteFiles(data: { object_names: string[]; service_name: string }) {
    try {
      await this.storageService.deleteFiles(data.object_names, data.service_name);

      return {
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete files',
      };
    }
  }

  @GrpcMethod('StorageService', 'FileExists')
  async fileExists(data: { object_name: string }) {
    try {
      const exists = await this.storageService.fileExists(data.object_name);

      return {
        exists,
        success: true,
        error: '',
      };
    } catch (error: any) {
      return {
        exists: false,
        success: false,
        error: error.message || 'Failed to check file existence',
      };
    }
  }
}
