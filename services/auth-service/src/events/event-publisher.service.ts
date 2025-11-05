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

  async publishUserCreated(userId: string, email: string, username?: string) {
    if (!this.channel) {
      console.error('[EventPublisher] Channel not initialized');
      return;
    }

    try {
      const message = {
        eventType: 'user.created',
        userId,
        email,
        username,
        timestamp: new Date().toISOString(),
      };

      await this.channel.publish(
        this.exchange,
        'user.created',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
        },
      );

      console.log(`[EventPublisher] Published user.created event for user: ${userId}`);
    } catch (error) {
      console.error('[EventPublisher] Failed to publish user.created event:', error);
    }
  }
}

