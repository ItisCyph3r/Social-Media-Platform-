import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileMetadata } from '../../entities/file-metadata/file-metadata';

@Injectable()
export class DeduplicationService {
  constructor(
    @InjectRepository(FileMetadata)
    private fileMetadataRepository: Repository<FileMetadata>,
  ) {}

  /**
   * Find existing file by hash
   */
  async findExistingFile(fileHash: string): Promise<FileMetadata | null> {
    return await this.fileMetadataRepository.findOne({
      where: { fileHash },
    });
  }

  /**
   * Find file metadata by objectName
   */
  async findFileByObjectName(objectName: string): Promise<FileMetadata | null> {
    return await this.fileMetadataRepository.findOne({
      where: { objectName },
    });
  }

  /**
   * Create new file metadata
   */
  async createFileMetadata(
    fileHash: string,
    objectName: string,
    thumbnailObjectName: string | null,
    fileType: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    serviceName: string,
  ): Promise<FileMetadata> {
    const fileMetadata = this.fileMetadataRepository.create({
      fileHash,
      objectName,
      thumbnailObjectName,
      fileType,
      fileName,
      mimeType,
      fileSize,
      referenceCount: 1,
      serviceContexts: [serviceName],
    });

    return await this.fileMetadataRepository.save(fileMetadata);
  }

  /**
   * Increment reference count for existing file
   */
  async incrementReferenceCount(
    fileMetadata: FileMetadata,
    serviceName: string,
  ): Promise<FileMetadata> {
    // Add service context if not already present
    if (!fileMetadata.serviceContexts.includes(serviceName)) {
      fileMetadata.serviceContexts.push(serviceName);
    }

    fileMetadata.referenceCount += 1;
    return await this.fileMetadataRepository.save(fileMetadata);
  }

  /**
   * Decrement reference count for file
   * Returns true if file should be deleted (reference count reached 0)
   */
  async decrementReferenceCount(
    fileHash: string,
    serviceName: string,
  ): Promise<{ shouldDelete: boolean; fileMetadata: FileMetadata | null }> {
    const fileMetadata = await this.findExistingFile(fileHash);
    if (!fileMetadata) {
      return { shouldDelete: false, fileMetadata: null };
    }

    // Remove service context
    fileMetadata.serviceContexts = fileMetadata.serviceContexts.filter(
      (service) => service !== serviceName,
    );

    fileMetadata.referenceCount -= 1;

    if (fileMetadata.referenceCount <= 0) {
      // Delete file metadata
      await this.fileMetadataRepository.remove(fileMetadata);
      return { shouldDelete: true, fileMetadata: null };
    }

    const saved = await this.fileMetadataRepository.save(fileMetadata);
    return { shouldDelete: false, fileMetadata: saved };
  }

  /**
   * tODO Get files that should be cleaned up (reference count = 0)
   * This is for the cleanup job
   */
  async getFilesToCleanup(): Promise<FileMetadata[]> {
    return await this.fileMetadataRepository.find({
      where: { referenceCount: 0 },
    });
  }
}
