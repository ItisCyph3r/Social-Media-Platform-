import { Injectable, Inject, Logger } from '@nestjs/common';
import type { IEmailProvider } from './interfaces/email-provider.interface';

/**
 * Email Service
 * Handles all email sending operations
 * Uses the configured email provider (Resend, AWS SES, etc.)
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject('IEmailProvider') private emailProvider: IEmailProvider,
  ) {}

  /**
   * Send a notification email
   */
  async sendNotificationEmail(
    to: string,
    notificationType: string,
    notificationData: {
      actorName?: string;
      postPreview?: string;
      commentPreview?: string;
      messagePreview?: string;
      [key: string]: any;
    },
  ): Promise<boolean> {
    // TODO: Use test email for now (hardcode for testing)
    const recipientEmail = 'samuelmomoh61@gmail.com';
    
    const { subject, html, text } = this.generateNotificationEmail(
      notificationType,
      notificationData,
    );

    const result = await this.emailProvider.sendEmail({
      to: recipientEmail,
      subject,
      html,
      text,
    });

    if (result.success) {
      this.logger.log(`Notification email sent to ${to} for ${notificationType}`);
      return true;
    } else {
      this.logger.error(`Failed to send notification email to ${to}: ${result.error}`);
      return false;
    }
  }

  /**
   * Generate email content based on notification type
   */
  private generateNotificationEmail(
    type: string,
    data: Record<string, any>,
  ): { subject: string; html: string; text: string } {
    const actorName = data.actorName || 'Someone';
    
    switch (type) {
      case 'post.liked':
        return {
          subject: `${actorName} liked your post`,
          html: `
            <h2>${actorName} liked your post</h2>
            ${data.postPreview ? `<p>${data.postPreview}</p>` : ''}
            <p><a href="${data.postUrl || '#'}">View post</a></p>
          `,
          text: `${actorName} liked your post. ${data.postPreview || ''}`,
        };

      case 'post.commented':
        return {
          subject: `${actorName} commented on your post`,
          html: `
            <h2>${actorName} commented on your post</h2>
            ${data.postPreview ? `<p>Post: ${data.postPreview}</p>` : ''}
            ${data.commentPreview ? `<p>Comment: ${data.commentPreview}</p>` : ''}
            <p><a href="${data.postUrl || '#'}">View post</a></p>
          `,
          text: `${actorName} commented on your post: ${data.commentPreview || ''}`,
        };

      case 'comment.mentioned':
        return {
          subject: `${actorName} mentioned you in a comment`,
          html: `
            <h2>${actorName} mentioned you in a comment</h2>
            ${data.commentPreview ? `<p>Comment: ${data.commentPreview}</p>` : ''}
            <p><a href="${data.postUrl || '#'}">View post</a></p>
          `,
          text: `${actorName} mentioned you in a comment: ${data.commentPreview || ''}`,
        };

      case 'message.received':
        return {
          subject: `New message from ${actorName}`,
          html: `
            <h2>New message from ${actorName}</h2>
            ${data.messagePreview ? `<p>${data.messagePreview}</p>` : ''}
            <p><a href="${data.messageUrl || '#'}">View conversation</a></p>
          `,
          text: `New message from ${actorName}: ${data.messagePreview || ''}`,
        };

      case 'post.created':
        return {
          subject: `${actorName} posted something new`,
          html: `
            <h2>${actorName} posted something new</h2>
            ${data.postPreview ? `<p>${data.postPreview}</p>` : ''}
            <p><a href="${data.postUrl || '#'}">View post</a></p>
          `,
          text: `${actorName} posted: ${data.postPreview || ''}`,
        };

      default:
        return {
          subject: 'New notification',
          html: `<h2>You have a new notification</h2><p>Type: ${type}</p>`,
          text: `You have a new notification: ${type}`,
        };
    }
  }

  /**
   * Send welcome email (for new users)
   */
  async sendWelcomeEmail(to: string, username: string): Promise<boolean> {
    // TODO: Use test email for now (hardcode for testing)
    const recipientEmail = 'samuelmomoh61@gmail.com';
    
    const result = await this.emailProvider.sendEmail({
      to: recipientEmail,
      subject: 'Welcome to the platform!',
      html: `
        <h1>Welcome, ${username}!</h1>
        <p>Thanks for joining our platform. We're excited to have you!</p>
        <p>Get started by updating your profile and connecting with others.</p>
        <p><strong>Original recipient:</strong> ${to}</p>
      `,
      text: `Welcome, ${username}! Thanks for joining our platform. (Original recipient: ${to})`,
    });

    if (result.success) {
      this.logger.log(`Welcome email sent to ${to}`);
      return true;
    } else {
      this.logger.error(`Failed to send welcome email to ${to}: ${result.error}`);
      return false;
    }
  }
}

