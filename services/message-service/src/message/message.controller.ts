import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { MessageService } from './message.service';
import { ConversationType } from '../entities/conversation.entity';

@Controller()
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

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

      return {
        conversations: conversations.map((conv) => ({
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
                created_at: conv.messages[0].createdAt.toISOString(),
              }
            : null,
          created_at: conv.createdAt.toISOString(),
        })),
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
  }) {
    try {
      const message = await this.messageService.sendMessage(
        data.conversation_id,
        data.sender_id,
        data.content,
      );

      return {
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        reply_to: null,
        shared_post: null,
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

      return {
        messages: messages.map((msg) => ({
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
          created_at: msg.createdAt.toISOString(),
        })),
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
}

