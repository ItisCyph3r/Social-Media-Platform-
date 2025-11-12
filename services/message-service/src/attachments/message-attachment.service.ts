import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { StorageClientService } from '../clients/storage-client.service';

@Injectable()
export class MessageAttachmentService {
  constructor(
    @InjectRepository(MessageAttachment)
    private attachmentRepository: Repository<MessageAttachment>,
    private storageClientService: StorageClientService,
  ) {}

  /**
   * Find existing file by hash
   */
  async findExistingFile(fileHash: string): Promise<MessageAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { fileHash },
    });
  }

  /**
   * Upload file with deduplication support
   */
  async uploadFile(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
    userId: string,
  ): Promise<{
    objectName: string;
    fileHash: string;
    thumbnailObjectName: string | null;
    isNew: boolean;
  }> {
    // upload file 
    const result = await this.storageClientService.uploadFile(
      fileBuffer,
      fileName,
      mimeType,
      fileSize,
      'image', // Default to image, storage service will detect actual type
    );

    return {
      objectName: result.objectName,
      fileHash: result.fileHash,
      thumbnailObjectName: result.thumbnailObjectName,
      isNew: result.isNew,
    };
  }

  /**
   * Create attachment record in database
   * This is called after file is uploaded and message is created
   */
  async createAttachment(
    messageId: string,
    fileType: string,
    fileName: string,
    mimeType: string,
    fileSize: number,
    fileHash: string,
    objectName: string,
    thumbnailObjectName: string | null,
  ): Promise<MessageAttachment> {
    const existing = await this.attachmentRepository.findOne({
      where: { messageId },
    });

    if (existing) {
      throw new BadRequestException('Message already has an attachment');
    }

    // Check if file with same hash exists 
    const existingFile = await this.findExistingFile(fileHash);
    if (existingFile) {
      existingFile.referenceCount += 1;
      await this.attachmentRepository.save(existingFile);
      
      // Create new attachment record
      const attachment = this.attachmentRepository.create({
        messageId,
        fileType: existingFile.fileType,
        fileName: existingFile.fileName,
        mimeType: existingFile.mimeType,
        fileSize: existingFile.fileSize,
        fileHash: existingFile.fileHash,
        objectName: existingFile.objectName,
        thumbnailObjectName: existingFile.thumbnailObjectName,
        referenceCount: 1, 
      });
      return await this.attachmentRepository.save(attachment);
    }

    // Create new attachment
    const attachment = this.attachmentRepository.create({
      messageId,
      fileType,
      fileName,
      mimeType,
      fileSize,
      fileHash,
      objectName,
      thumbnailObjectName,
      referenceCount: 1,
    });

    return await this.attachmentRepository.save(attachment);
  }

  /**
   * Link existing attachment to a message
   */
  async linkAttachmentToMessage(
    messageId: string,
    fileHash: string,
  ): Promise<MessageAttachment> {
    const existingFile = await this.findExistingFile(fileHash);
    if (!existingFile) {
      throw new NotFoundException('File not found');
    }

    // Check if message already has attachment
    const existing = await this.attachmentRepository.findOne({
      where: { messageId },
    });

    if (existing) {
      throw new BadRequestException('Message already has an attachment');
    }

    // Increment reference count
    existingFile.referenceCount += 1;
    await this.attachmentRepository.save(existingFile);

    // Create new attachment record for this message
    const attachment = this.attachmentRepository.create({
      messageId,
      fileType: existingFile.fileType,
      fileName: existingFile.fileName,
      mimeType: existingFile.mimeType,
      fileSize: existingFile.fileSize,
      fileHash: existingFile.fileHash,
      objectName: existingFile.objectName,
      thumbnailObjectName: existingFile.thumbnailObjectName,
      referenceCount: 1,
    });

    return await this.attachmentRepository.save(attachment);
  }

  /**
   * Get attachment by message ID
   */
  async getAttachmentByMessageId(messageId: string): Promise<MessageAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { messageId },
    });
  }

  /**
   * Get attachment by ID
   */
  async getAttachmentById(attachmentId: string): Promise<MessageAttachment> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  /**
   * Decrement reference count and delete if no references
   */
  async decrementReferenceCount(attachmentId: string): Promise<void> {
    const attachment = await this.getAttachmentById(attachmentId);

    attachment.referenceCount -= 1;

    if (attachment.referenceCount <= 0) {
      // Delete from storage service (handles cross-service reference counting)
      try {
        await this.storageClientService.deleteFile(attachment.objectName);
        if (attachment.thumbnailObjectName) {
          await this.storageClientService.deleteFile(attachment.thumbnailObjectName);
        }
      } catch (error) {
        console.error(`Failed to delete file ${attachment.objectName}:`, error);
      }

      // Delete from database
      await this.attachmentRepository.remove(attachment);
    } else {
      // Save updated reference count
      await this.attachmentRepository.save(attachment);
    }
  }

  /**
   * Delete attachment (called when message is deleted)
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.decrementReferenceCount(attachmentId);
  }

  /**
   * Get presigned URL for file access
   */
  async getFileAccessUrl(
    objectName: string,
    expiresIn: number = 7 * 24 * 60 * 60, // 7 days
  ): Promise<string> {
    return await this.storageClientService.getFileAccessUrl(objectName, expiresIn);
  }

  /**
   * Get presigned URL for file upload
   */
  async getFileUploadUrl(
    fileName: string,
    contentType: string,
    expiresIn: number = 60 * 60, // 1 hour
  ): Promise<{ uploadUrl: string; objectName: string; accessUrl: string }> {
    return await this.storageClientService.getPresignedUploadUrl(fileName, contentType, expiresIn);
  }

  /**
   * Cleanup orphaned attachments
   */
  async cleanupOrphanedAttachments(): Promise<{ deleted: number; freed: number }> {
    const orphaned = await this.attachmentRepository.find({
      where: { referenceCount: 0 },
    });

    let freedBytes = 0;

    for (const attachment of orphaned) {
      // Delete from storage service
      try {
        await this.storageClientService.deleteFile(attachment.objectName);
        freedBytes += attachment.fileSize;

        if (attachment.thumbnailObjectName) {
          await this.storageClientService.deleteFile(attachment.thumbnailObjectName);
        }
      } catch (error) {
        console.error(`Failed to delete file ${attachment.objectName}:`, error);
      }

      // Delete from database
      await this.attachmentRepository.remove(attachment);
    }

    return {
      deleted: orphaned.length,
      freed: freedBytes,
    };
  }

  /**
   * Cleanup old attachments 
   */
  async cleanupOldAttachments(daysOld: number = 30): Promise<{ deleted: number; freed: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const oldAttachments = await this.attachmentRepository
      .createQueryBuilder('attachment')
      .where('attachment.createdAt < :cutoffDate', { cutoffDate })
      .andWhere('attachment.referenceCount = 0')
      .getMany();

    let freedBytes = 0;

    for (const attachment of oldAttachments) {
      // Delete from storage service
      try {
        await this.storageClientService.deleteFile(attachment.objectName);
        freedBytes += attachment.fileSize;

        if (attachment.thumbnailObjectName) {
          await this.storageClientService.deleteFile(attachment.thumbnailObjectName);
        }
      } catch (error) {
        console.error(`Failed to delete file ${attachment.objectName}:`, error);
      }

      // Delete from database
      await this.attachmentRepository.remove(attachment);
    }

    return {
      deleted: oldAttachments.length,
      freed: freedBytes,
    };
  }
}



