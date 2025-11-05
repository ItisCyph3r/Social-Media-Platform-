import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PostService } from './post.service';

@Controller()
export class FileUploadController {
  constructor(private readonly postService: PostService) {}

  /**
   * Get presigned URL for direct client-to-MinIO upload
   * Client receives uploadUrl, uploads file directly to MinIO,
   * then sends objectName back when creating post
   */
  @GrpcMethod('PostService', 'GetPresignedUploadUrl')
  async getPresignedUploadUrl(data: {
    file_name: string;
    content_type: string;
  }) {
    try {
      if (!data.file_name) {
        throw new Error('File name is required');
      }

      const result = await this.postService.getPresignedUploadUrl(
        data.file_name,
        data.content_type || 'application/octet-stream',
      );

      return {
        upload_url: result.uploadUrl, // Client uses this to PUT file directly to MinIO
        object_name: result.objectName, // Client sends this back when creating post
        access_url: result.accessUrl, // Client can use this to display the file
        success: true,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get presigned access URL for an existing file (read-only)
   */
  @GrpcMethod('PostService', 'GetFileAccessUrl')
  async getFileAccessUrl(data: {
    object_name: string;
  }) {
    try {
      if (!data.object_name) {
        throw new Error('Object name is required');
      }

      const accessUrl = await this.postService.getFileAccessUrl(data.object_name);

      return {
        access_url: accessUrl,
        success: true,
      };
    } catch (error) {
      throw error;
    }
  }
}

