import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseConfig } from './config/database.config';
import { FileMetadata } from './entities/file-metadata/file-metadata';
import { StorageModule } from './storage/storage.module';
import { ValidationModule } from './validation/validation.module';
import { DeduplicationModule } from './deduplication/deduplication.module';
import { StorageController } from './storage/storage.controller';

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
    TypeOrmModule.forFeature([FileMetadata]),
    StorageModule,
    ValidationModule,
    DeduplicationModule,
  ],
  controllers: [StorageController],
})
export class AppModule {}
