import { Controller, Get, Post, Param, Query, UseGuards, Put } from '@nestjs/common';
import { NotificationClientService } from '../clients/notification-client.service';
import { UserClientService } from '../clients/user-client.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUser as CurrentUserType } from '../auth/current-user.decorator';

@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private notificationClient: NotificationClientService,
    private userClient: UserClientService,
  ) {}

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() currentUser: CurrentUserType) {
    const count = await this.notificationClient.getUnreadCount(currentUser.userId);
    return { unread_count: count };
  }

  @Get()
  async getNotifications(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unread_only') unreadOnly?: string,
  ) {
    const result = await this.notificationClient.getNotifications(
      currentUser.userId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      unreadOnly === 'true',
    );
    
    const enrichedNotifications = await Promise.all(
      result.notifications.map(async (notification) => {
        try {
          const actorProfile = await this.userClient.getProfile(notification.actorId);
          return {
            ...notification,
            actor: actorProfile ? {
              username: actorProfile.username || '',
              profile_picture: actorProfile.profilePicture || '',
            } : null,
          };
        } catch (error) {
          return {
            ...notification,
            actor: null,
          };
        }
      })
    );

    return {
      ...result,
      notifications: enrichedNotifications,
    };
  }

  @Post('read-all')
  async markAllAsRead(@CurrentUser() currentUser: CurrentUserType) {
    const count = await this.notificationClient.markAllAsRead(currentUser.userId);
    return { success: true, marked_count: count };
  }

  @Post(':id/read')
  async markAsRead(
    @Param('id') notificationId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    await this.notificationClient.markAsRead(currentUser.userId, notificationId);
    return { success: true, message: 'Notification marked as read' };
  }

  @Get('preferences')
  async getPreferences(@CurrentUser() currentUser: CurrentUserType) {
    const preferences = await this.notificationClient.getPreferences(currentUser.userId);
    return { preferences };
  }
}


