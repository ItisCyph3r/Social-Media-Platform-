import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Notification } from '../entities/notification.entity';
import { NotificationPreference } from '../entities/notification-preference.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:9730/smp_db';

  if (databaseUrl) {
    const safeUrl = databaseUrl.replace(/:[^:@]+@/, ':****@');
    console.log(`[Database Config] Connecting to: ${safeUrl}`);
  } else {
    console.error('[Database Config] DATABASE_URL is not set!');
  }

  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'notification',
    entities: [Notification, NotificationPreference],
    synchronize: configService.get<string>('NODE_ENV') !== 'production',
    logging: false, // Disable SQL query logging
  };
};

