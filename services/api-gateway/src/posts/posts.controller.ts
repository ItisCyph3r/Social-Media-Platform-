import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { PostClientService } from '../clients/post-client.service';
import { UserClientService } from '../clients/user-client.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUser as CurrentUserType } from '../auth/current-user.decorator';
import { extractMentions, validateMentions } from '../utils/mention-parser';

@Controller('api/posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private postClient: PostClientService,
    private userClient: UserClientService,
  ) {}

  @Get('feed')
  async getFeed(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Get user's following list 
    const followingIds = await this.userClient.getFollowingIds(currentUser.userId);
    
    // Use optimized getFeed method 
    const result = await this.postClient.getFeed(
      currentUser.userId,
      followingIds || [],
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );

    const posts = result.posts || [];

    // Check which posts the user has liked
    const postIds = posts.map(p => p.id);
    let likedPostsMap: Record<string, boolean> = {};
    if (postIds.length > 0) {
      try {
        likedPostsMap = await this.postClient.checkUserLikedPosts(postIds, currentUser.userId);
      } catch (error) {
        console.error('Error checking liked posts:', error);
        // Continue with all false if check fails
      }
    }

    // Batch fetch user profiles 
    const uniqueUserIds = [...new Set(posts.map(p => p.userId))];
    const userProfilesMap: Record<string, any> = {};
    
    if (uniqueUserIds.length > 0) {
      // Batch fetch all user profiles in parallel
      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const profile = await this.userClient.getProfile(userId);
            if (profile) {
              userProfilesMap[userId] = profile;
            }
          } catch (error) {
            // Profile fetch failed, will use null
            console.error(`Failed to fetch profile for user ${userId}:`, error);
          }
        })
      );
    }

    // TODO:  Create a Set of following IDs for quick lookup
    const followingIdsSet = new Set(followingIds || []);

    // Enrich posts with user info 
    const enrichedPosts = posts.map((post) => {
      const userProfile = userProfilesMap[post.userId];
      // Check if current user follows this post author 
      const isFollowing = post.userId !== currentUser.userId && followingIdsSet.has(post.userId);
      
      return {
        id: post.id,
        user_id: post.userId,
        content: post.content,
        created_at: post.createdAt || new Date().toISOString(),
        user: userProfile ? {
          username: userProfile.username || '',
          profile_picture: userProfile.profilePicture || '',
        } : null,
        user_liked: likedPostsMap[post.id] || false,
        is_following: isFollowing,
        media_urls: post.mediaUrls || [],
        likes_count: post.likesCount || 0,
        comments_count: post.commentsCount || 0,
      };
    });

    return {
      posts: enrichedPosts,
      total: result.total || 0,
      page: result.page || parseInt(page || '1', 10),
    };
  }

  @Get('user/:userId')
  async getUserPosts(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.postClient.getUserPosts(
      userId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );

    return {
      posts: result.posts,
      total: result.total,
      page: result.page,
    };
  }

  @Get(':id')
  async getPost(@Param('id') postId: string) {
    const post = await this.postClient.getPost(postId);
    if (!post) {
      throw new Error('Post not found');
    }
    return post;
  }

  @Post()
  async createPost(
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { content: string; media_urls?: string[] },
  ) {
    const post = await this.postClient.createPost(
      currentUser.userId,
      body.content,
      body.media_urls || [],
    );
    return post;
  }

  @Post(':id/like')
  async likePost(@Param('id') postId: string, @CurrentUser() currentUser: CurrentUserType) {
    await this.postClient.likePost(postId, currentUser.userId);
    return { success: true, message: 'Post liked successfully' };
  }

  @Delete(':id/like')
  async unlikePost(@Param('id') postId: string, @CurrentUser() currentUser: CurrentUserType) {
    await this.postClient.unlikePost(postId, currentUser.userId);
    return { success: true, message: 'Post unliked successfully' };
  }

  @Get(':id/comments')
  async getComments(
    @Param('id') postId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.postClient.getComments(
      postId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
    
    // Collect all unique user IDs from mentions across all comments
    const allMentionedUserIds = new Set<string>();
    result.comments.forEach((comment) => {
      (comment.mentions || []).forEach((userId) => allMentionedUserIds.add(userId));
    });

    // Batch fetch usernames for all mentioned users
    const mentionUserMap = new Map<string, string>();
    if (allMentionedUserIds.size > 0) {
      await Promise.all(
        Array.from(allMentionedUserIds).map(async (userId) => {
          try {
            const userProfile = await this.userClient.getProfile(userId);
            if (userProfile?.username) {
              mentionUserMap.set(userId, userProfile.username);
            }
          } catch (error) {
            // Silently skip invalid user IDs
          }
        }),
      );
    }

    // Enrich comments with user info and mention usernames
    const enrichedComments = await Promise.all(
      result.comments.map(async (comment) => {
        try {
          const userProfile = await this.userClient.getProfile(comment.userId);
          // Map mention user IDs to usernames
          const mentionUsernames = (comment.mentions || [])
            .map((userId) => mentionUserMap.get(userId))
            .filter((username): username is string => !!username);

          return {
            id: comment.id,
            post_id: comment.postId,
            user_id: comment.userId,
            content: comment.content,
            created_at: comment.createdAt || new Date().toISOString(),
            parent_comment_id: comment.parentCommentId || null,
            mentions: comment.mentions || [],
            mention_usernames: mentionUsernames,
            reply_count: comment.replyCount || 0,
            is_deleted: comment.isDeleted || false,
            user: userProfile ? {
              username: userProfile.username || '',
              profile_picture: userProfile.profilePicture || '',
            } : null,
          };
        } catch (error) {
          const mentionUsernames = (comment.mentions || [])
            .map((userId) => mentionUserMap.get(userId))
            .filter((username): username is string => !!username);

          return {
            id: comment.id,
            post_id: comment.postId,
            user_id: comment.userId,
            content: comment.content,
            created_at: comment.createdAt || new Date().toISOString(),
            parent_comment_id: comment.parentCommentId || null,
            mentions: comment.mentions || [],
            mention_usernames: mentionUsernames,
            reply_count: comment.replyCount || 0,
            is_deleted: comment.isDeleted || false,
            user: null,
          };
        }
      })
    );

    return {
      comments: enrichedComments,
      total: result.total,
      page: result.page,
    };
  }

  @Post(':id/comments')
  async createComment(
    @Param('id') postId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { content: string; parent_comment_id?: string },
  ) {
    // Extract mentions from content
    const mentionedUsernames = extractMentions(body.content);
    
    // Validate and convert usernames to user IDs
    const mentionedUserIds = mentionedUsernames.length > 0
      ? await validateMentions(mentionedUsernames, this.userClient)
      : [];

    // Limit mentions to prevent abuse (max 10 mentions per comment)
    const validMentions = mentionedUserIds.slice(0, 10);

    const comment = await this.postClient.createComment(
      postId,
      currentUser.userId,
      body.content,
      body.parent_comment_id || null,
      validMentions,
    );

    // Enrich with user info
    const userProfile = await this.userClient.getProfile(comment.userId);
    
    return {
      id: comment.id,
      post_id: comment.postId,
      user_id: comment.userId,
      content: comment.content,
      created_at: comment.createdAt,
      parent_comment_id: comment.parentCommentId || null,
      mentions: comment.mentions || [],
      reply_count: comment.replyCount || 0,
      user: userProfile ? {
        username: userProfile.username || '',
        profile_picture: userProfile.profilePicture || '',
      } : null,
    };
  }

  @Get('comments/:commentId/replies')
  async getReplies(
    @Param('commentId') commentId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.postClient.getReplies(
      commentId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
    
    // Collect all unique user IDs from mentions across all replies
    const allMentionedUserIds = new Set<string>();
    result.replies.forEach((reply) => {
      (reply.mentions || []).forEach((userId) => allMentionedUserIds.add(userId));
    });

    // Batch fetch usernames for all mentioned users
    const mentionUserMap = new Map<string, string>();
    if (allMentionedUserIds.size > 0) {
      await Promise.all(
        Array.from(allMentionedUserIds).map(async (userId) => {
          try {
            const userProfile = await this.userClient.getProfile(userId);
            if (userProfile?.username) {
              mentionUserMap.set(userId, userProfile.username);
            }
          } catch (error) {
            // Silently skip invalid user IDs
          }
        }),
      );
    }

    // Enrich replies with user info and mention usernames
    const enrichedReplies = await Promise.all(
      result.replies.map(async (reply) => {
        try {
          const userProfile = await this.userClient.getProfile(reply.userId);
          // Map mention user IDs to usernames
          const mentionUsernames = (reply.mentions || [])
            .map((userId) => mentionUserMap.get(userId))
            .filter((username): username is string => !!username);

          return {
            id: reply.id,
            post_id: reply.postId,
            user_id: reply.userId,
            content: reply.content,
            created_at: reply.createdAt || new Date().toISOString(),
            parent_comment_id: reply.parentCommentId || null,
            mentions: reply.mentions || [],
            mention_usernames: mentionUsernames,
            reply_count: reply.replyCount || 0,
            is_deleted: reply.isDeleted || false,
            user: userProfile ? {
              username: userProfile.username || '',
              profile_picture: userProfile.profilePicture || '',
            } : null,
          };
        } catch (error) {
          const mentionUsernames = (reply.mentions || [])
            .map((userId) => mentionUserMap.get(userId))
            .filter((username): username is string => !!username);

          return {
            id: reply.id,
            post_id: reply.postId,
            user_id: reply.userId,
            content: reply.content,
            created_at: reply.createdAt || new Date().toISOString(),
            parent_comment_id: reply.parentCommentId || null,
            mentions: reply.mentions || [],
            mention_usernames: mentionUsernames,
            reply_count: reply.replyCount || 0,
            is_deleted: reply.isDeleted || false,
            user: null,
          };
        }
      })
    );

    return {
      replies: enrichedReplies,
      total: result.total,
      page: result.page,
    };
  }

  @Delete(':postId/comments/:commentId')
  async deleteComment(
    @Param('postId') postId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    await this.postClient.deleteComment(commentId, currentUser.userId);
    return { success: true, message: 'Comment deleted successfully' };
  }

  @Post('upload-url')
  async getPresignedUploadUrl(
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { file_name: string; content_type: string },
  ) {
    const result = await this.postClient.getPresignedUploadUrl(body.file_name, body.content_type);
    return result;
  }

  @Delete(':id')
  async deletePost(@Param('id') postId: string, @CurrentUser() currentUser: CurrentUserType) {
    await this.postClient.deletePost(postId, currentUser.userId);
    return { success: true, message: 'Post deleted successfully' };
  }
}


