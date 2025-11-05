import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface NotificationServiceClient {
  GetNotifications(
    data: { user_id: string; page?: number; limit?: number; unread_only?: boolean },
    callback: (error: any, response: {
      notifications: Array<{
        id: string;
        user_id: string;
        type: string;
        related_id: string;
        actor_id: string;
        read: boolean;
        read_at: string;
        created_at: string;
        metadata: Record<string, string>;
      }>;
      total: number;
      unread_count: number;
      page: number;
    }) => void,
  ): void;
  MarkAsRead(
    data: { user_id: string; notification_id: string },
    callback: (error: any, response: { success: boolean; message: string }) => void,
  ): void;
  MarkAllAsRead(
    data: { user_id: string },
    callback: (error: any, response: { success: boolean; marked_count: number }) => void,
  ): void;
  GetUnreadCount(
    data: { user_id: string },
    callback: (error: any, response: { unread_count: number }) => void,
  ): void;
  GetPreferences(
    data: { user_id: string },
    callback: (error: any, response: {
      preferences: Array<{
        type: string;
        email_enabled: boolean;
        push_enabled: boolean;
      }>;
    }) => void,
  ): void;
}

@Injectable()
export class NotificationClientService implements OnModuleInit {
  private notificationService: NotificationServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const notificationServiceUrl = this.configService.get<string>('NOTIFICATION_SERVICE_GRPC_URL') || 'localhost:5006';
    const protoPath = join(__dirname, '../../../../shared/protos/notification.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const notificationProto = grpc.loadPackageDefinition(packageDefinition).notification as any;

    this.notificationService = new notificationProto.NotificationService(
      notificationServiceUrl,
      grpc.credentials.createInsecure(),
    ) as NotificationServiceClient;

    console.log('[NotificationClientService] Connected to Notification Service');
  }

  async getNotifications(userId: string, page: number = 1, limit: number = 20, unreadOnly: boolean = false): Promise<{
    notifications: Array<{
      id: string;
      userId: string;
      type: string;
      relatedId: string;
      actorId: string;
      read: boolean;
      readAt: string | null;
      createdAt: string;
      metadata: Record<string, any>;
    }>;
    total: number;
    unreadCount: number;
    page: number;
  }> {
    return new Promise((resolve, reject) => {
      this.notificationService.GetNotifications(
        { user_id: userId, page, limit, unread_only: unreadOnly },
        (error, response) => {
          if (error || !response) {
            reject(error || new Error('Failed to get notifications'));
          } else {
            resolve({
              notifications: (response.notifications || []).map((notif: any) => ({
                id: notif.id,
                userId: notif.user_id,
                type: notif.type,
                relatedId: notif.related_id,
                actorId: notif.actor_id,
                read: notif.read,
                readAt: notif.read_at || null,
                createdAt: notif.created_at,
                metadata: notif.metadata || {},
              })),
              total: response.total || 0,
              unreadCount: response.unread_count || 0,
              page: response.page || page,
            });
          }
        },
      );
    });
  }

  async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.notificationService.MarkAsRead(
        { user_id: userId, notification_id: notificationId },
        (error, response) => {
          if (error) {
            reject(error);
          } else if (!response?.success) {
            reject(new Error(response?.message || 'Failed to mark as read'));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  async markAllAsRead(userId: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.notificationService.MarkAllAsRead(
        { user_id: userId },
        (error, response) => {
          if (error) {
            reject(error);
          } else if (!response?.success) {
            reject(new Error('Failed to mark all as read'));
          } else {
            resolve(response.marked_count || 0);
          }
        },
      );
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return new Promise((resolve) => {
      this.notificationService.GetUnreadCount(
        { user_id: userId },
        (error, response) => {
          if (error || !response) {
            resolve(0);
          } else {
            resolve(response.unread_count || 0);
          }
        },
      );
    });
  }

  async getPreferences(userId: string): Promise<Array<{
    type: string;
    emailEnabled: boolean;
    pushEnabled: boolean;
  }>> {
    return new Promise((resolve) => {
      this.notificationService.GetPreferences(
        { user_id: userId },
        (error, response) => {
          if (error || !response) {
            resolve([]);
          } else {
            resolve((response.preferences || []).map((pref: any) => ({
              type: pref.type,
              emailEnabled: pref.email_enabled,
              pushEnabled: pref.push_enabled,
            })));
          }
        },
      );
    });
  }
}

