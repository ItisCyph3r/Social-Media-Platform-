import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface PostServiceClient {
  CreatePost(
    data: { user_id: string; content: string; media_urls?: string[] },
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
  GetUserPosts(
    data: { user_id: string; page?: number; limit?: number },
    callback: (error: any, response: {
      posts: Array<{
        id: string;
        user_id: string;
        content: string;
        media_urls: string[];
        likes_count: number;
        comments_count: number;
        created_at: string;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  GetFeed(
    data: { user_id: string; following_ids?: string[]; page?: number; limit?: number },
    callback: (error: any, response: {
      posts: Array<{
        id: string;
        user_id: string;
        content: string;
        media_urls: string[];
        likes_count: number;
        comments_count: number;
        created_at: string;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  LikePost(
    data: { post_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  UnlikePost(
    data: { post_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  CreateComment(
    data: { post_id: string; user_id: string; content: string; parent_comment_id?: string; mentions?: string[] },
    callback: (error: any, response: {
      id: string;
      post_id: string;
      user_id: string;
      content: string;
      created_at: string;
      parent_comment_id: string;
      mentions: string[];
      reply_count: number;
    }) => void,
  ): void;
  GetComments(
    data: { post_id: string; page?: number; limit?: number },
    callback: (error: any, response: {
      comments: Array<{
        id: string;
        post_id: string;
        user_id: string;
        content: string;
        created_at: string;
        parent_comment_id: string;
        mentions: string[];
        reply_count: number;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  GetReplies(
    data: { comment_id: string; page?: number; limit?: number },
    callback: (error: any, response: {
      replies: Array<{
        id: string;
        post_id: string;
        user_id: string;
        content: string;
        created_at: string;
        parent_comment_id: string;
        mentions: string[];
        reply_count: number;
      }>;
      total: number;
      page: number;
    }) => void,
  ): void;
  GetPresignedUploadUrl(
    data: { file_name: string; content_type: string },
    callback: (error: any, response: {
      upload_url: string;
      object_name: string;
      access_url: string;
      success: boolean;
    }) => void,
  ): void;
  DeletePost(
    data: { post_id: string; user_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  CheckUserLikedPosts(
    data: { user_id: string; post_ids: string[] },
    callback: (error: any, response: { liked_posts: Record<string, boolean> }) => void,
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

  async createPost(userId: string, content: string, mediaUrls: string[] = []): Promise<{
    id: string;
    userId: string;
    content: string;
    mediaUrls: string[];
    likesCount: number;
    commentsCount: number;
    createdAt: string;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.CreatePost(
        { user_id: userId, content, media_urls: mediaUrls },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to create post'));
          } else {
            resolve({
              id: response.id,
              userId: response.user_id,
              content: response.content,
              mediaUrls: response.media_urls || [],
              likesCount: response.likes_count || 0,
              commentsCount: response.comments_count || 0,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
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
          if (error || !response) {
            resolve(null);
          } else {
            resolve({
              id: response.id,
              userId: response.user_id,
              content: response.content,
              mediaUrls: response.media_urls || [],
              likesCount: response.likes_count || 0,
              commentsCount: response.comments_count || 0,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async getUserPosts(userId: string, page: number = 1, limit: number = 20): Promise<{
    posts: Array<{
      id: string;
      userId: string;
      content: string;
      mediaUrls: string[];
      likesCount: number;
      commentsCount: number;
      createdAt: string;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.GetUserPosts(
        { user_id: userId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get posts'));
          } else {
            resolve({
              posts: (response.posts || []).map((p: any) => ({
                id: p.id,
                userId: p.user_id,
                content: p.content,
                mediaUrls: p.media_urls || [],
                likesCount: p.likes_count || 0,
                commentsCount: p.comments_count || 0,
                createdAt: p.created_at,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async getFeed(userId: string, followingIds: string[], page: number = 1, limit: number = 20): Promise<{
    posts: Array<{
      id: string;
      userId: string;
      content: string;
      mediaUrls: string[];
      likesCount: number;
      commentsCount: number;
      createdAt: string;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.GetFeed(
        { user_id: userId, following_ids: followingIds, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get feed'));
          } else {
            resolve({
              posts: (response.posts || []).map((p: any) => ({
                id: p.id,
                userId: p.user_id,
                content: p.content,
                mediaUrls: p.media_urls || [],
                likesCount: p.likes_count || 0,
                commentsCount: p.comments_count || 0,
                createdAt: p.created_at,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async likePost(postId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.postService.LikePost(
        { post_id: postId, user_id: userId },
        (error, response) => {
          if (error) {
            // If already liked, treat as success (idempotent operation)
            if (error.message?.includes('already liked') || error.message?.includes('Already liked')) {
              resolve(true);
              return;
            }
            reject(error);
          } else if (!response?.success) {
            // If already liked, treat as success
            if (response?.message?.includes('already liked') || response?.message?.includes('Already liked')) {
              resolve(true);
              return;
            }
            reject(new Error(response?.message || 'Like failed'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async unlikePost(postId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.postService.UnlikePost(
        { post_id: postId, user_id: userId },
        (error, response) => {
          if (error) {
            // If not liked, treat as success (idempotent operation)
            if (error.message?.includes('not liked') || error.message?.includes('Not liked')) {
              resolve(true);
              return;
            }
            reject(error);
          } else if (!response?.success) {
            // If not liked, treat as success
            if (response?.message?.includes('not liked') || response?.message?.includes('Not liked')) {
              resolve(true);
              return;
            }
            reject(new Error(response?.message || 'Unlike failed'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async createComment(
    postId: string,
    userId: string,
    content: string,
    parentCommentId?: string | null,
    mentions?: string[],
  ): Promise<{
    id: string;
    postId: string;
    userId: string;
    content: string;
    createdAt: string;
    parentCommentId: string | null;
    mentions: string[];
    replyCount: number;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.CreateComment(
        {
          post_id: postId,
          user_id: userId,
          content,
          parent_comment_id: parentCommentId || undefined,
          mentions: mentions || [],
        },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to create comment'));
          } else {
            resolve({
              id: response.id,
              postId: response.post_id,
              userId: response.user_id,
              content: response.content,
              createdAt: response.created_at,
              parentCommentId: response.parent_comment_id || null,
              mentions: response.mentions || [],
              replyCount: response.reply_count || 0,
            });
          }
        },
      );
    });
  }

  async getComments(postId: string, page: number = 1, limit: number = 20): Promise<{
    comments: Array<{
      id: string;
      postId: string;
      userId: string;
      content: string;
      createdAt: string;
      parentCommentId: string | null;
      mentions: string[];
      replyCount: number;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.GetComments(
        { post_id: postId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get comments'));
          } else {
            resolve({
              comments: (response.comments || []).map((c: any) => ({
                id: c.id,
                postId: c.post_id,
                userId: c.user_id,
                content: c.content,
                createdAt: c.created_at,
                parentCommentId: c.parent_comment_id || null,
                mentions: c.mentions || [],
                replyCount: c.reply_count || 0,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async getReplies(commentId: string, page: number = 1, limit: number = 20): Promise<{
    replies: Array<{
      id: string;
      postId: string;
      userId: string;
      content: string;
      createdAt: string;
      parentCommentId: string | null;
      mentions: string[];
      replyCount: number;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.GetReplies(
        { comment_id: commentId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get replies'));
          } else {
            resolve({
              replies: (response.replies || []).map((r: any) => ({
                id: r.id,
                postId: r.post_id,
                userId: r.user_id,
                content: r.content,
                createdAt: r.created_at,
                parentCommentId: r.parent_comment_id || null,
                mentions: r.mentions || [],
                replyCount: r.reply_count || 0,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async getPresignedUploadUrl(fileName: string, contentType: string): Promise<{
    uploadUrl: string;
    objectName: string;
    accessUrl: string;
  }> {
    return new Promise((resolve, reject) => {
      this.postService.GetPresignedUploadUrl(
        { file_name: fileName, content_type: contentType },
        (error, response) => {
          if (error || !response?.success) {
            reject(error || new Error('Failed to get presigned URL'));
          } else {
            resolve({
              uploadUrl: response.upload_url,
              objectName: response.object_name,
              accessUrl: response.access_url,
            });
          }
        },
      );
    });
  }

  async deletePost(postId: string, userId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.postService.DeletePost(
        { post_id: postId, user_id: userId },
        (error, response) => {
          if (error || !response?.success) {
            reject(error || new Error(response?.message || 'Failed to delete post'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async checkUserLikedPosts(postIds: string[], userId: string): Promise<Record<string, boolean>> {
    return new Promise((resolve, reject) => {
      this.postService.CheckUserLikedPosts(
        { user_id: userId, post_ids: postIds },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to check liked posts'));
          } else {
            resolve(response.liked_posts || {});
          }
        },
      );
    });
  }
}

