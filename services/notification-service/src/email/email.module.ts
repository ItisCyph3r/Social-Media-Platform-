import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { IEmailProvider } from './interfaces/email-provider.interface';

/**
 * Email Module
 * Configure your email provider here
 * 
 * To swap providers:
 * 1. Create a new provider class implementing IEmailProvider
 *    Example: src/email/providers/aws-ses-email.provider.ts
 * 2. Add the case in the useFactory below
 * 3. Set EMAIL_PROVIDER=aws-ses in .env
 * 4. Update environment variables for the new provider
 */
@Module({
  imports: [ConfigModule],
  providers: [
    EmailService,
    {
      provide: 'IEmailProvider',
      useFactory: (configService: ConfigService) => {
        // Get provider type from config (default: 'resend')
        const providerType = configService.get<string>('EMAIL_PROVIDER') || 'resend';
        
        switch (providerType.toLowerCase()) {
          case 'resend':
            return new ResendEmailProvider(configService);
          // Add more providers here:
          // case 'aws-ses':
          //   return new AwsSesEmailProvider(configService);
          // case 'sendgrid':
          //   return new SendGridEmailProvider(configService);
          // case 'mailgun':
          //   return new MailgunEmailProvider(configService);
          default:
            console.warn(`[EmailModule] Unknown provider type: ${providerType}, using Resend`);
            return new ResendEmailProvider(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [EmailService],
})
export class EmailModule {}

