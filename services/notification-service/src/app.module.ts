import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { Notification } from './entities/notification.entity';
import { NotificationPreference } from './entities/notification-preference.entity';
import { NotificationController } from './notification/notification.controller';
import { NotificationService } from './notification/notification.service';
import { EventsConsumer } from './events/events.consumer';
import { NotificationGateway } from './gateways/notification.gateway';
import { EmailModule } from './email/email.module';
import { AuthClientService } from './clients/auth-client.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => databaseConfig(configService),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Notification, NotificationPreference]),
    EmailModule,
  ],
  controllers: [NotificationController],
  providers: [NotificationService, EventsConsumer, NotificationGateway, AuthClientService],
})
export class AppModule {}
