import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Conversation } from '../entities/conversation.entity';
import { ConversationParticipant } from '../entities/conversation-participant.entity';
import { Message } from '../entities/message.entity';
import { SharedPost } from '../entities/shared-post.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:9730/smp_db';

  if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database Config] Connecting to: ${safeUrl}`);
  } else {
    console.error('[Database Config] DATABASE_URL is not set!');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'message',
    entities: [Conversation, ConversationParticipant, Message, SharedPost, MessageAttachment, MessageReadReceipt],
    synchronize: configService.get<string>('NODE_ENV') !== 'production',
    logging: false, 
  };
};

