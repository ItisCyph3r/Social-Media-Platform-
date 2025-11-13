import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { UserCacheService } from '../cache/user-cache.service';

interface UserServiceClient {
  GetUserProfile(
    data: { user_id: string },
    callback: (error: any, response: { id: string; user_id: string; username: string; bio: string; profile_picture: string; created_at: string }) => void,
  ): void;
}

@Injectable()
export class UserClientService implements OnModuleInit {
  private userService: UserServiceClient;

  constructor(
    private configService: ConfigService,
    private userCache: UserCacheService,
  ) {}

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
    return this.userCache.getOrSetProfile(
      userId,
      async () => {
        return new Promise((resolve) => {
          this.userService.GetUserProfile(
            { user_id: userId },
            (error, response) => {
              if (error || !response) {
                resolve(null);
              } else {
                const profile = {
                  id: response.id,
                  userId: response.user_id,
                  username: response.username,
                  bio: response.bio || '',
                  profilePicture: response.profile_picture || '',
                  createdAt: response.created_at,
                };
                resolve(profile);
              }
            },
          );
        });
      },
    );
  }

  /**
   * Batch fetch multiple user profiles
   */
  async getProfiles(userIds: string[]): Promise<Map<string, { username: string; profile_picture: string }>> {
    const profileMap = new Map<string, { username: string; profile_picture: string }>();
    
    // Fetch all profiles in parallel
    const profilePromises = userIds.map(async (userId) => {
      const profile = await this.getProfile(userId);
      if (profile) {
        return { userId, profile: { username: profile.username, profile_picture: profile.profilePicture } };
      }
      return { userId, profile: { username: 'Unknown', profile_picture: '' } };
    });

    const results = await Promise.all(profilePromises);
    results.forEach(({ userId, profile }) => {
      profileMap.set(userId, profile);
    });

    return profileMap;
  }
}

