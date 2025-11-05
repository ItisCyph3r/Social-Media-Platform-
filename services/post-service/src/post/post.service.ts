import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Post } from '../entities/post.entity';
import { Like } from '../entities/like.entity';
import { Comment } from '../entities/comment.entity';
import { MinioService } from '../storage/minio.service';
import { EventPublisherService } from '../events/event-publisher.service';
import { PostCacheService } from '../cache/post-cache.service';

@Injectable()
export class PostService {
  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Like)
    private likeRepository: Repository<Like>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private minioService: MinioService,
    private eventPublisher: EventPublisherService,
    private cacheService: PostCacheService,
    private configService: ConfigService,
  ) {}

  async createPost(
    userId: string,
    content: string,
    mediaUrls: string[] = [],
  ): Promise<Post> {
    const post = this.postRepository.create({
      userId,
      content,
      mediaUrls,
    });

    const savedPost = await this.postRepository.save(post);

    await this.eventPublisher.publishPostCreated(savedPost.id, savedPost.userId, savedPost.content);

    return savedPost;
  }

  async getPost(postId: string): Promise<Post> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
      relations: ['likes', 'comments'],
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async getUserPosts(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ posts: Post[]; total: number }> {
    const [posts, total] = await this.postRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['likes', 'comments'],
    });

    return { posts, total };
  }

  async getFeed(
    userId: string,
    userIds: string[], 
    page: number = 1,
    limit: number = 20,
  ): Promise<{ posts: Post[]; total: number }> {
    if (userIds.length === 0) {
      return { posts: [], total: 0 };
    }

    const [posts, total] = await this.postRepository.findAndCount({
      where: { userId: In(userIds) },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['likes', 'comments'],
    });

    return { posts, total };
  }

  async likePost(postId: string, userId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLike = await this.likeRepository.findOne({
      where: { postId, userId },
    });

    if (existingLike) {
      throw new ConflictException('Post already liked');
    }

    const like = this.likeRepository.create({
      postId,
      userId,
    });

    await this.likeRepository.save(like);

    await this.cacheService.incrementLikeCount(postId);

    await this.cacheService.setUserLikedPost(userId, postId, true);

    await this.eventPublisher.publishPostLiked(postId, userId, post.userId);
  }

  async unlikePost(postId: string, userId: string): Promise<void> {
    const like = await this.likeRepository.findOne({
      where: { postId, userId },
    });

    if (!like) {
      throw new NotFoundException('Like not found');
    }

    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    await this.likeRepository.remove(like);

    await this.cacheService.decrementLikeCount(postId);

    await this.cacheService.setUserLikedPost(userId, postId, false);

    if (post) {
      await this.eventPublisher.publishPostUnliked(postId, userId, post.userId);
    }
  }

  async createComment(
    postId: string,
    userId: string,
    content: string,
    parentCommentId?: string | null,
    mentions?: string[],
  ): Promise<Comment> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (parentCommentId) {
      const parentComment = await this.commentRepository.findOne({
        where: { id: parentCommentId },
      });

      if (!parentComment) {
        throw new NotFoundException('Parent comment not found');
      }

      if (parentComment.postId !== postId) {
        throw new ConflictException('Parent comment does not belong to this post');
      }
    }

    const comment = this.commentRepository.create({
      postId,
      userId,
      content,
      parentCommentId: parentCommentId || null,
      mentions: mentions || [],
    });

    const savedComment = await this.commentRepository.save(comment);

    if (parentCommentId) {
      await this.cacheService.incrementReplyCount(parentCommentId);
      await this.cacheService.invalidateReplyPages(parentCommentId);
      
      await this.commentRepository
        .createQueryBuilder()
        .update(Comment)
        .set({ replyCount: () => 'replyCount + 1' })
        .where('id = :id', { id: parentCommentId })
        .execute();
    } else {
      await this.cacheService.incrementCommentCount(postId);
      await this.cacheService.invalidateCommentPages(postId);
    }

    await this.eventPublisher.publishPostCommented(
      postId,
      savedComment.id,
      userId,
      post.userId,
      content,
      parentCommentId,
      mentions || [],
    );

    return savedComment;
  }

  async getComments(
    postId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ comments: Comment[]; total: number }> {
    const cachedPage = await this.cacheService.getCommentPage(postId, page, limit);
    if (cachedPage) {
      const cachedTotal = await this.cacheService.getCommentCount(postId);
      return {
        comments: cachedPage,
        total: cachedTotal || cachedPage.length,
      };
    }

    const [comments, total] = await this.commentRepository.findAndCount({
      where: { postId, parentCommentId: IsNull() },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.cacheService.setCommentPage(postId, page, limit, comments);

    return { comments, total };
  }

  async getReplies(
    commentId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ replies: Comment[]; total: number }> {
    const cachedReplies = await this.cacheService.getReplyPage(commentId, page, limit);
    if (cachedReplies) {
      const cachedTotal = await this.cacheService.getReplyCount(commentId);
      return {
        replies: cachedReplies,
        total: cachedTotal || cachedReplies.length,
      };
    }

    const [replies, total] = await this.commentRepository.findAndCount({
      where: { parentCommentId: commentId },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    await this.cacheService.setReplyPage(commentId, page, limit, replies);

    return { replies, total };
  }

  async getPostWithCounts(postId: string): Promise<Post & { likesCount: number; commentsCount: number }> {
    const post = await this.getPost(postId);

    const [cachedLikesCount, cachedCommentsCount] = await Promise.all([
      this.cacheService.getLikeCount(postId),
      this.cacheService.getCommentCount(postId),
    ]);

    let likesCount: number;
    let commentsCount: number;

    if (cachedLikesCount !== null) {
      likesCount = cachedLikesCount;
    } else {
      likesCount = await this.likeRepository.count({ where: { postId } });
      await this.cacheService.setLikeCount(postId, likesCount);
    }

    if (cachedCommentsCount !== null) {
      commentsCount = cachedCommentsCount;
    } else {
      commentsCount = await this.commentRepository.count({ where: { postId } });
      await this.cacheService.setCommentCount(postId, commentsCount);
    }

    return {
      ...post,
      likesCount,
      commentsCount,
    };
  }

  async hasUserLikedPost(postId: string, userId: string): Promise<boolean> {
    const like = await this.likeRepository.findOne({
      where: { postId, userId },
    });
    return !!like;
  }

  async hasUserLikedPosts(postIds: string[], userId: string): Promise<Set<string>> {
    const likes = await this.likeRepository.find({
      where: { postId: In(postIds), userId },
    });
    return new Set(likes.map(like => like.postId));
  }

  /**
   * Get presigned URL for direct client-to-MinIO upload
   * Client will upload directly to MinIO using this URL
   */
  async getPresignedUploadUrl(
    fileName: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; objectName: string; accessUrl: string }> {
    return await this.minioService.getPresignedUploadUrl(fileName, contentType);
  }

  /**
   * Get presigned access URL for an existing file
   */
  async getFileAccessUrl(objectName: string): Promise<string> {
    return await this.minioService.getFileUrl(objectName);
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.postRepository.findOne({
      where: { id: postId, userId },
    });

    if (!post) {
      throw new NotFoundException('Post not found or you do not have permission to delete it');
    }

    if (post.mediaUrls && post.mediaUrls.length > 0) {
      const bucketName = this.configService?.get<string>('MINIO_BUCKET') || 'posts';
      
      const objectNames = post.mediaUrls.map((url) => {
        try {
          // If it's already an object name, use it directly
          if (!url.includes('://')) {
            return url;
          }

          // Parse the URL to extract the path
          const urlObj = new URL(url);
          const pathname = urlObj.pathname;
          
          // Remove leading slash
          let objectName = pathname.startsWith('/') ? pathname.slice(1) : pathname;
          
          // Remove bucket name prefix if present (e.g., 'posts' or 'media')
          // The path format is: /bucket/object-name
          // After removing leading slash: bucket/object-name
          // We need to remove the bucket name to get just the object name
          if (objectName.startsWith(`${bucketName}/`)) {
            objectName = objectName.slice(bucketName.length + 1); // Remove 'bucket/'
          } else if (objectName.startsWith('media/')) {
            // Handle legacy 'media' bucket name
            objectName = objectName.slice(6); // Remove 'media/'
          }
          
          // Ensure object name has the 'posts/' prefix if it's just a filename
          // Object names are stored as: posts/1762379301878-abc123-filename.jpg
          if (!objectName.includes('/')) {
            objectName = `posts/${objectName}`;
          }
          
          return objectName;
        } catch (error) {
          // Fallback: try to extract from path manually
          // Remove query parameters first
          const urlWithoutQuery = url.split('?')[0];
          const parts = urlWithoutQuery.split('/').filter(part => part.length > 0);
          
          // Find the bucket name in the path and get everything after it
          const bucketIndex = parts.findIndex(part => 
            part === bucketName || part === 'posts' || part === 'media'
          );
          
          if (bucketIndex >= 0 && bucketIndex < parts.length - 1) {
            // Get all parts after the bucket name
            const objectParts = parts.slice(bucketIndex + 1);
            return objectParts.join('/');
          }
          
          // Last resort: try to get the last part (filename) and prepend 'posts/'
          const filename = parts[parts.length - 1];
          if (filename) {
            return `posts/${filename}`;
          }
          
          // If all else fails, log and return empty string (will be filtered out)
          console.error(`Failed to extract object name from URL: ${url}`, error);
          return '';
        }
      }).filter((name) => name && name.length > 0); // Filter out invalid names

      if (objectNames.length > 0) {
        await this.minioService.deleteFiles(objectNames);
      }
    }

    await this.postRepository.remove(post);
  }
}
