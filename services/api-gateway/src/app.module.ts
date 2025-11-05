import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';

// Clients
import { AuthClientService } from './clients/auth-client.service';
import { UserClientService } from './clients/user-client.service';
import { PostClientService } from './clients/post-client.service';
import { MessageClientService } from './clients/message-client.service';
import { NotificationClientService } from './clients/notification-client.service';

// Auth
import { JwtStrategy } from './auth/jwt.strategy';
import { JwtAuthGuard } from './auth/jwt-auth.guard';

// Controllers
import { AuthController } from './auth/auth.controller';
import { UsersController } from './users/users.controller';
import { PostsController } from './posts/posts.controller';
import { MessagesController } from './messages/messages.controller';
import { NotificationsController } from './notifications/notifications.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      // Secret will be used by Auth Service for validation
      // Gateway validates via Auth Service, so this is just for Passport
      secret: process.env.JWT_SECRET || 'placeholder',
    }),
  ],
  controllers: [
    AuthController,
    UsersController,
    PostsController,
    MessagesController,
    NotificationsController,
  ],
  providers: [
    // Clients
    AuthClientService,
    UserClientService,
    PostClientService,
    MessageClientService,
    NotificationClientService,
    // Auth
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
