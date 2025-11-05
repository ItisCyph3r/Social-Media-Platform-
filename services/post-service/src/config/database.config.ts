import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Post } from '../entities/post.entity';
import { Like } from '../entities/like.entity';
import { Comment } from '../entities/comment.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');

  if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database Config] Connecting to: ${safeUrl}`);
  } else {
    console.error('[Database Config] DATABASE_URL is not set!');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Post, Like, Comment],
    synchronize: configService.get<string>('NODE_ENV') !== 'production', // Auto-sync in dev only
    logging: false, // Disable SQL query logging
  };
};

