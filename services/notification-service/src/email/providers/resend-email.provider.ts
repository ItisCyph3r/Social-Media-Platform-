import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { IEmailProvider, EmailSendOptions, EmailSendResult } from '../interfaces/email-provider.interface';

@Injectable()
export class ResendEmailProvider implements IEmailProvider {
  private resend: Resend;
  private fromEmail: string;
  private fromName?: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      console.warn('[ResendEmailProvider] RESEND_API_KEY not set, email sending disabled');
      return;
    }

    this.resend = new Resend(apiKey);
    this.fromEmail = this.configService.get<string>('EMAIL_FROM') || 'noreply@example.com';
    this.fromName = this.configService.get<string>('EMAIL_FROM_NAME');
  }

  async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
    try {
      if (!this.resend) {
        return {
          success: false,
          error: 'Resend not initialized - check RESEND_API_KEY',
        };
      }

      const from = options.from || (this.fromName ? `${this.fromName} <${this.fromEmail}>` : this.fromEmail);

      const emailData: Record<string, any> = {
        from,
        to: options.to,
        subject: options.subject,
      };

      if (options.html) {
        emailData.html = options.html;
      }

      if (options.text) {
        emailData.text = options.text;
      }

      if (options.replyTo) {
        emailData.replyTo = options.replyTo;
      }

      const result = await this.resend.emails.send(emailData as any);

      if (result.error) {
        return {
          success: false,
          error: result.error.message || 'Failed to send email',
        };
      }

      return {
        success: true,
        messageId: result.data?.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending email',
      };
    }
  }

  async sendBulkEmail(options: EmailSendOptions[]): Promise<EmailSendResult[]> {
    // Resend supports batch sending via their API
    // Todo: For now, send sequentially (can be optimized later)
    const results: EmailSendResult[] = [];
    
    for (const emailOptions of options) {
      const result = await this.sendEmail(emailOptions);
      results.push(result);
    }

    return results;
  }
}

