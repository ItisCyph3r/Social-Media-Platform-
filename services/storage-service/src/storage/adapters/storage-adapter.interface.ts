/**
 * Storage adapter interface for storage-agnostic file operations
 * Allows switching between different storage backends (MinIO, S3, Cloudinary, etc.)
 */
export interface IStorageAdapter {
  /**
   * Upload a file to storage
   */
  uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void>;

  /**
   * Generate a presigned URL for file upload
   */
  getUploadUrl(
    objectName: string,
    expiresIn: number,
    contentType?: string,
  ): Promise<string>;

  /**
   * Generate a presigned URL for file access
   */
  getAccessUrl(
    objectName: string,
    expiresIn: number,
  ): Promise<string>;

  /**
   * Delete a file from storage
   */
  deleteFile(objectName: string): Promise<void>;

  /**
   * Delete multiple files from storage
   */
  deleteFiles(objectNames: string[]): Promise<void>;

  /**
   * Check if a file exists in storage
   */
  fileExists(objectName: string): Promise<boolean>;

  /**
   * Ensure the bucket/container exists
   */
  ensureBucketExists(): Promise<void>;
}

