import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { UserService } from './user.service';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @GrpcMethod('UserService', 'GetUserProfile')
  async getUserProfile(data: { user_id: string }) {
    try {
      const profile = await this.userService.getProfileWithStats(data.user_id);
      return {
        id: profile.id,
        user_id: profile.userId,
        username: profile.username,
        bio: profile.bio || '',
        profile_picture: profile.profilePicture || '',
        followers_count: profile.followersCount,
        following_count: profile.followingCount,
      };
    } catch (error) {
      return {
        id: '',
        user_id: data.user_id,
        username: '',
        bio: '',
        profile_picture: '',
        followers_count: 0,
        following_count: 0,
      };
    }
  }

  @GrpcMethod('UserService', 'UpdateProfile')
  async updateProfile(data: {
    user_id: string;
    username?: string;
    bio?: string;
    profile_picture?: string;
  }) {
    try {
      const profile = await this.userService.updateProfile(
        data.user_id,
        data.username,
        data.bio,
        data.profile_picture,
      );
      return {
        id: profile.id,
        user_id: profile.userId,
        username: profile.username,
        bio: profile.bio || '',
        profile_picture: profile.profilePicture || '',
        followers_count: 0,
        following_count: 0,
      };
    } catch (error) {
      throw error;
    }
  }

  @GrpcMethod('UserService', 'FollowUser')
  async followUser(data: { follower_id: string; following_id: string }) {
    try {
      await this.userService.followUser(data.follower_id, data.following_id);
      return {
        success: true,
        message: 'Successfully followed user',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to follow user',
      };
    }
  }

  @GrpcMethod('UserService', 'UnfollowUser')
  async unfollowUser(data: { follower_id: string; following_id: string }) {
    try {
      await this.userService.unfollowUser(data.follower_id, data.following_id);
      return {
        success: true,
        message: 'Successfully unfollowed user',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to unfollow user',
      };
    }
  }

  @GrpcMethod('UserService', 'GetFollowers')
  async getFollowers(data: { user_id: string; page?: number; limit?: number }) {
    const { profiles, total } = await this.userService.getFollowers(
      data.user_id,
      data.page || 1,
      data.limit || 20,
    );

    return {
      followers: profiles.map((p) => ({
        id: p.id,
        user_id: p.userId,
        username: p.username,
        bio: p.bio || '',
        profile_picture: p.profilePicture || '',
        followers_count: 0,
        following_count: 0,
      })),
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('UserService', 'GetFollowing')
  async getFollowing(data: { user_id: string; page?: number; limit?: number }) {
    const { profiles, total } = await this.userService.getFollowing(
      data.user_id,
      data.page || 1,
      data.limit || 20,
    );

    return {
      following: profiles.map((p) => ({
        id: p.id,
        user_id: p.userId,
        username: p.username,
        bio: p.bio || '',
        profile_picture: p.profilePicture || '',
        followers_count: 0,
        following_count: 0,
      })),
      total,
      page: data.page || 1,
    };
  }

  @GrpcMethod('UserService', 'SearchUsers')
  async searchUsers(data: {
    query: string;
    current_user_id: string;
    page?: number;
    limit?: number;
  }) {
    const { profiles, total } = await this.userService.searchUsers(
      data.query || '',
      data.current_user_id,
      data.page || 1,
      data.limit || 20,
    );

    // Get stats for each profile
    const usersWithStats = await Promise.all(
      profiles.map(async (p) => {
        try {
          const profileWithStats = await this.userService.getProfileWithStats(p.userId);
          return {
            id: p.id,
            user_id: p.userId,
            username: p.username,
            bio: p.bio || '',
            profile_picture: p.profilePicture || '',
            followers_count: profileWithStats.followersCount,
            following_count: profileWithStats.followingCount,
            is_following: p.isFollowing || false,
          };
        } catch (error) {
          return {
            id: p.id,
            user_id: p.userId,
            username: p.username,
            bio: p.bio || '',
            profile_picture: p.profilePicture || '',
            followers_count: 0,
            following_count: 0,
            is_following: p.isFollowing || false,
          };
        }
      })
    );

    return {
      users: usersWithStats,
      total,
      page: data.page || 1,
    };
  }
}

