import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * Global CacheModule that can be imported by any NestJS service
 * Provides CacheService with Redis connection management
 * 
 * Usage:
 * 1. Copy this file and cache.service.ts to your service
 * 2. Import CacheModule in your app.module.ts
 * 3. Inject CacheService in your services
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}



