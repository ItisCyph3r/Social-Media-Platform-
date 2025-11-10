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
    data: { conversation_id: string; sender_id: string; content: string },
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

  async sendMessage(conversationId: string, senderId: string, content: string): Promise<{
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    replyTo: any;
    sharedPost: any;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.messageService.SendMessage(
        { conversation_id: conversationId, sender_id: senderId, content },
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
}

