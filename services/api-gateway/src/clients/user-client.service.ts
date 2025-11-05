import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface UserServiceClient {
  GetUserProfile(
    data: { user_id: string },
    callback: (error: any, response: { id: string; user_id: string; username: string; bio: string; profile_picture: string; created_at: string }) => void,
  ): void;
  UpdateProfile(
    data: { user_id: string; username?: string; bio?: string; profile_picture?: string },
    callback: (error: any, response: { id: string; user_id: string; username: string; bio: string; profile_picture: string; created_at: string }) => void,
  ): void;
  FollowUser(
    data: { follower_id: string; following_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  UnfollowUser(
    data: { follower_id: string; following_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  GetFollowing(
    data: { user_id: string; page?: number; limit?: number },
    callback: (error: any, response: { following: Array<{ id: string; user_id: string; username: string; bio: string; profile_picture: string }>; total: number; page: number }) => void,
  ): void;
  SearchUsers(
    data: { query: string; current_user_id: string; page?: number; limit?: number },
    callback: (error: any, response: { users: Array<{ id: string; user_id: string; username: string; bio: string; profile_picture: string; followers_count: number; following_count: number; is_following: boolean }>; total: number; page: number }) => void,
  ): void;
}

@Injectable()
export class UserClientService implements OnModuleInit {
  private userService: UserServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const userServiceUrl = this.configService.get<string>('USER_SERVICE_GRPC_URL') || 'localhost:5002';
    const protoPath = join(__dirname, '../../../../shared/protos/user.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const userProto = grpc.loadPackageDefinition(packageDefinition).user as any;

    this.userService = new userProto.UserService(
      userServiceUrl,
      grpc.credentials.createInsecure(),
    ) as UserServiceClient;

    console.log('[UserClientService] Connected to User Service');
  }

  async getProfile(userId: string): Promise<{
    id: string;
    userId: string;
    username: string;
    bio: string;
    profilePicture: string;
    createdAt: string;
  } | null> {
    return new Promise((resolve) => {
      this.userService.GetUserProfile(
        { user_id: userId },
        (error, response) => {
          if (error || !response) {
            resolve(null);
          } else {
            resolve({
              id: response.id,
              userId: response.user_id,
              username: response.username,
              bio: response.bio,
              profilePicture: response.profile_picture,
              createdAt: response.created_at,
            });
          }
        },
      );
    });
  }

  async updateProfile(
    userId: string,
    data: { username?: string; bio?: string; profilePicture?: string },
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.userService.UpdateProfile(
        {
          user_id: userId,
          username: data.username,
          bio: data.bio,
          profile_picture: data.profilePicture,
        },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Update failed'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async followUser(followerId: string, followingId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.userService.FollowUser(
        { follower_id: followerId, following_id: followingId },
        (error, response) => {
          if (error) {
            // If already following, treat as success (idempotent)
            if (error.message?.includes('Already following') || error.message?.includes('already following')) {
              resolve(true);
              return;
            }
            reject(error);
          } else if (!response?.success) {
            // If already following, treat as success
            if (response?.message?.includes('Already following') || response?.message?.includes('already following')) {
              resolve(true);
              return;
            }
            reject(new Error(response?.message || 'Follow failed'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async unfollowUser(followerId: string, followingId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.userService.UnfollowUser(
        { follower_id: followerId, following_id: followingId },
        (error, response) => {
          if (error) {
            // If not following, treat as success (idempotent)
            if (error.message?.includes('not found') || error.message?.includes('Not following')) {
              resolve(true);
              return;
            }
            reject(error);
          } else if (!response?.success) {
            // If not following, treat as success
            if (response?.message?.includes('not found') || response?.message?.includes('Not following')) {
              resolve(true);
              return;
            }
            reject(new Error(response?.message || 'Unfollow failed'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async getFollowingIds(userId: string): Promise<string[]> {
    return new Promise((resolve) => {
      this.userService.GetFollowing(
        { user_id: userId, page: 1, limit: 1000 },
        (error, response) => {
          if (error || !response) {
            resolve([]);
          } else {
            // Extract user_ids from the following list
            const userIds = (response.following || []).map((f: any) => f.user_id);
            resolve(userIds);
          }
        },
      );
    });
  }

  async searchUsers(query: string, currentUserId: string, page: number = 1, limit: number = 20): Promise<{
    users: Array<{
      id: string;
      userId: string;
      username: string;
      bio: string;
      profilePicture: string;
      followersCount: number;
      followingCount: number;
      isFollowing: boolean;
    }>;
    total: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.userService.SearchUsers(
        { query, current_user_id: currentUserId, page, limit },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Search failed'));
          } else {
            resolve({
              users: (response.users || []).map((u: any) => ({
                id: u.id,
                userId: u.user_id,
                username: u.username,
                bio: u.bio || '',
                profilePicture: u.profile_picture || '',
                followersCount: u.followers_count || 0,
                followingCount: u.following_count || 0,
                isFollowing: u.is_following || false,
              })),
              total: response.total || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }
}

