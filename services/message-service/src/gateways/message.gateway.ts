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

interface AuthenticatedSocket extends Socket {
  userId?: string;
  conversationIds?: Set<string>; // Track which conversations user is subscribed to
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly in production
  },
  namespace: '/messages',
})
@Injectable()
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('MessageGateway');
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId

  constructor(
    private authClient: AuthClientService,
    @Inject(forwardRef(() => MessageService))
    private messageService: MessageService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connecting: ${client.id}`);

    try {
      // Extract JWT token from handshake
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

      // Store userId on socket
      client.userId = userId;
      client.conversationIds = new Set();

      // Track user's sockets
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
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    try {
      // Verify user is a participant
      await this.messageService.getConversation(data.conversationId, client.userId);

      // Join room for this conversation
      client.join(`conversation:${data.conversationId}`);
      client.conversationIds?.add(data.conversationId);

      this.logger.log(`User ${client.userId} joined conversation ${data.conversationId}`);
      return { success: true, conversationId: data.conversationId };
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
    @MessageBody() data: { conversationId: string },
  ) {
    if (!client.userId) {
      return { error: 'Not authenticated' };
    }

    client.leave(`conversation:${data.conversationId}`);
    client.conversationIds?.delete(data.conversationId);

    this.logger.log(`User ${client.userId} left conversation ${data.conversationId}`);
    return { success: true, conversationId: data.conversationId };
  }

  /**
   * Send typing indicator
   */
  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    if (!client.userId) {
      return;
    }

    // Broadcast typing indicator to all other participants in the conversation
    client.to(`conversation:${data.conversationId}`).emit('typing', {
      userId: client.userId,
      conversationId: data.conversationId,
      isTyping: data.isTyping,
    });
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
    if (excludeUserId) {
      const userSockets = this.userSockets.get(excludeUserId);
      if (userSockets) {
        userSockets.forEach((socketId) => {
          const socket = this.server.sockets.sockets.get(socketId) as AuthenticatedSocket;
          if (socket && socket.conversationIds?.has(conversationId)) {
            socket.emit('message:new', {
              ...message,
              conversationId,
            });
          }
        });
      }
    }
  }

  /**
   * Send conversation update (participant added/removed)
   */
  async sendConversationUpdate(conversationId: string, update: any) {
    this.server.to(`conversation:${conversationId}`).emit('conversation:updated', {
      conversationId,
      ...update,
    });
  }
}

