import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';

export interface CreateNotificationDto {
  userId: string;
  type: string;
  relatedId?: string;
  actorId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationPreference)
    private preferenceRepository: Repository<NotificationPreference>,
  ) {}

  async createNotification(dto: CreateNotificationDto): Promise<Notification> {
    // Check user preferences
    const preference = await this.preferenceRepository.findOne({
      where: { userId: dto.userId, type: dto.type },
    });

    // If preference exists and push is disabled, still store but don't push
    // If no preference, default to enabled
    const shouldPush = preference ? preference.pushEnabled : true;

    // Check for duplicate notifications (same type, relatedId, actorId) within last 5 minutes
    // This prevents spam (multiple likes from same user = 1 notification)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingNotification = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.userId = :userId', { userId: dto.userId })
      .andWhere('notification.type = :type', { type: dto.type })
      .andWhere('notification.relatedId = :relatedId', { relatedId: dto.relatedId })
      .andWhere('notification.actorId = :actorId', { actorId: dto.actorId })
      .andWhere('notification.createdAt > :fiveMinutesAgo', { fiveMinutesAgo })
      .orderBy('notification.createdAt', 'DESC')
      .getOne();

    // If duplicate within 5 minutes, skip creating new notification
    // Instead, we could update the existing one or batch notifications
    if (existingNotification) {
      console.log(`[NotificationService] Duplicate notification prevented for ${dto.type}`);
      return existingNotification;
    }

    const notification = this.notificationRepository.create({
      userId: dto.userId,
      type: dto.type,
      relatedId: dto.relatedId,
      actorId: dto.actorId,
      metadata: dto.metadata || {},
      read: false,
    });

    const saved = await this.notificationRepository.save(notification);

    // If push is enabled, the WebSocket gateway will handle pushing
    // (it will be notified via the service event)

    return saved;
  }

  async getNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false,
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const where: any = { userId };
    if (unreadOnly) {
      where.read = false;
    }

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notificationRepository.count({
      where: { userId, read: false },
    });

    return { notifications, total, unreadCount };
  }

  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.read = true;
    notification.readAt = new Date();

    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepository
      .createQueryBuilder()
      .update(Notification)
      .set({ 
        read: true,
        readAt: new Date(),
      })
      .where('userId = :userId', { userId })
      .andWhere('read = :read', { read: false })
      .execute();

    return result.affected || 0;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, read: false },
    });
  }

  async updatePreference(
    userId: string,
    type: string,
    emailEnabled: boolean,
    pushEnabled: boolean,
  ): Promise<NotificationPreference> {
    let preference = await this.preferenceRepository.findOne({
      where: { userId, type },
    });

    if (!preference) {
      preference = this.preferenceRepository.create({
        userId,
        type,
        emailEnabled,
        pushEnabled,
      });
    } else {
      preference.emailEnabled = emailEnabled;
      preference.pushEnabled = pushEnabled;
    }

    return this.preferenceRepository.save(preference);
  }

  async getPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.preferenceRepository.find({
      where: { userId },
    });
  }
}

