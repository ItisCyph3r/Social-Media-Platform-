import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { UserService } from '../user/user.service';

@Injectable()
export class UserEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private channelModel: any = null;
  private channel: any = null;
  private readonly exchange = 'notifications';
  private readonly queue = 'user-service-events';

  constructor(
    private configService: ConfigService,
    private userService: UserService,
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

      await this.channel.bindQueue(this.queue, this.exchange, 'user.created');

      await this.channel.consume(
        this.queue,
        async (msg) => {
          if (msg && this.channel) {
            try {
              const content = JSON.parse(msg.content.toString());
              await this.handleUserCreated(content);
              this.channel.ack(msg);
            } catch (error) {
              console.error('[UserEventsConsumer] Error processing message:', error);
              // message will be requeued
              this.channel.nack(msg, false, true);
            }
          }
        },
        {
          noAck: false,
        },
      );

      console.log('[UserEventsConsumer] Connected to RabbitMQ and listening for user.created events');
    } catch (error) {
      console.error('[UserEventsConsumer] Failed to connect to RabbitMQ:', error);
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
      console.error('[UserEventsConsumer] Error closing connections:', error);
    }
  }

  private async handleUserCreated(data: {
    eventType: string;
    userId: string;
    email: string;
    username?: string;
  }) {
    console.log(`[UserEventsConsumer] Received user.created event for user: ${data.userId}`);
    
    try {
      // Generate a default username if not provided
      const username = data.username || `user_${data.userId.substring(0, 8)}`;
      
      // Create user profile automatically
      await this.userService.createProfile(
        data.userId,
        username,
        '', // bio - empty initially
        '', // profile picture - empty initially
      );

      console.log(`[UserEventsConsumer] Successfully created profile for user: ${data.userId}`);
    } catch (error) {
      console.error(`[UserEventsConsumer] Failed to create profile for user ${data.userId}:`, error);
      throw error; // Re-throw to trigger nack and requeue
    }
  }
}

