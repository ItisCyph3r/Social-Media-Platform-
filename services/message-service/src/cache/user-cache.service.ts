import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

export interface UserProfile {
  id: string;
  userId: string;
  username: string;
  bio: string;
  profilePicture: string;
  createdAt: string;
}

/**
 * Service-specific cache for user profiles
 * Provides caching with appropriate TTLs for user data
 */
@Injectable()
export class UserCacheService {
  private readonly CACHE_PREFIX = 'user';
  private readonly DEFAULT_TTL = {
    PROFILE: 600, 
  };

  constructor(private cacheService: CacheService) {}

  /**
   * Get user profile from cache
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    return this.cacheService.get<UserProfile>(
      `profile:${userId}`,
      this.CACHE_PREFIX,
    );
  }

  /**
   * Set user profile in cache
   */
  async setProfile(userId: string, profile: UserProfile): Promise<boolean> {
    return this.cacheService.set(
      `profile:${userId}`,
      profile,
      {
        ttl: this.DEFAULT_TTL.PROFILE,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  /**
   * Get or set user profile
   */
  async getOrSetProfile(
    userId: string,
    fetchFn: () => Promise<UserProfile | null>,
  ): Promise<UserProfile | null> {
    return this.cacheService.getOrSet<UserProfile | null>(
      `profile:${userId}`,
      fetchFn,
      {
        ttl: this.DEFAULT_TTL.PROFILE,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  /**
   * Invalidate user profile cache
   */
  async invalidateProfile(userId: string): Promise<void> {
    await this.cacheService.delete(
      `profile:${userId}`,
      this.CACHE_PREFIX,
    );
  }

  /**
   * Batch get user profiles
   */
  async getProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
    const keys = userIds.map((id) => `profile:${id}`);
    const profiles = await this.cacheService.mget<UserProfile>(
      keys,
      this.CACHE_PREFIX,
    );

    const profileMap = new Map<string, UserProfile>();
    userIds.forEach((userId, index) => {
      const profile = profiles[index];
      if (profile) {
        profileMap.set(userId, profile);
      }
    });

    return profileMap;
  }

  /**
   * Batch set user profiles
   */
  async setProfiles(profiles: Map<string, UserProfile>): Promise<boolean> {
    const data: Record<string, UserProfile> = {};
    profiles.forEach((profile, userId) => {
      data[`profile:${userId}`] = profile;
    });

    return this.cacheService.mset(data, {
      ttl: this.DEFAULT_TTL.PROFILE,
      prefix: this.CACHE_PREFIX,
    });
  }
}



