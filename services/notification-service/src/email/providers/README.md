# Email Providers

This directory contains email provider implementations. All providers implement the `IEmailProvider` interface.

## Current Providers

- **ResendEmailProvider** - Uses Resend API for email sending

## Adding a New Provider

To add a new email provider (e.g., AWS SES):

1. **Create the provider class:**
   ```typescript
   // src/email/providers/aws-ses-email.provider.ts
   import { Injectable } from '@nestjs/common';
   import { ConfigService } from '@nestjs/config';
   import { IEmailProvider, EmailSendOptions, EmailSendResult } from '../interfaces/email-provider.interface';
   // Import AWS SDK for SES

   @Injectable()
   export class AwsSesEmailProvider implements IEmailProvider {
     constructor(private configService: ConfigService) {
       // Initialize AWS SES client
     }

     async sendEmail(options: EmailSendOptions): Promise<EmailSendResult> {
       // Implement AWS SES sending logic
     }
   }
   ```

2. **Update EmailModule:**
   - Add the case in `email.module.ts`:
   ```typescript
   case 'aws-ses':
     return new AwsSesEmailProvider(configService);
   ```

3. **Update .env:**
   ```env
   EMAIL_PROVIDER=aws-ses
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   ```

4. **Install dependencies:**
   ```bash
   npm install @aws-sdk/client-ses
   ```

## Provider Interface

All providers must implement:

```typescript
interface IEmailProvider {
  sendEmail(options: EmailSendOptions): Promise<EmailSendResult>;
  sendBulkEmail?(options: EmailSendOptions[]): Promise<EmailSendResult[]>;
}
```




