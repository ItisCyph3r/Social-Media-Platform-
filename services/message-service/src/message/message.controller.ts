import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessageService } from './message.service';
import { ConversationType } from '../entities/conversation.entity';

@Controller()
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
  ) {}

  @GrpcMethod('MessageService', 'CreateConversation')
  async createConversation(data: {
    type: string;
    name?: string;
    participant_ids: string[];
    creator_id?: string; // From auth context
  }) {
    try {
      if (!data.creator_id) {
        throw new Error('creator_id is required');
      }

      const conversation = await this.messageService.createConversation(
        data.creator_id,
        data.type as ConversationType,
        data.participant_ids,
        data.name,
      );

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name || '',
        participants: conversation.participants.map((p) => ({
          user_id: p.userId,
          role: p.role,
          joined_at: p.joinedAt.toISOString(),
        })),
        last_message: null, 
        created_at: conversation.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'GetConversations')
  async getConversations(data: {
    user_id: string;
    page?: number;
    limit?: number;
  }) {
    try {
      const { conversations, total, page } = await this.messageService.getConversations(
        data.user_id,
        data.page || 1,
        data.limit || 20,
      );

      const unreadCounts = await this.messageService.getUnreadCounts(data.user_id);

      return {
        conversations: await Promise.all(
          conversations.map(async (conv) => {
            const unreadCount = unreadCounts[conv.id] || 0;
            return {
              id: conv.id,
              type: conv.type,
              name: conv.name || '',
              participants: conv.participants
                .filter((p) => p.isActive)
                .map((p) => ({
                  user_id: p.userId,
                  role: p.role,
                  joined_at: p.joinedAt.toISOString(),
                })),
              last_message: conv.messages && conv.messages.length > 0
                ? {
                    id: conv.messages[0].id,
                    conversation_id: conv.messages[0].conversationId,
                    sender_id: conv.messages[0].senderId,
                    content: conv.messages[0].content,
                    reply_to: null,
                    shared_post: null,
                    attachment: null,
                    created_at: conv.messages[0].createdAt.toISOString(),
                  }
                : null,
              created_at: conv.createdAt.toISOString(),
              unread_count: unreadCount,
            };
          }),
        ),
        total,
        page,
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'GetConversation')
  async getConversation(data: {
    conversation_id: string;
    user_id?: string; // From auth context
  }) {
    try {
      if (!data.user_id) {
        throw new Error('user_id is required');
      }

      const conversation = await this.messageService.getConversation(
        data.conversation_id,
        data.user_id,
      );

      return {
        id: conversation.id,
        type: conversation.type,
        name: conversation.name || '',
        participants: conversation.participants
          .filter((p) => p.isActive)
          .map((p) => ({
            user_id: p.userId,
            role: p.role,
            joined_at: p.joinedAt.toISOString(),
          })),
        last_message: null,
        created_at: conversation.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'SendMessage')
  async sendMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    attachment_file_hash?: string;
    attachment_object_name?: string;
  }) {
    try {
      const message = await this.messageService.sendMessage(
        data.conversation_id,
        data.sender_id,
        data.content,
        data.attachment_file_hash,
        data.attachment_object_name,
      );

      const messageWithAttachment = await this.messageService.getMessageWithAttachment(message.id);

      // Get attachment access URLs if exists
      let attachmentResponse: any = null;
      if (messageWithAttachment?.attachment) {
        const attachment = messageWithAttachment.attachment;
        const accessUrl = await this.messageService.getAttachmentAccessUrl(attachment.objectName);
        let thumbnailAccessUrl: string | null = null;
        if (attachment.thumbnailObjectName) {
          thumbnailAccessUrl = await this.messageService.getAttachmentAccessUrl(
            attachment.thumbnailObjectName,
          );
        }

        attachmentResponse = {
          id: attachment.id,
          file_type: attachment.fileType,
          file_name: attachment.fileName,
          mime_type: attachment.mimeType,
          file_size: attachment.fileSize.toString(),
          access_url: accessUrl,
          thumbnail_access_url: thumbnailAccessUrl,
        };
      }

      return {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        reply_to: null,
        shared_post: null,
        attachment: attachmentResponse,
        created_at: message.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'GetMessages')
  async getMessages(data: {
    conversation_id: string;
    user_id?: string; // From auth context
    page?: number;
    limit?: number;
  }) {
    try {
      if (!data.user_id) {
        throw new Error('user_id is required');
      }

      const { messages, total, page } = await this.messageService.getMessages(
        data.conversation_id,
        data.user_id,
        data.page || 1,
        data.limit || 50,
      );

      // Get attachment access URLs for all messages
      const attachmentService = this.messageService.getAttachmentService();
      const messagesWithAttachments = await Promise.all(
        messages.map(async (msg) => {
          let attachmentData: any = null;
          if (msg.attachment) {
            const accessUrl = await attachmentService.getFileAccessUrl(
              msg.attachment.objectName,
            );
            let thumbnailAccessUrl: string | null = null;
            if (msg.attachment.thumbnailObjectName) {
              thumbnailAccessUrl = await attachmentService.getFileAccessUrl(
                msg.attachment.thumbnailObjectName,
              );
            }

            attachmentData = {
              id: msg.attachment.id,
              file_type: msg.attachment.fileType,
              file_name: msg.attachment.fileName,
              mime_type: msg.attachment.mimeType,
              file_size: msg.attachment.fileSize.toString(),
              access_url: accessUrl,
              thumbnail_access_url: thumbnailAccessUrl,
            };
          }

          return {
            id: msg.id,
            conversation_id: msg.conversationId,
            sender_id: msg.senderId,
            content: msg.content,
            reply_to: msg.replyToMessage
              ? {
                  id: msg.replyToMessage.id,
                  conversation_id: msg.replyToMessage.conversationId,
                  sender_id: msg.replyToMessage.senderId,
                  content: msg.replyToMessage.content,
                  reply_to: null,
                  shared_post: null,
                  attachment: null,
                  created_at: msg.replyToMessage.createdAt.toISOString(),
                }
              : null,
            shared_post: msg.sharedPost
              ? {
                  id: msg.sharedPost.postId,
                  user_id: msg.sharedPost.sharedByUserId,
                  content: '',
                  media_urls: [],
                }
              : null,
            attachment: attachmentData,
            created_at: msg.createdAt.toISOString(),
          };
        }),
      );

      return {
        messages: messagesWithAttachments,
        total,
        page,
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'ReplyToMessage')
  async replyToMessage(data: {
    conversation_id: string;
    sender_id: string;
    content: string;
    reply_to_message_id: string;
  }) {
    try {
      const message = await this.messageService.replyToMessage(
        data.conversation_id,
        data.sender_id,
        data.content,
        data.reply_to_message_id,
      );

      return {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        reply_to: message.replyToMessage
          ? {
              id: message.replyToMessage.id,
              conversation_id: message.replyToMessage.conversationId,
              sender_id: message.replyToMessage.senderId,
              content: message.replyToMessage.content,
              reply_to: null,
              shared_post: null,
              created_at: message.replyToMessage.createdAt.toISOString(),
            }
          : null,
        shared_post: null,
        created_at: message.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'SharePost')
  async sharePost(data: {
    conversation_id: string;
    sender_id: string;
    post_id: string;
    message?: string;
  }) {
    try {
      const message = await this.messageService.sharePost(
        data.conversation_id,
        data.sender_id,
        data.post_id,
        data.message,
      );

      return {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        reply_to: null,
        shared_post: message.sharedPost
          ? {
              id: message.sharedPost.postId,
              user_id: message.sharedPost.sharedByUserId,
              content: '',
              media_urls: [],
            }
          : null,
        created_at: message.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'AddParticipant')
  async addParticipant(data: {
    conversation_id: string;
    user_id: string;
    added_by_user_id?: string; // From auth context
  }) {
    try {
      if (!data.added_by_user_id) {
        // console.error('[MessageController] added_by_user_id is missing!');
        throw new Error('added_by_user_id is required');
      }

      await this.messageService.addParticipant(
        data.conversation_id,
        data.user_id,
        data.added_by_user_id,
      );

      return {
        success: true,
        message: 'Participant added successfully',
      };
    } catch (error) {
      // console.error('[MessageController] AddParticipant error:', error);
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'RemoveParticipant')
  async removeParticipant(data: {
    conversation_id: string;
    user_id: string;
    removed_by_user_id?: string; // From auth context
  }) {
    try {
      if (!data.removed_by_user_id) {
        // console.error('[MessageController] removed_by_user_id is missing!');
        throw new Error('removed_by_user_id is required');
      }

      await this.messageService.removeParticipant(
        data.conversation_id,
        data.user_id,
        data.removed_by_user_id,
      );

      return {
        success: true,
        message: 'Participant removed successfully',
      };
    } catch (error) {
      // console.error('[MessageController] RemoveParticipant error:', error);
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'DeleteMessage')
  async deleteMessage(data: {
    conversation_id: string;
    message_id: string;
    user_id?: string; // From auth context
  }) {
    try {
      if (!data.user_id) {
        throw new Error('user_id is required');
      }

      await this.messageService.deleteMessage(
        data.conversation_id,
        data.message_id,
        data.user_id,
      );

      return {
        success: true,
        message: 'Message deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'DeleteConversation')
  async deleteConversation(data: {
    conversation_id: string;
    user_id?: string; 
  }) {
    try {
      if (!data.user_id) {
        throw new Error('user_id is required');
      }

      await this.messageService.deleteConversation(
        data.conversation_id,
        data.user_id,
      );

      return {
        success: true,
        message: 'Conversation deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'UploadMessageAttachment')
  async uploadMessageAttachment(data: {
    file_name: string;
    mime_type: string;
    file_size: number;
    user_id: string;
  }) {
    try {
      // Note: Full validation happens after file is uploaded
      // Here we just do basic checks (size, extension, MIME type)
      // Magic bytes validation happens after upload
      
      // Basic validation - check file size
      const maxSize = 50 * 1024 * 1024; // 50MB max
      if (data.file_size > maxSize) {
        throw new Error('File size exceeds maximum allowed size of 50MB');
      }

      if (data.file_size === 0) {
        throw new Error('File is empty');
      }

      const attachmentService = this.messageService.getAttachmentService();

      // Generate presigned upload URL (storage service will detect file type from mime type/extension)
      const result = await attachmentService.getFileUploadUrl(
        data.file_name,
        data.mime_type || 'application/octet-stream',
        3600, // 1 hour
      );

      return {
        upload_url: result.uploadUrl,
        object_name: result.objectName,
        file_hash: '', // Will be returned after actual upload
        expires_in: 3600, // 1 hour
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'UploadFileBuffer')
  async uploadFileBuffer(data: {
    file_data: Buffer;
    file_name: string;
    mime_type: string;
    file_size: number;
    user_id: string;
    object_name: string;
  }) {
    try {
      const attachmentService = this.messageService.getAttachmentService();

      // Upload and process the file
      const result = await attachmentService.uploadFile(
        Buffer.from(data.file_data),
        data.file_name,
        data.mime_type,
        data.file_size,
        data.user_id,
      );

      // Delete temporary file if it exists and is different from final object name
      // Note: This is handled by the storage service's deduplication, so we can skip this
      // The storage service will handle cleanup of temporary files

      return {
        object_name: result.objectName,
        file_hash: result.fileHash,
        success: true,
        message: 'File uploaded successfully',
      };
    } catch (error) {
      return {
        object_name: '',
        file_hash: '',
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  @GrpcMethod('MessageService', 'GetMessageAttachment')
  async getMessageAttachment(data: { attachment_id: string }) {
    try {
      const attachmentService = this.messageService.getAttachmentService();
      const attachment = await attachmentService.getAttachmentById(data.attachment_id);

      const accessUrl = await attachmentService.getFileAccessUrl(attachment.objectName);
      let thumbnailAccessUrl: string | null = null;
      if (attachment.thumbnailObjectName) {
        thumbnailAccessUrl = await attachmentService.getFileAccessUrl(
          attachment.thumbnailObjectName,
        );
      }

      return {
        id: attachment.id,
        message_id: attachment.messageId,
        file_type: attachment.fileType,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType,
        file_size: attachment.fileSize.toString(),
        file_hash: attachment.fileHash,
        object_name: attachment.objectName,
        thumbnail_object_name: attachment.thumbnailObjectName || '',
        access_url: accessUrl,
        thumbnail_access_url: thumbnailAccessUrl || '',
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'MarkConversationAsRead')
  async markConversationAsRead(data: { conversation_id: string; user_id: string }) {
    try {
      await this.messageService.markConversationAsRead(data.conversation_id, data.user_id);
      return {
        success: true,
        message: 'Conversation marked as read',
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'GetUnreadCount')
  async getUnreadCount(data: { conversation_id: string; user_id: string }) {
    try {
      const count = await this.messageService.getUnreadCount(data.conversation_id, data.user_id);
      return { count };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('MessageService', 'GetUnreadCounts')
  async getUnreadCounts(data: { user_id: string }) {
    try {
      const unreadCounts = await this.messageService.getUnreadCounts(data.user_id);
      return { unread_counts: unreadCounts };
    } catch (error) {
      throw error;
    }
  }
}

