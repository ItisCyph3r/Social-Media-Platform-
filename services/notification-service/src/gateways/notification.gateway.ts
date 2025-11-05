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
import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../notification/notification.service';
import { AuthClientService } from '../clients/auth-client.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*', // Configure properly in production
  },
  namespace: '/notifications',
})
@Injectable()
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('NotificationGateway');
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  constructor(
    private notificationService: NotificationService,
    private authClient: AuthClientService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connecting: ${client.id}`);

    try {
      // Extract JWT token from handshake
      // Clients can send token in auth.token or query.token
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

      // Store userId on socket for later use
      client.userId = userId;

      // Track user's sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);

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
  }

  /**
   * Send notification to specific user via WebSocket
   */
  async sendNotificationToUser(userId: string, notification: any) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit('notification', notification);
      });
      this.logger.log(`Notification sent to user ${userId}`);
    } else {
      this.logger.debug(`User ${userId} not connected, notification will be shown when they reconnect`);
    }
  }

  /**
   * Send unread count update to user
   */
  async sendUnreadCountUpdate(userId: string, count: number) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets && userSockets.size > 0) {
      userSockets.forEach((socketId) => {
        this.server.to(socketId).emit('unread_count', { count });
      });
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() data: any) {
    if (client.userId) {
      this.logger.log(`User ${client.userId} subscribed to notifications`);
      // Client is now subscribed and will receive real-time notifications
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { notificationId: string },
  ) {
    if (client.userId) {
      await this.notificationService.markAsRead(client.userId, data.notificationId);
      // Update unread count
      const unreadCount = await this.notificationService.getUnreadCount(client.userId);
      this.sendUnreadCountUpdate(client.userId, unreadCount);
    }
  }
}

