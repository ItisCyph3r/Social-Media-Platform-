import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Conversation } from '../entities/conversation.entity';
import { ConversationParticipant } from '../entities/conversation-participant.entity';
import { Message } from '../entities/message.entity';
import { SharedPost } from '../entities/shared-post.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');

  // Debug: Log the database URL (without password for security)
  if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database Config] Connecting to: ${safeUrl}`);
  } else {
    console.error('[Database Config] DATABASE_URL is not set!');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Conversation, ConversationParticipant, Message, SharedPost],
    synchronize: configService.get<string>('NODE_ENV') !== 'production', // Auto-sync in dev only
    logging: false, // Disable SQL query logging
  };
};

