import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface MessageServiceClient {
  CreateConversation(
    data: { type: string; name?: string; participant_ids: string[]; creator_id: string },
    callback: (error: any, response: {
      id: string;
      type: string;
      name: string;
      participants: Array<{ user_id: string; role: string; joined_at: string }>;
      last_message: any;
      created_at: string;
    }) => void,
  ): void;
  GetConversations(
    data: { user_id: string; page?: number; limit?: number },
    callback: (error: any, response: {
      conversations: Array<{
        id: string;
        type: string;
        name: string;
        participants: Array<{ user_id: string; role: string; joined_at: string }>;
        last_message: any;
        created_at: string;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  GetConversation(
    data: { conversation_id: string; user_id: string },
    callback: (error: any, response: {
      id: string;
      type: string;
      name: string;
      participants: Array<{ user_id: string; role: string; joined_at: string }>;
      last_message: any;
      created_at: string;
    }) => void,
  ): void;
  SendMessage(
    data: { 
      conversation_id: string; 
      sender_id: string; 
      content: string;
      attachment_file_hash?: string;
      attachment_object_name?: string;
    },
    callback: (error: any, response: {
      id: string;
      conversation_id: string;
      sender_id: string;
      content: string;
      reply_to: any;
      shared_post: any;
      attachment: any;
      created_at: string;
    }) => void,
  ): void;
  GetMessages(
    data: { conversation_id: string; user_id: string; page?: number; limit?: number },
    callback: (error: any, response: {
      messages: Array<{
        id: string;
        conversation_id: string;
        sender_id: string;
        content: string;
        reply_to: any;
        shared_post: any;
        created_at: string;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  ReplyToMessage(
    data: { conversation_id: string; sender_id: string; content: string; reply_to_message_id: string },
    callback: (error: any, response: {
      id: string;
      conversation_id: string;
      sender_id: string;
      content: string;
      reply_to: any;
      shared_post: any;
      created_at: string;
    }) => void,
  ): void;
  SharePost(
    data: { conversation_id: string; sender_id: string; post_id: string; message?: string },
    callback: (error: any, response: {
      id: string;
      conversation_id: string;
      sender_id: string;
      content: string;
      reply_to: any;
      shared_post: any;
      created_at: string;
    }) => void,
  ): void;
  AddParticipant(
    data: { conversation_id: string; user_id: string; added_by_user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  RemoveParticipant(
    data: { conversation_id: string; user_id: string; removed_by_user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  DeleteMessage(
    data: { conversation_id: string; message_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  DeleteConversation(
    data: { conversation_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  UploadMessageAttachment(
    data: { file_name: string; mime_type: string; file_size: number; user_id: string },
    callback: (error: any, response: {
      upload_url: string;
      object_name: string;
      file_hash: string;
      expires_in: number;
    }) => void,
  ): void;
  GetMessageAttachment(
    data: { attachment_id: string },
    callback: (error: any, response: {
      id: string;
      message_id: string;
      file_type: string;
      file_name: string;
      mime_type: string;
      file_size: string;
      file_hash: string;
      object_name: string;
      thumbnail_object_name: string;
      access_url: string;
      thumbnail_access_url: string;
    }) => void,
  ): void;
  MarkConversationAsRead(
    data: { conversation_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  GetUnreadCount(
    data: { conversation_id: string; user_id: string },
    callback: (error: any, response: { count: number }) => void,
  ): void;
  GetUnreadCounts(
    data: { user_id: string },
    callback: (error: any, response: { unread_counts: Record<string, number> }) => void,
  ): void;
  UploadFileBuffer(
    data: {
      file_data: Buffer;
      file_name: string;
      mime_type: string;
      file_size: number;
      user_id: string;
      object_name: string;
    },
    callback: (error: any, response: {
      object_name: string;
      file_hash: string;
      success: boolean;
      message: string;
    }) => void,
  ): void;
}

@Injectable()
export class MessageClientService implements OnModuleInit {
  private messageService: MessageServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const messageServiceUrl = this.configService.get<string>('MESSAGE_SERVICE_GRPC_URL') || 'localhost:5004';
    const protoPath = join(__dirname, '../../../../shared/protos/message.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const messageProto = grpc.loadPackageDefinition(packageDefinition).message as any;

    this.messageService = new messageProto.MessageService(
      messageServiceUrl,
      grpc.credentials.createInsecure(),
    ) as MessageServiceClient;

    console.log('[MessageClientService] Connected to Message Service');
  }

  async createConversation(
    creatorId: string,
    type: string,
    participantIds: string[],
    name?: string,
  ): Promise<{
    id: string;
    type: string;
    name: string;
    participants: Array<{ userId: string; role: string; joinedAt: string }>;
    lastMessage: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      const requestData = { type, name, participant_ids: participantIds, creator_id: creatorId };
      this.messageService.CreateConversation(
        requestData,
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to create conversation'));
          } else {
            resolve({
              id: response.id,
              type: response.type,
              name: response.name || '',
              participants: (response.participants || []).map((p: any) => ({
                userId: p.user_id,
                role: p.role,
                joinedAt: p.joined_at,
              })),
              lastMessage: response.last_message,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async getConversations(userId: string, page: number = 1, limit: number = 20): Promise<{
    conversations: Array<{
      id: string;
      type: string;
      name: string;
      participants: Array<{ userId: string; role: string; joinedAt: string }>;
      lastMessage: any;
      createdAt: string;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.GetConversations(
        { user_id: userId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get conversations'));
          } else {
            resolve({
              conversations: (response.conversations || []).map((conv: any) => ({
                id: conv.id,
                type: conv.type,
                name: conv.name || '',
                participants: (conv.participants || []).map((p: any) => ({
                  userId: p.user_id,
                  role: p.role,
                  joinedAt: p.joined_at,
                })),
                lastMessage: conv.last_message,
                createdAt: conv.created_at,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async getConversation(conversationId: string, userId: string): Promise<{
    id: string;
    type: string;
    name: string;
    participants: Array<{ userId: string; role: string; joinedAt: string }>;
    lastMessage: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.GetConversation(
        { conversation_id: conversationId, user_id: userId },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get conversation'));
          } else {
            resolve({
              id: response.id,
              type: response.type,
              name: response.name || '',
              participants: (response.participants || []).map((p: any) => ({
                userId: p.user_id,
                role: p.role,
                joinedAt: p.joined_at,
              })),
              lastMessage: response.last_message,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    attachmentFileHash?: string,
    attachmentObjectName?: string,
  ): Promise<{
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyTo: any;
    sharedPost: any;
    attachment: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.SendMessage(
        {
          conversation_id: conversationId,
          sender_id: senderId,
          content,
          attachment_file_hash: attachmentFileHash,
          attachment_object_name: attachmentObjectName,
        },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to send message'));
          } else {
            resolve({
              id: response.id,
              conversationId: response.conversation_id,
              senderId: response.sender_id,
              content: response.content,
              replyTo: response.reply_to,
              sharedPost: response.shared_post,
              attachment: response.attachment,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async getMessages(conversationId: string, userId: string, page: number = 1, limit: number = 50): Promise<{
    messages: Array<{
      id: string;
      conversationId: string;
      senderId: string;
      content: string;
      replyTo: any;
      sharedPost: any;
      attachment: any;
      createdAt: string;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.GetMessages(
        { conversation_id: conversationId, user_id: userId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get messages'));
          } else {
            resolve({
              messages: (response.messages || []).map((msg: any) => ({
                id: msg.id,
                conversationId: msg.conversation_id,
                senderId: msg.sender_id,
                content: msg.content,
                replyTo: msg.reply_to,
                sharedPost: msg.shared_post,
                attachment: msg.attachment,
                createdAt: msg.created_at,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async replyToMessage(
    conversationId: string,
    senderId: string,
    content: string,
    replyToMessageId: string,
  ): Promise<{
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyTo: any;
    sharedPost: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.ReplyToMessage(
        { conversation_id: conversationId, sender_id: senderId, content, reply_to_message_id: replyToMessageId },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to reply to message'));
          } else {
            resolve({
              id: response.id,
              conversationId: response.conversation_id,
              senderId: response.sender_id,
              content: response.content,
              replyTo: response.reply_to,
              sharedPost: response.shared_post,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async sharePost(
    conversationId: string,
    senderId: string,
    postId: string,
    message?: string,
  ): Promise<{
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyTo: any;
    sharedPost: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.SharePost(
        { conversation_id: conversationId, sender_id: senderId, post_id: postId, message },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to share post'));
          } else {
            resolve({
              id: response.id,
              conversationId: response.conversation_id,
              senderId: response.sender_id,
              content: response.content,
              replyTo: response.reply_to,
              sharedPost: response.shared_post,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async addParticipant(conversationId: string, userId: string, addedByUserId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const requestData = { conversation_id: conversationId, user_id: userId, added_by_user_id: addedByUserId };
      // console.log('[MessageClientService] AddParticipant sending:', JSON.stringify(requestData, null, 2));
      this.messageService.AddParticipant(
        requestData,
        (error, response) => {
          if (error) {
            // console.error('[MessageClientService] AddParticipant error:', error);
            reject(error);
          } else if (!response?.success) {
            reject(new Error(response?.message || 'Failed to add participant'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async removeParticipant(conversationId: string, userId: string, removedByUserId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const requestData = { conversation_id: conversationId, user_id: userId, removed_by_user_id: removedByUserId };
      // console.log('[MessageClientService] RemoveParticipant sending:', JSON.stringify(requestData, null, 2));
      this.messageService.RemoveParticipant(
        requestData,
        (error, response) => {
          if (error) {
            // console.error('[MessageClientService] RemoveParticipant error:', error);
            reject(error);
          } else if (!response?.success) {
            reject(new Error(response?.message || 'Failed to remove participant'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async deleteMessage(conversationId: string, messageId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.messageService.DeleteMessage(
        { conversation_id: conversationId, message_id: messageId, user_id: userId },
        (error, response) => {
          if (error) {
            reject(error);
          } else if (!response?.success) {
            reject(new Error(response?.message || 'Failed to delete message'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.messageService.DeleteConversation(
        { conversation_id: conversationId, user_id: userId },
        (error, response) => {
          if (error) {
            reject(error);
          } else if (!response?.success) {
            reject(new Error(response?.message || 'Failed to delete conversation'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async uploadMessageAttachment(
    fileName: string,
    mimeType: string,
    fileSize: number,
    userId: string,
  ): Promise<{
    uploadUrl: string;
    objectName: string;
    fileHash: string;
    expiresIn: number;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.UploadMessageAttachment(
        {
          file_name: fileName,
          mime_type: mimeType,
          file_size: fileSize,
          user_id: userId,
        },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get upload URL'));
          } else {
            resolve({
              uploadUrl: response.upload_url,
              objectName: response.object_name,
              fileHash: response.file_hash,
              expiresIn: response.expires_in,
            });
          }
        },
      );
    });
  }

  async getMessageAttachment(attachmentId: string): Promise<{
    id: string;
    messageId: string;
    fileType: string;
    fileName: string;
    mimeType: string;
    fileSize: string;
    fileHash: string;
    objectName: string;
    thumbnailObjectName: string;
    accessUrl: string;
    thumbnailAccessUrl: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.GetMessageAttachment(
        { attachment_id: attachmentId },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get attachment'));
          } else {
            resolve({
              id: response.id,
              messageId: response.message_id,
              fileType: response.file_type,
              fileName: response.file_name,
              mimeType: response.mime_type,
              fileSize: response.file_size,
              fileHash: response.file_hash,
              objectName: response.object_name,
              thumbnailObjectName: response.thumbnail_object_name,
              accessUrl: response.access_url,
              thumbnailAccessUrl: response.thumbnail_access_url,
            });
          }
        },
      );
    });
  }

  async markConversationAsRead(conversationId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.messageService.MarkConversationAsRead(
        { conversation_id: conversationId, user_id: userId },
        (error, response) => {
          if (error || !response?.success) {
            reject(error || new Error('Failed to mark conversation as read'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.messageService.GetUnreadCount(
        { conversation_id: conversationId, user_id: userId },
        (error, response) => {
          if (error || response === undefined) {
            reject(error || new Error('Failed to get unread count'));
          } else {
            resolve(response.count || 0);
          }
        },
      );
    });
  }

  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      this.messageService.GetUnreadCounts(
        { user_id: userId },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get unread counts'));
          } else {
            resolve(response.unread_counts || {});
          }
        },
      );
    });
  }

  async uploadFileBuffer(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    fileSize: number,
    userId: string,
    objectName: string,
  ): Promise<{
    objectName: string;
    fileHash: string;
    success: boolean;
    message: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.UploadFileBuffer(
        {
          file_data: fileBuffer,
          file_name: fileName,
          mime_type: mimeType,
          file_size: fileSize,
          user_id: userId,
          object_name: objectName,
        },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to upload file'));
          } else {
            resolve({
              objectName: response.object_name,
              fileHash: response.file_hash,
              success: response.success,
              message: response.message,
            });
          }
        },
      );
    });
  }
}

