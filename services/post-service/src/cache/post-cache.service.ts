import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Post-specific cache operations
 * Handles caching for posts, comments, likes, and related data
 */
@Injectable()
export class PostCacheService {
  private readonly CACHE_PREFIX = 'post';
  private readonly DEFAULT_TTL = {
    COMMENT_COUNT: 300, // 5 minutes
    POST_COUNT: 300, // 5 minutes
    COMMENT_PAGE: 120, // 2 minutes
    POST_DETAIL: 600, // 10 minutes
    USER_PROFILE: 600, // 10 minutes
  };

  constructor(private cacheService: CacheService) {}

  // Comment Count Caching
  async getCommentCount(postId: string): Promise<number | null> {
    return this.cacheService.get<number>(
      `comment:count:${postId}`,
      this.CACHE_PREFIX,
    );
  }

  async setCommentCount(postId: string, count: number): Promise<boolean> {
    return this.cacheService.set(
      `comment:count:${postId}`,
      count,
      {
        ttl: this.DEFAULT_TTL.COMMENT_COUNT,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async incrementCommentCount(postId: string): Promise<number> {
    const key = `comment:count:${postId}`;
    const count = await this.cacheService.increment(key, this.CACHE_PREFIX);
    
    // Set TTL if this is the first increment (key was created)
    const exists = await this.cacheService.exists(key, this.CACHE_PREFIX);
    if (!exists) {
      await this.cacheService.expire(key, this.DEFAULT_TTL.COMMENT_COUNT, this.CACHE_PREFIX);
    }
    
    return count;
  }

  async decrementCommentCount(postId: string): Promise<number> {
    return this.cacheService.decrement(
      `comment:count:${postId}`,
      this.CACHE_PREFIX,
    );
  }

  async invalidateCommentCount(postId: string): Promise<boolean> {
    return this.cacheService.delete(
      `comment:count:${postId}`,
      this.CACHE_PREFIX,
    );
  }

  // Reply Count Caching (for nested comments)
  async getReplyCount(commentId: string): Promise<number | null> {
    return this.cacheService.get<number>(
      `reply:count:${commentId}`,
      this.CACHE_PREFIX,
    );
  }

  async setReplyCount(commentId: string, count: number): Promise<boolean> {
    return this.cacheService.set(
      `reply:count:${commentId}`,
      count,
      {
        ttl: this.DEFAULT_TTL.COMMENT_COUNT,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async incrementReplyCount(commentId: string): Promise<number> {
    const key = `reply:count:${commentId}`;
    const count = await this.cacheService.increment(key, this.CACHE_PREFIX);
    
    const exists = await this.cacheService.exists(key, this.CACHE_PREFIX);
    if (!exists) {
      await this.cacheService.expire(key, this.DEFAULT_TTL.COMMENT_COUNT, this.CACHE_PREFIX);
    }
    
    return count;
  }

  async decrementReplyCount(commentId: string): Promise<number> {
    return this.cacheService.decrement(
      `reply:count:${commentId}`,
      this.CACHE_PREFIX,
    );
  }

  // Reply Page Caching
  async getReplyPage(
    commentId: string,
    page: number,
    limit: number,
  ): Promise<any[] | null> {
    return this.cacheService.get<any[]>(
      `reply:page:${commentId}:${page}:${limit}`,
      this.CACHE_PREFIX,
    );
  }

  async setReplyPage(
    commentId: string,
    page: number,
    limit: number,
    replies: any[],
  ): Promise<boolean> {
    return this.cacheService.set(
      `reply:page:${commentId}:${page}:${limit}`,
      replies,
      {
        ttl: this.DEFAULT_TTL.COMMENT_PAGE,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async invalidateReplyPages(commentId: string): Promise<number> {
    return this.cacheService.deletePattern(
      `reply:page:${commentId}:*`,
      this.CACHE_PREFIX,
    );
  }

  // Comment Page Caching
  async getCommentPage(
    postId: string,
    page: number,
    limit: number,
  ): Promise<any[] | null> {
    return this.cacheService.get<any[]>(
      `comment:page:${postId}:${page}:${limit}`,
      this.CACHE_PREFIX,
    );
  }

  async setCommentPage(
    postId: string,
    page: number,
    limit: number,
    comments: any[],
  ): Promise<boolean> {
    return this.cacheService.set(
      `comment:page:${postId}:${page}:${limit}`,
      comments,
      {
        ttl: this.DEFAULT_TTL.COMMENT_PAGE,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async invalidateCommentPages(postId: string): Promise<number> {
    return this.cacheService.deletePattern(
      `comment:page:${postId}:*`,
      this.CACHE_PREFIX,
    );
  }

  // Post Like Count Caching
  async getLikeCount(postId: string): Promise<number | null> {
    return this.cacheService.get<number>(
      `like:count:${postId}`,
      this.CACHE_PREFIX,
    );
  }

  async setLikeCount(postId: string, count: number): Promise<boolean> {
    return this.cacheService.set(
      `like:count:${postId}`,
      count,
      {
        ttl: this.DEFAULT_TTL.POST_COUNT,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async incrementLikeCount(postId: string): Promise<number> {
    const key = `like:count:${postId}`;
    const count = await this.cacheService.increment(key, this.CACHE_PREFIX);
    
    const exists = await this.cacheService.exists(key, this.CACHE_PREFIX);
    if (!exists) {
      await this.cacheService.expire(key, this.DEFAULT_TTL.POST_COUNT, this.CACHE_PREFIX);
    }
    
    return count;
  }

  async decrementLikeCount(postId: string): Promise<number> {
    return this.cacheService.decrement(
      `like:count:${postId}`,
      this.CACHE_PREFIX,
    );
  }

  // User Liked Posts Cache
  async getUserLikedPosts(
    userId: string,
    postIds: string[],
  ): Promise<Record<string, boolean>> {
    const keys = postIds.map((postId) => `user:${userId}:liked:${postId}`);
    const values = await this.cacheService.mget<string>(keys, this.CACHE_PREFIX);
    
    const result: Record<string, boolean> = {};
    postIds.forEach((postId, index) => {
      result[postId] = values[index] === 'true';
    });
    
    return result;
  }

  async setUserLikedPost(
    userId: string,
    postId: string,
    liked: boolean,
  ): Promise<boolean> {
    return this.cacheService.set(
      `user:${userId}:liked:${postId}`,
      liked.toString(),
      {
        ttl: 3600, // 1 hour
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  // Batch invalidation
  async invalidatePostCache(postId: string): Promise<void> {
    await Promise.all([
      this.invalidateCommentCount(postId),
      this.invalidateCommentPages(postId),
      this.cacheService.delete(`like:count:${postId}`, this.CACHE_PREFIX),
    ]);
  }

  async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheService.deletePattern(
      `user:${userId}:*`,
      this.CACHE_PREFIX,
    );
  }
}

