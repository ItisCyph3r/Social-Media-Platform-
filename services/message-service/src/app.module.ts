import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { SharedPost } from './entities/shared-post.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { MessageReadReceipt } from './entities/message-read-receipt.entity';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { MessageGateway } from './gateways/message.gateway';
import { EventPublisherService } from './events/event-publisher.service';
import { AuthClientService } from './clients/auth-client.service';
import { PostClientService } from './clients/post-client.service';
import { UserClientService } from './clients/user-client.service';
import { MessageAttachmentService } from './attachments/message-attachment.service';
import { StorageClientService } from './clients/storage-client.service';
import { CacheModule } from './cache/cache.module';
import { UserCacheService } from './cache/user-cache.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, SharedPost, MessageAttachment, MessageReadReceipt]),
    CacheModule, 
  ],
  controllers: [MessageController],
  providers: [
    MessageService,
    MessageGateway,
    EventPublisherService,
    AuthClientService,
    PostClientService,
    UserClientService,
    MessageAttachmentService,
    StorageClientService,
    UserCacheService, 
  ],
})
export class AppModule {}
