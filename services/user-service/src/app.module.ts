import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { UserProfile } from './entities/user-profile.entity';
import { Follow } from './entities/follow.entity';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { UserEventsConsumer } from './events/user-events.consumer';

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
    TypeOrmModule.forFeature([UserProfile, Follow]),
  ],
  controllers: [UserController],
  providers: [UserService, UserEventsConsumer],
})
export class AppModule {}
