import { Controller, Get, Put, Post, Param, Body, Query, UseGuards } from '@nestjs/common';
import { UserClientService } from '../clients/user-client.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUser as CurrentUserType } from '../auth/current-user.decorator';

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private userClient: UserClientService) {}

  @Get('search')
  async searchUsers(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('q') query?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.userClient.searchUsers(
      query || '',
      currentUser.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
    return result;
  }

  @Get(':id')
  async getProfile(@Param('id') userId: string) {
    const profile = await this.userClient.getProfile(userId);
    if (!profile) {
      throw new Error('User not found');
    }
    return {
      id: profile.id,
      user_id: profile.userId,
      username: profile.username,
      bio: profile.bio,
      profile_picture: profile.profilePicture,
      created_at: profile.createdAt,
    };
  }

  @Put(':id')
  async updateProfile(
    @Param('id') userId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { username?: string; bio?: string; profile_picture?: string },
  ) {
    // Verify user can only update their own profile
    if (currentUser.userId !== userId) {
      throw new Error('Forbidden: Cannot update another user\'s profile');
    }

    await this.userClient.updateProfile(userId, {
      username: body.username,
      bio: body.bio,
      profilePicture: body.profile_picture,
    });

    // Return updated profile
    const profile = await this.userClient.getProfile(userId);
    return {
      id: profile!.id,
      user_id: profile!.userId,
      username: profile!.username,
      bio: profile!.bio,
      profile_picture: profile!.profilePicture,
      created_at: profile!.createdAt,
    };
  }

  @Post(':id/follow')
  async followUser(
    @Param('id') followingId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    try {
      await this.userClient.followUser(currentUser.userId, followingId);
      return { success: true, message: 'User followed successfully' };
    } catch (error: any) {
      // If already following, treat as success
      if (error?.message?.includes('Already following') || error?.message?.includes('already following')) {
        return { success: true, message: 'User already followed' };
      }
      throw error;
    }
  }

  @Post(':id/unfollow')
  async unfollowUser(
    @Param('id') followingId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    try {
      await this.userClient.unfollowUser(currentUser.userId, followingId);
      return { success: true, message: 'User unfollowed successfully' };
    } catch (error: any) {
      // If not following, treat as success
      if (error?.message?.includes('not found') || error?.message?.includes('Not following')) {
        return { success: true, message: 'User not following' };
      }
      throw error;
    }
  }

  @Get('me/followers')
  async getFollowers(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    // TODO: Get followers by searching users who follow the current user
    // For now, we'll use searchUsers with a query to find followers
    // In production, you'd want a dedicated GetFollowers endpoint
    const result = await this.userClient.searchUsers(
      search || '',
      currentUser.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 15,
    );
    
    // Todo: Filter to only show users that the current user follows (for mention dropdown)
    // This is a simplified approach - in production, you'd want a dedicated endpoint
    return {
      users: result.users.filter((user: any) => user.isFollowing),
      total: result.total,
      page: result.page,
    };
  }
}


