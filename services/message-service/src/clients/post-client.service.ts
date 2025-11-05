import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface PostServiceClient {
  GetPost(
    data: { post_id: string },
    callback: (error: any, response: {
      id: string;
      user_id: string;
      content: string;
      media_urls: string[];
      likes_count: number;
      comments_count: number;
      created_at: string;
    }) => void,
  ): void;
}

@Injectable()
export class PostClientService implements OnModuleInit {
  private postService: PostServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const postServiceUrl = this.configService.get<string>('POST_SERVICE_GRPC_URL') || 'localhost:5003';
    const protoPath = join(__dirname, '../../../../shared/protos/post.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const postProto = grpc.loadPackageDefinition(packageDefinition).post as any;

    this.postService = new postProto.PostService(
      postServiceUrl,
      grpc.credentials.createInsecure(),
    ) as PostServiceClient;

    console.log('[PostClientService] Connected to Post Service');
  }

  async getPost(postId: string): Promise<{
    id: string;
    userId: string;
    content: string;
    mediaUrls: string[];
    likesCount: number;
    commentsCount: number;
    createdAt: string;
  } | null> {
    return new Promise((resolve) => {
      this.postService.GetPost(
        { post_id: postId },
        (error, response) => {
          if (error) {
            console.error(`[PostClientService] Failed to get post ${postId}:`, error);
            resolve(null);
          } else {
            resolve({
              id: response?.id || '',
              userId: response?.user_id || '',
              content: response?.content || '',
              mediaUrls: response?.media_urls || [],
              likesCount: response?.likes_count || 0,
              commentsCount: response?.comments_count || 0,
              createdAt: response?.created_at || '',
            });
          }
        },
      );
    });
  }
}

