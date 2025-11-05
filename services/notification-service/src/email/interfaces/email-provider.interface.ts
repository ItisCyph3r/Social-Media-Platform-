export interface EmailSendOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Email Provider Interface
 * Implement this interface to add support for different email providers
 * (Resend, AWS SES, SendGrid, Mailgun, etc.)
 */
export interface IEmailProvider {
  /**
   * Send an email
   */
  sendEmail(options: EmailSendOptions): Promise<EmailSendResult>;

  /**
   * Send a bulk email (optional - for batch sending)
   */
  sendBulkEmail?(options: EmailSendOptions[]): Promise<EmailSendResult[]>;
}




