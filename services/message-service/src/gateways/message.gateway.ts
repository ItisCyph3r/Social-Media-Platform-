import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { AuthClientService } from '../clients/auth-client.service';
import { UserClientService } from '../clients/user-client.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  conversationIds?: Set<string>; 
}

@WebSocketGateway({
  cors: {
    origin: '*', 
  },
  namespace: '/messages',
})
@Injectable()
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('MessageGateway');
  private userSockets: Map<string, Set<string>> = new Map(); 
  private socketUsers: Map<string, string> = new Map(); 

  constructor(
    private authClient: AuthClientService,
    private userClient: UserClientService,
    @Inject(forwardRef(() => MessageService))
    private messageService: MessageService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connecting: ${client.id}`);

    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without authentication token`);
        client.disconnect();
        return;
      }

      // Validate token via Auth Service
      const validation = await this.authClient.validateToken(token);

      if (!validation || !validation.valid) {
        this.logger.warn(`Client ${client.id} connected with invalid token`);
        client.disconnect();
        return;
      }

      // Extract userId from validated token
      const userId = validation.userId;

      if (!userId) {
        this.logger.warn(`Client ${client.id} token validation returned no userId`);
        client.disconnect();
        return;
      }

      // todo: Store userId on socket
      client.userId = userId;
      client.conversationIds = new Set();

      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      this.socketUsers.set(client.id, userId);

      this.logger.log(`User ${userId} authenticated and connected with socket ${client.id}`);
    } catch (error) {
      this.logger.error(`Error during connection for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnecting: ${client.id}`);

    if (client.userId) {
      const userSockets = this.userSockets.get(client.userId);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.userSockets.delete(client.userId);
        }
      }
    }

    this.socketUsers.delete(client.id);
  }

  /**
   * Subscribe to a conversation - join room and receive real-time messages
   */
  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id?: string; conversationId?: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    const conversationId = data.conversation_id || data.conversationId;
    if (!conversationId) {
      return { error: 'conversation_id is required' };
    }

    try {
      // Verify user is a participant
      await this.messageService.getConversation(conversationId, client.userId);

      // Join room for this conversation
      client.join(`conversation:${conversationId}`);
      client.conversationIds?.add(conversationId);

      this.logger.log(`User ${client.userId} joined conversation ${conversationId}`);
      return { success: true, conversationId };
    } catch (error) {
      this.logger.error(`Error joining conversation:`, error);
      return { error: 'Failed to join conversation' };
    }
  }

  /**
   * Leave a conversation room
   */
  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id?: string; conversationId?: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    const conversationId = data.conversation_id || data.conversationId;
    if (!conversationId) {
      return { error: 'conversation_id is required' };
    }

    client.leave(`conversation:${conversationId}`);
    client.conversationIds?.delete(conversationId);

    this.logger.log(`User ${client.userId} left conversation ${conversationId}`);
    return { success: true, conversationId };
  }

  /**
   * Send typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id?: string; conversationId?: string; isTyping: boolean },
  ) {
    if (!client.userId) {
      return;
    }

    const conversationId = data.conversation_id || data.conversationId;
    if (!conversationId) {
      return;
    }

    // todo Broadcast typing indicator to all other participants in the conversation
    client.to(`conversation:${conversationId}`).emit('typing', {
      userId: client.userId,
      conversationId,
      isTyping: data.isTyping,
    });
  }

  /**
   * Get messages for a conversation via WebSocket
   */
  @SubscribeMessage('get_messages')
  async handleGetMessages(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversation_id: string; page?: number; limit?: number },
  ) {
    if (!client.userId) {
      this.logger.error('get_messages: User not authenticated');
      return { error: 'Not authenticated' };
    }

    if (!data.conversation_id) {
      this.logger.error('get_messages: conversation_id is required');
      return { error: 'conversation_id is required' };
    }

    try {
      this.logger.log(`Getting messages for conversation ${data.conversation_id}, page ${data.page || 1}`);
      const result = await this.messageService.getMessages(
        data.conversation_id,
        client.userId,
        data.page || 1,
        data.limit || 50,
      );

      this.logger.log(`Found ${result.messages.length} messages for conversation ${data.conversation_id}`);

      const attachmentService = this.messageService.getAttachmentService();
      
      const uniqueSenderIds = Array.from(new Set(result.messages.map(msg => msg.senderId)));
      const senderProfiles = await this.userClient.getProfiles(uniqueSenderIds);

      const messagesData = {
        conversation_id: data.conversation_id,
        messages: await Promise.all(
          result.messages.map(async (msg) => {
            let attachmentData: {
              id: string;
              file_type: string;
              file_name: string;
              mime_type: string;
              file_size: string;
              access_url: string;
              thumbnail_access_url: string | null;
            } | null = null;
            if (msg.attachment) {
              const accessUrl = await attachmentService.getFileAccessUrl(msg.attachment.objectName);
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

            // Get sender profile from batch-fetched profiles
            const senderProfile = senderProfiles.get(msg.senderId) || { username: 'Unknown', profile_picture: '' };

            return {
              id: msg.id,
              conversation_id: msg.conversationId,
              sender_id: msg.senderId,
              content: msg.content,
              reply_to_message_id: msg.replyToMessageId,
              attachment: attachmentData,
              sender: senderProfile,
              created_at: msg.createdAt.toISOString(),
            };
          }),
        ),
        total: result.total,
        page: result.page,
      };

      this.logger.log(`Emitting messages:loaded for conversation ${data.conversation_id}`);
      client.emit('messages:loaded', messagesData);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error getting messages:`, error);
      return { error: error instanceof Error ? error.message : 'Failed to get messages' };
    }
  }

  /**
   * Send a message via WebSocket
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: {
      conversation_id: string;
      content: string;
      reply_to_message_id?: string;
      attachment_file_hash?: string;
      attachment_object_name?: string;
      attachment_file_name?: string;
      attachment_file_size?: number;
      attachment_mime_type?: string;
    },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    try {
      // Use sendMessage for all cases 
      const message = await this.messageService.sendMessage(
        data.conversation_id,
        client.userId,
        data.content,
        data.attachment_file_hash,
        data.attachment_object_name,
        data.attachment_file_name,
        data.attachment_file_size,
        data.attachment_mime_type,
        data.reply_to_message_id,
      );

      return {
        success: true,
        message: {
          id: message.id,
          conversation_id: message.conversationId,
          sender_id: message.senderId,
          content: message.content,
          reply_to_message_id: message.replyToMessageId,
          created_at: message.createdAt.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`Error sending message:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      this.logger.error(`Error details: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * Send new message to all participants in a conversation
   */
  async sendMessageToConversation(conversationId: string, message: any, excludeUserId?: string) {
    // Send to all sockets in the conversation room
    this.server.to(`conversation:${conversationId}`).emit('message:new', {
      ...message,
      conversationId,
    });

    // Also send to user's other devices if not excluded
    if (excludeUserId && this.server.sockets && this.server.sockets.sockets) {
      const userSockets = this.userSockets.get(excludeUserId);
      if (userSockets) {
        userSockets.forEach((socketId) => {
          try {
            const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket;
            if (socket && socket.conversationIds?.has(conversationId)) {
              socket.emit('message:new', {
                ...message,
                conversationId,
              });
            }
          } catch (error) {
            this.logger.warn(`Error sending message to socket ${socketId}:`, error);
            userSockets.delete(socketId);
            this.socketUsers.delete(socketId);
          }
        });
      }
    }
  }

  /**
   * Send conversation update
   */
  async sendConversationUpdate(conversationId: string, update: any) {
    this.server.to(`conversation:${conversationId}`).emit('conversation:updated', {
      conversationId,
      ...update,
    });
  }

  /**
   * Send message deleted event to all participants
   */
  async sendMessageDeleted(conversationId: string, messageId: string) {
    this.server.to(`conversation:${conversationId}`).emit('message:deleted', {
      conversationId,
      messageId,
    });
  }
}

