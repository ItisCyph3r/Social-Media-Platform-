import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { Post } from './entities/post.entity';
import { Like } from './entities/like.entity';
import { Comment } from './entities/comment.entity';
import { PostController } from './post/post.controller';
import { PostService } from './post/post.service';
import { StorageClientService } from './clients/storage-client.service';
import { FileUploadController } from './post/file-upload.controller';
import { EventPublisherService } from './events/event-publisher.service';
import { CacheModule } from './cache/cache.module';
import { PostCacheService } from './cache/post-cache.service';

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
    TypeOrmModule.forFeature([Post, Like, Comment]),
    CacheModule,
  ],
  controllers: [PostController, FileUploadController],
  providers: [PostService, StorageClientService, EventPublisherService, PostCacheService],
})
export class AppModule {}
