import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

@Injectable()
export class EventPublisherService implements OnModuleInit, OnModuleDestroy {
  private channelModel: any = null;
  private channel: any = null;
  private readonly exchange = 'notifications';

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL') || 'amqp://admin:admin@localhost:2672';
      this.channelModel = await amqp.connect(rabbitmqUrl);
      
      if (!this.channelModel) {
        throw new Error('Failed to create RabbitMQ connection');
      }
      
      this.channel = await this.channelModel.createConfirmChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }
      
      // Declare exchange
      await this.channel.assertExchange(this.exchange, 'topic', {
        durable: true,
      });

      console.log('[EventPublisher] Connected to RabbitMQ');
    } catch (error) {
      console.error('[EventPublisher] Failed to connect to RabbitMQ:', error);
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
      console.error('[EventPublisher] Error closing connections:', error);
    }
  }

  async publishPostLiked(postId: string, userId: string, postOwnerId: string) {
    if (!this.channel) {
      console.error('[EventPublisher] Channel not initialized');
      return;
    }

    try {
      const message = {
        eventType: 'post.liked',
        postId,
        userId, // User who liked the post
        postOwnerId, // Owner of the post (who should be notified)
        timestamp: new Date().toISOString(),
      };

      await this.channel.publish(
        this.exchange,
        'post.liked',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
        },
      );

      console.log(`[EventPublisher] Published post.liked event for post: ${postId}`);
    } catch (error) {
      console.error('[EventPublisher] Failed to publish post.liked event:', error);
    }
  }

  async publishPostUnliked(postId: string, userId: string, postOwnerId: string) {
    if (!this.channel) {
      console.error('[EventPublisher] Channel not initialized');
      return;
    }

    try {
      const message = {
        eventType: 'post.unliked',
        postId,
        userId,
        postOwnerId,
        timestamp: new Date().toISOString(),
      };

      await this.channel.publish(
        this.exchange,
        'post.unliked',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
        },
      );

      console.log(`[EventPublisher] Published post.unliked event for post: ${postId}`);
    } catch (error) {
      console.error('[EventPublisher] Failed to publish post.unliked event:', error);
    }
  }

  async publishPostCommented( postId: string, commentId: string, userId: string, postOwnerId: string, commentContent: string, parentCommentId?: string | null, mentions?: string[]) {
    if (!this.channel) {
      console.error('[EventPublisher] Channel not initialized');
      return;
    }

    try {
      const message = {
        eventType: 'post.commented',
        postId,
        commentId,
        userId, 
        postOwnerId, 
        commentContent,
        parentCommentId: parentCommentId || null,
        mentions: mentions || [],
        timestamp: new Date().toISOString(),
      };

      await this.channel.publish(
        this.exchange,
        'post.commented',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
        },
      );

      console.log(`[EventPublisher] Published post.commented event for post: ${postId}`);

      // Publish separate event for mentions 
      if (mentions && mentions.length > 0) {
        for (const mentionedUserId of mentions) {
          // Skip notifying the commenter themselves
          if (mentionedUserId === userId) continue;

          const mentionMessage = {
            eventType: 'comment.mentioned',
            postId,
            commentId,
            userId, 
            mentionedUserId, 
            commentContent,
            timestamp: new Date().toISOString(),
          };

          await this.channel.publish(
            this.exchange,
            'comment.mentioned',
            Buffer.from(JSON.stringify(mentionMessage)),
            {
              persistent: true,
            },
          );

          console.log(`[EventPublisher] Published comment.mentioned event for user: ${mentionedUserId}`);
        }
      }
    } catch (error) {
      console.error('[EventPublisher] Failed to publish post.commented event:', error);
    }
  }

  async publishPostCreated(postId: string, userId: string, content: string) {
    if (!this.channel) {
      console.error('[EventPublisher] Channel not initialized');
      return;
    }

    try {
      const message = {
        eventType: 'post.created',
        postId,
        userId,
        content: content.substring(0, 100), // First 100 chars for preview
        timestamp: new Date().toISOString(),
      };

      await this.channel.publish(
        this.exchange,
        'post.created',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
        },
      );

      console.log(`[EventPublisher] Published post.created event for post: ${postId}`);
    } catch (error) {
      console.error('[EventPublisher] Failed to publish post.created event:', error);
    }
  }
}

