import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');

  if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database Config] Connecting to: ${safeUrl}`);
  } else {
    console.error('[Database Config] DATABASE_URL is not set!');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    entities: [Notification, NotificationPreference],
    synchronize: configService.get<string>('NODE_ENV') !== 'production',
    logging: false, // Disable SQL query logging
  };
};

