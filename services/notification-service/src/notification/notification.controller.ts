import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { NotificationService } from './notification.service';

@Controller()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @GrpcMethod('NotificationService', 'GetNotifications')
  async getNotifications(data: {
    user_id: string;
    page?: number;
    limit?: number;
    unread_only?: boolean;
  }) {
    const { notifications, total, unreadCount } = await this.notificationService.getNotifications(
      data.user_id,
      data.page || 1,
      data.limit || 20,
      data.unread_only || false,
    );

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        user_id: n.userId,
        type: n.type,
        related_id: n.relatedId || '',
        actor_id: n.actorId || '',
        read: n.read,
        read_at: n.readAt ? n.readAt.toISOString() : '',
        created_at: n.createdAt.toISOString(),
        metadata: n.metadata || {},
      })),
      total,
      unread_count: unreadCount,
      page: data.page || 1,
    };
  }

  @GrpcMethod('NotificationService', 'MarkAsRead')
  async markAsRead(data: { user_id: string; notification_id: string }) {
    try {
      const notification = await this.notificationService.markAsRead(
        data.user_id,
        data.notification_id,
      );
      return {
        success: true,
        message: 'Notification marked as read',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to mark as read',
      };
    }
  }

  @GrpcMethod('NotificationService', 'MarkAllAsRead')
  async markAllAsRead(data: { user_id: string }) {
    try {
      const markedCount = await this.notificationService.markAllAsRead(data.user_id);
      return {
        success: true,
        marked_count: markedCount,
      };
    } catch (error) {
      return {
        success: false,
        marked_count: 0,
      };
    }
  }

  @GrpcMethod('NotificationService', 'GetUnreadCount')
  async getUnreadCount(data: { user_id: string }) {
    const unreadCount = await this.notificationService.getUnreadCount(data.user_id);
    return {
      unread_count: unreadCount,
    };
  }

  @GrpcMethod('NotificationService', 'UpdatePreferences')
  async updatePreferences(data: {
    user_id: string;
    type: string;
    email_enabled: boolean;
    push_enabled: boolean;
  }) {
    try {
      await this.notificationService.updatePreference(
        data.user_id,
        data.type,
        data.email_enabled,
        data.push_enabled,
      );
      return {
        success: true,
        message: 'Preferences updated',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to update preferences',
      };
    }
  }

  @GrpcMethod('NotificationService', 'GetPreferences')
  async getPreferences(data: { user_id: string }) {
    const preferences = await this.notificationService.getPreferences(data.user_id);
    return {
      preferences: preferences.map((p) => ({
        type: p.type,
        email_enabled: p.emailEnabled,
        push_enabled: p.pushEnabled,
      })),
    };
  }
}




