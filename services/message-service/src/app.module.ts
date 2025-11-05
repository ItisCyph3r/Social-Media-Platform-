import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Message } from './entities/message.entity';
import { SharedPost } from './entities/shared-post.entity';
import { MessageController } from './message/message.controller';
import { MessageService } from './message/message.service';
import { MessageGateway } from './gateways/message.gateway';
import { EventPublisherService } from './events/event-publisher.service';
import { AuthClientService } from './clients/auth-client.service';
import { PostClientService } from './clients/post-client.service';

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
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, SharedPost]),
  ],
  controllers: [MessageController],
  providers: [
    MessageService,
    MessageGateway,
    EventPublisherService,
    AuthClientService,
    PostClientService,
  ],
})
export class AppModule {}
