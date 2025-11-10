import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PostService } from './post.service';

@Controller()
export class PostController {
  constructor(private readonly postService: PostService) {}

  @GrpcMethod('PostService', 'CreatePost')
  async createPost(data: {
    user_id: string;
    content: string;
    media_urls?: string[];
  }) {
    try {
      const post = await this.postService.createPost(
        data.user_id,
        data.content,
        data.media_urls || [],
      );
      return {
        id: post.id,
        user_id: post.userId,
        content: post.content,
        media_urls: post.mediaUrls,
        likes_count: 0,
        comments_count: 0,
        created_at: post.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('PostService', 'GetPost')
  async getPost(data: { post_id: string }) {
    try {
      const post = await this.postService.getPostWithCounts(data.post_id);
      return {
        id: post.id,
        user_id: post.userId,
        content: post.content,
        media_urls: post.mediaUrls,
        likes_count: post.likesCount,
        comments_count: post.commentsCount,
        created_at: post.createdAt.toISOString(),
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('PostService', 'GetUserPosts')
  async getUserPosts(data: {
    user_id: string;
    page?: number;
    limit?: number;
  }) {
    const { posts, total } = await this.postService.getUserPosts(
      data.user_id,
      data.page || 1,
      data.limit || 20,
    );

    // Calculate counts for each post
    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const postWithCounts = await this.postService.getPostWithCounts(post.id);
        return {
          id: postWithCounts.id,
          user_id: postWithCounts.userId,
          content: postWithCounts.content,
          media_urls: postWithCounts.mediaUrls,
          likes_count: postWithCounts.likesCount,
          comments_count: postWithCounts.commentsCount,
          created_at: postWithCounts.createdAt.toISOString(),
        };
      }),
    );

    return {
      posts: postsWithCounts,
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('PostService', 'GetFeed')
  async getFeed(data: {
    user_id: string;
    following_ids?: string[];
    page?: number;
    limit?: number;
  }) {
    const followingIds = data.following_ids || [];
    const userIds = [data.user_id, ...followingIds];
    
    const { posts, total } = await this.postService.getFeed(
      data.user_id,
      userIds,
      data.page || 1,
      data.limit || 20,
    );

    // Calculate counts for each post
    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const postWithCounts = await this.postService.getPostWithCounts(post.id);
        return {
          id: postWithCounts.id,
          user_id: postWithCounts.userId,
          content: postWithCounts.content,
          media_urls: postWithCounts.mediaUrls,
          likes_count: postWithCounts.likesCount,
          comments_count: postWithCounts.commentsCount,
          created_at: postWithCounts.createdAt.toISOString(),
        };
      }),
    );

    return {
      posts: postsWithCounts,
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('PostService', 'LikePost')
  async likePost(data: { post_id: string; user_id: string }) {
    try {
      await this.postService.likePost(data.post_id, data.user_id);
      return {
        success: true,
        message: 'Post liked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to like post',
      };
    }
  }

  @GrpcMethod('PostService', 'UnlikePost')
  async unlikePost(data: { post_id: string; user_id: string }) {
    try {
      await this.postService.unlikePost(data.post_id, data.user_id);
      return {
        success: true,
        message: 'Post unliked successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unlike post',
      };
    }
  }

  @GrpcMethod('PostService', 'CreateComment')
  async createComment(data: {
    post_id: string;
    user_id: string;
    content: string;
    parent_comment_id?: string;
    mentions?: string[];
  }) {
    try {
      const comment = await this.postService.createComment(
        data.post_id,
        data.user_id,
        data.content,
        data.parent_comment_id || null,
        data.mentions || [],
      );
      return {
        id: comment.id,
        post_id: comment.postId,
        user_id: comment.userId,
        content: comment.content,
        created_at: comment.createdAt instanceof Date 
          ? comment.createdAt.toISOString() 
          : new Date(comment.createdAt).toISOString(),
        parent_comment_id: comment.parentCommentId || '',
        mentions: comment.mentions || [],
        reply_count: comment.replyCount || 0,
        is_deleted: comment.isDeleted || false,
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('PostService', 'GetComments')
  async getComments(data: {
    post_id: string;
    page?: number;
    limit?: number;
  }) {
    const { comments, total } = await this.postService.getComments(
      data.post_id,
      data.page || 1,
      data.limit || 20,
    );

    return {
      comments: comments.map((comment) => ({
        id: comment.id,
        post_id: comment.postId,
        user_id: comment.userId,
        content: comment.content,
        created_at: comment.createdAt instanceof Date 
          ? comment.createdAt.toISOString() 
          : new Date(comment.createdAt).toISOString(),
        parent_comment_id: comment.parentCommentId || '',
        mentions: comment.mentions || [],
        reply_count: comment.replyCount || 0,
        is_deleted: comment.isDeleted || false,
      })),
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('PostService', 'GetReplies')
  async getReplies(data: {
    comment_id: string;
    page?: number;
    limit?: number;
  }) {
    const { replies, total } = await this.postService.getReplies(
      data.comment_id,
      data.page || 1,
      data.limit || 20,
    );

    return {
      replies: replies.map((reply) => ({
        id: reply.id,
        post_id: reply.postId,
        user_id: reply.userId,
        content: reply.content,
        created_at: reply.createdAt instanceof Date 
          ? reply.createdAt.toISOString() 
          : new Date(reply.createdAt).toISOString(),
        parent_comment_id: reply.parentCommentId || '',
        mentions: reply.mentions || [],
        reply_count: reply.replyCount || 0,
        is_deleted: reply.isDeleted || false,
      })),
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('PostService', 'DeleteComment')
  async deleteComment(data: {
    comment_id: string;
    user_id: string;
  }) {
    try {
      await this.postService.deleteComment(data.comment_id, data.user_id);
      return {
        success: true,
        message: 'Comment deleted successfully',
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('PostService', 'DeletePost')
  async deletePost(data: { post_id: string; user_id: string }) {
    try {
      await this.postService.deletePost(data.post_id, data.user_id);
      return {
        success: true,
        message: 'Post deleted successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to delete post',
      };
    }
  }

  @GrpcMethod('PostService', 'CheckUserLikedPosts')
  async checkUserLikedPosts(data: { user_id: string; post_ids: string[] }) {
    const likedPostIds = await this.postService.hasUserLikedPosts(data.post_ids, data.user_id);
    const result: Record<string, boolean> = {};
    data.post_ids.forEach(postId => {
      result[postId] = likedPostIds.has(postId);
    });
    return { liked_posts: result };
  }
}

