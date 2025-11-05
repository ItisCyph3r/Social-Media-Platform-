import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../gateways/notification.gateway';
import { EmailService } from '../email/email.service';
import { AuthClientService } from '../clients/auth-client.service';

@Injectable()
export class EventsConsumer implements OnModuleInit, OnModuleDestroy {
  private channelModel: any = null;
  private channel: any = null;
  private readonly exchange = 'notifications';
  private readonly queue = 'notification-service-events';

  constructor(
    private configService: ConfigService,
    private notificationService: NotificationService,
    private notificationGateway: NotificationGateway,
    private emailService: EmailService,
    private authClient: AuthClientService,
  ) {}

  async onModuleInit() {
    try {
      const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL') || 'amqp://admin:admin@localhost:2672';
      this.channelModel = await amqp.connect(rabbitmqUrl);
      
      if (!this.channelModel) {
        throw new Error('Failed to create RabbitMQ connection');
      }
      
      this.channel = await this.channelModel.createChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }
      
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue(this.queue, {
        durable: true,
      });

      // Bind to ALL notification events
      const routingKeys = [
        'user.created',
        'post.created',
        'post.liked',
        'post.unliked',
        'post.commented',
        'comment.mentioned',
        'message.received',
      ];

      for (const routingKey of routingKeys) {
        await this.channel.bindQueue(this.queue, this.exchange, routingKey);
      }

      // Consume messages
      await this.channel.consume(
        this.queue,
        async (msg) => {
          if (msg && this.channel) {
            try {
              const content = JSON.parse(msg.content.toString());
              await this.handleEvent(content);
              this.channel.ack(msg);
            } catch (error) {
              console.error('[EventsConsumer] Error processing message:', error);
              // Don't ack on error - message will be requeued
              this.channel.nack(msg, false, true);
            }
          }
        },
        {
          noAck: false,
        },
      );

      console.log('[EventsConsumer] Connected to RabbitMQ and listening for all notification events');
    } catch (error) {
      console.error('[EventsConsumer] Failed to connect to RabbitMQ:', error);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.channelModel) {
        await this.channelModel.close();
      }
    } catch (error) {
      console.error('[EventsConsumer] Error closing connections:', error);
    }
  }

  private async handleEvent(data: {
    eventType: string;
    [key: string]: any;
  }) {
    console.log(`[EventsConsumer] Received event: ${data.eventType}`);

    try {
      switch (data.eventType) {
        case 'user.created':
          await this.handleUserCreated(data as {
            eventType: string;
            userId: string;
            email: string;
            username?: string;
            timestamp: string;
          });
          break;
        case 'post.created':
          await this.handlePostCreated(data as {
            eventType: string;
            postId: string;
            userId: string;
            content: string;
            timestamp: string;
          });
          break;
        case 'post.liked':
          await this.handlePostLiked(data as {
            eventType: string;
            postId: string;
            userId: string;
            postOwnerId: string;
            timestamp: string;
          });
          break;
        case 'post.unliked':
          await this.handlePostUnliked(data as {
            eventType: string;
            postId: string;
            userId: string;
            postOwnerId: string;
            timestamp: string;
          });
          break;
        case 'post.commented':
          await this.handlePostCommented(data as {
            eventType: string;
            postId: string;
            commentId: string;
            userId: string;
            postOwnerId: string;
            commentContent: string;
            parentCommentId?: string | null;
            mentions?: string[];
            timestamp: string;
          });
          break;
        case 'comment.mentioned':
          await this.handleCommentMentioned(data as {
            eventType: string;
            postId: string;
            commentId: string;
            userId: string; 
            mentionedUserId: string; 
            commentContent: string;
            timestamp: string;
          });
          break;
        case 'message.received':
          await this.handleMessageReceived(data as {
            eventType: string;
            messageId: string;
            conversationId: string;
            senderId: string;
            recipientId: string;
            messageContent?: string;
            timestamp: string;
          });
          break;
        default:
          console.warn(`[EventsConsumer] Unhandled event type: ${data.eventType}`);
      }
    } catch (error) {
      console.error(`[EventsConsumer] Error handling event ${data.eventType}:`, error);
      throw error; // Re-throw to trigger nack and requeue
    }
  }

  private async handleUserCreated(data: {
    eventType: string;
    userId: string;
    email: string;
    username?: string;
    timestamp: string;
  }) {
    // Send welcome email to new user
    if (data.email) {
      await this.emailService.sendWelcomeEmail(
        data.email,
        data.username || 'User',
      );
    }
    console.log(`[EventsConsumer] User created: ${data.userId}`);
  }

  private async handlePostCreated(data: {
    eventType: string;
    postId: string;
    userId: string;
    content: string;
    timestamp: string;
  }) {
    // TODO: Post created - notify followers
    // This would require fetching followers from User Service
    // For now, we'll skip this or handle it via API Gateway
    console.log(`[EventsConsumer] Post created: ${data.postId} by user ${data.userId}`);
    // TODO: Fetch followers and create notifications
  }

  private async handlePostLiked(data: {
    eventType: string;
    postId: string;
    userId: string; // User who liked
    postOwnerId: string; // Owner of the post (should be notified)
    timestamp: string;
  }) {
    // Don't notify if user liked their own post
    if (data.userId === data.postOwnerId) {
      return;
    }

    const notification = await this.notificationService.createNotification({
      userId: data.postOwnerId,
      type: 'post.liked',
      relatedId: data.postId,
      actorId: data.userId,
      metadata: {
        postId: data.postId,
      },
    });

    // Push via WebSocket immediately
    await this.notificationGateway.sendNotificationToUser(data.postOwnerId, {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      relatedId: notification.relatedId,
      actorId: notification.actorId,
      read: notification.read,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
      metadata: notification.metadata,
    });

    // Update unread count
    const unreadCount = await this.notificationService.getUnreadCount(data.postOwnerId);
    await this.notificationGateway.sendUnreadCountUpdate(data.postOwnerId, unreadCount);

    // Send email if preferences allow
    await this.sendEmailIfEnabled(
      data.postOwnerId,
      'post.liked',
      {
        actorName: 'Someone', // TODO: Fetch actor name from User Service
        postPreview: 'Your post', // TODO: Fetch post preview
        postUrl: `#post-${data.postId}`, // TODO: Generate actual URL
      },
    );
  }

  private async handlePostUnliked(data: {
    eventType: string;
    postId: string;
    userId: string;
    postOwnerId: string;
    timestamp: string;
  }) {
    // Post unliked - we might not need to notify, but could update notification
    console.log(`[EventsConsumer] Post unliked: ${data.postId}`);
    // Optionally: Delete or update existing notification
  }

  private async handlePostCommented(data: {
    eventType: string;
    postId: string;
    commentId: string;
    userId: string; 
    postOwnerId: string; 
    commentContent: string;
    parentCommentId?: string | null;
    mentions?: string[];
    timestamp: string;
  }) {
    // Don't notify if user commented on their own post
    if (data.userId === data.postOwnerId) {
      return;
    }

    // Only notify post owner if it's a top-level comment
    if (!data.parentCommentId) {
      const notification = await this.notificationService.createNotification({
        userId: data.postOwnerId,
        type: 'post.commented',
        relatedId: data.postId,
        actorId: data.userId,
        metadata: {
          postId: data.postId,
          commentId: data.commentId,
          commentPreview: data.commentContent.substring(0, 100),
        },
      });

      // Push via WebSocket immediately
      await this.notificationGateway.sendNotificationToUser(data.postOwnerId, {
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        relatedId: notification.relatedId,
        actorId: notification.actorId,
        read: notification.read,
        readAt: notification.readAt?.toISOString() || null,
        createdAt: notification.createdAt.toISOString(),
        metadata: notification.metadata,
      });

      // Update unread count
      const unreadCount = await this.notificationService.getUnreadCount(data.postOwnerId);
      await this.notificationGateway.sendUnreadCountUpdate(data.postOwnerId, unreadCount);

      // Send email if preferences allow
      await this.sendEmailIfEnabled(
        data.postOwnerId,
        'post.commented',
        {
          // Todo
          actorName: 'Someone',
          postPreview: 'Your post',
          commentPreview: data.commentContent.substring(0, 100),
          postUrl: `#post-${data.postId}`,
        },
      );
    }
  }

  private async handleCommentMentioned(data: {
    eventType: string;
    postId: string;
    commentId: string;
    userId: string; 
    mentionedUserId: string;
    commentContent: string;
    timestamp: string;
  }) {
    if (data.userId === data.mentionedUserId) {
      return;
    }

    const notification = await this.notificationService.createNotification({
      userId: data.mentionedUserId,
      type: 'comment.mentioned',
      relatedId: data.commentId,
      actorId: data.userId,
      metadata: {
        postId: data.postId,
        commentId: data.commentId,
        commentPreview: data.commentContent.substring(0, 100),
      },
    });

    // Push via WebSocket immediately
    await this.notificationGateway.sendNotificationToUser(data.mentionedUserId, {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      relatedId: notification.relatedId,
      actorId: notification.actorId,
      read: notification.read,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
      metadata: notification.metadata,
    });

    // Update unread count
    const unreadCount = await this.notificationService.getUnreadCount(data.mentionedUserId);
    await this.notificationGateway.sendUnreadCountUpdate(data.mentionedUserId, unreadCount);

    // Send email if preferences allow
    await this.sendEmailIfEnabled(
      data.mentionedUserId,
      'comment.mentioned',
      {
        actorName: 'Someone',
        commentPreview: data.commentContent.substring(0, 100),
        postUrl: `#post-${data.postId}`, // TODO: Generate actual URL
      },
    );
  }

  private async handleMessageReceived(data: {
    eventType: string;
    messageId: string;
    conversationId: string;
    senderId: string;
    recipientId: string; 
    messageContent?: string;
    timestamp: string;
  }) {
    // Don't notify if user sent message to themselves
    if (data.senderId === data.recipientId) {
      return;
    }

    const notification = await this.notificationService.createNotification({
      userId: data.recipientId,
      type: 'message.received',
      relatedId: data.conversationId,
      actorId: data.senderId,
      metadata: {
        messageId: data.messageId,
        conversationId: data.conversationId,
        messagePreview: data.messageContent ? data.messageContent.substring(0, 100) : 'New message',
      },
    });

    // Push via WebSocket immediately
    await this.notificationGateway.sendNotificationToUser(data.recipientId, {
      id: notification.id,
      userId: notification.userId,
      type: notification.type,
      relatedId: notification.relatedId,
      actorId: notification.actorId,
      read: notification.read,
      readAt: notification.readAt?.toISOString() || null,
      createdAt: notification.createdAt.toISOString(),
      metadata: notification.metadata,
    });

    // Update unread count
    const unreadCount = await this.notificationService.getUnreadCount(data.recipientId);
    await this.notificationGateway.sendUnreadCountUpdate(data.recipientId, unreadCount);

    // Send email if preferences allow
    await this.sendEmailIfEnabled(
      data.recipientId,
      'message.received',
      {
        actorName: 'Someone', // TODO: Fetch actor name from User Service
        messagePreview: data.messageContent ? data.messageContent.substring(0, 100) : 'New message',
        messageUrl: `#conversation-${data.conversationId}`, // TODO: Generate actual URL
      },
    );
  }

  /**
   * Helper method to send email if user preferences allow
   */
  private async sendEmailIfEnabled(
    userId: string,
    notificationType: string,
    notificationData: Record<string, any>,
  ): Promise<void> {
    try {
      // Check user preferences
      const preferences = await this.notificationService.getPreferences(userId);
      const preference = preferences.find((p) => p.type === notificationType);

      // If preference exists and email is disabled, skip
      if (preference && !preference.emailEnabled) {
        return;
      }

      // If no preference, default to enabled
      const shouldSendEmail = preference ? preference.emailEnabled : true;

      if (!shouldSendEmail) {
        return;
      }

      // Get user email
      const userEmail = await this.authClient.getUserEmail(userId);
      if (!userEmail) {
        console.warn(`[EventsConsumer] Could not get email for user ${userId}`);
        return;
      }

      // Send email (non-blocking - fire and forget)
      this.emailService.sendNotificationEmail(userEmail, notificationType, notificationData)
        .catch((error) => {
          console.error(`[EventsConsumer] Failed to send email to ${userEmail}:`, error);
        });
    } catch (error) {
      console.error(`[EventsConsumer] Error checking preferences for user ${userId}:`, error);
    }
  }
}

