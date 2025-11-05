import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, Like } from 'typeorm';
import { UserProfile } from '../entities/user-profile.entity';
import { Follow } from '../entities/follow.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserProfile)
    private userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Follow)
    private followRepository: Repository<Follow>,
  ) {}

  async getUserProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    return profile;
  }

  async createProfile(
    userId: string,
    username: string,
    bio?: string,
    profilePicture?: string,
  ): Promise<UserProfile> {
    // Check if profile already exists
    const existingProfile = await this.userProfileRepository.findOne({
      where: { userId },
    });

    if (existingProfile) {
      throw new ConflictException('User profile already exists');
    }

    // Check if username is already taken
    const usernameTaken = await this.userProfileRepository.findOne({
      where: { username },
    });

    if (usernameTaken) {
      throw new ConflictException('Username already taken');
    }

    const profile = this.userProfileRepository.create({
      userId,
      username,
      bio,
      profilePicture,
    });

    return this.userProfileRepository.save(profile);
  }

  async updateProfile(
    userId: string,
    username?: string,
    bio?: string,
    profilePicture?: string,
  ): Promise<UserProfile> {
    const profile = await this.userProfileRepository.findOne({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('User profile not found. Create a profile first.');
    }

    if (username !== undefined) {
      // Check if username is already taken by another user
      const existingProfile = await this.userProfileRepository.findOne({
        where: { username },
      });
      if (existingProfile && existingProfile.userId !== userId) {
        throw new ConflictException('Username already taken');
      }
      profile.username = username;
    }

    if (bio !== undefined) {
      profile.bio = bio;
    }

    if (profilePicture !== undefined) {
      profile.profilePicture = profilePicture;
    }

    return this.userProfileRepository.save(profile);
  }

  async followUser(followerId: string, followingId: string): Promise<void> {
    if (followerId === followingId) {
      throw new ConflictException('Cannot follow yourself');
    }

    const existingFollow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });

    if (existingFollow) {
      throw new ConflictException('Already following this user');
    }

    const follow = this.followRepository.create({
      followerId,
      followingId,
    });

    await this.followRepository.save(follow);
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    const follow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });

    if (!follow) {
      throw new NotFoundException('Follow relationship not found');
    }

    await this.followRepository.remove(follow);
  }

  async getFollowers(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ profiles: UserProfile[]; total: number }> {
    const [follows, total] = await this.followRepository.findAndCount({
      where: { followingId: userId },
      skip: (page - 1) * limit,
      take: limit,
    });

    const followerIds = follows.map((f) => f.followerId);
    if (followerIds.length === 0) {
      return { profiles: [], total };
    }

    const profiles = await this.userProfileRepository.find({
      where: { userId: In(followerIds) },
    });

    return { profiles, total };
  }

  async getFollowing(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ profiles: UserProfile[]; total: number }> {
    const [follows, total] = await this.followRepository.findAndCount({
      where: { followerId: userId },
      skip: (page - 1) * limit,
      take: limit,
    });

    const followingIds = follows.map((f) => f.followingId);
    if (followingIds.length === 0) {
      return { profiles: [], total };
    }

    const profiles = await this.userProfileRepository.find({
      where: { userId: In(followingIds) },
    });

    return { profiles, total };
  }

  async getProfileWithStats(userId: string): Promise<UserProfile & { followersCount: number; followingCount: number }> {
    const profile = await this.getUserProfile(userId);

    const [followersCount, followingCount] = await Promise.all([
      this.followRepository.count({ where: { followingId: userId } }),
      this.followRepository.count({ where: { followerId: userId } }),
    ]);

    return {
      ...profile,
      followersCount,
      followingCount,
    };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.followRepository.findOne({
      where: { followerId, followingId },
    });
    return !!follow;
  }

  async searchUsers(
    query: string,
    currentUserId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ profiles: (UserProfile & { isFollowing: boolean })[]; total: number }> {
    let profiles: UserProfile[];
    let total: number;

    if (!query || query.trim().length === 0) {
      // If no query, return all users except current user
      [profiles, total] = await this.userProfileRepository.findAndCount({
        where: { userId: Not(currentUserId) },
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });
    } else {
      // Search by username (case-insensitive)
      [profiles, total] = await this.userProfileRepository.findAndCount({
        where: [
          {
            username: Like(`%${query}%`),
            userId: Not(currentUserId),
          },
        ],
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });
    }

    // Check follow status for each profile
    const profilesWithFollowStatus = await Promise.all(
      profiles.map(async (profile) => {
        const isFollowing = await this.isFollowing(currentUserId, profile.userId);
        return { ...profile, isFollowing };
      })
    );

    return { profiles: profilesWithFollowStatus, total };
  }
}
