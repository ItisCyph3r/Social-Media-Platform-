import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Creates a Redis client with proper configuration
 * Can be used by any NestJS service
 */
export function createRedisClient(configService: ConfigService): Redis {
  const redisUrl = configService.get<string>('REDIS_URL');
  const redisHost = configService.get<string>('REDIS_HOST') || 'localhost';
  const redisPort = configService.get<number>('REDIS_PORT') || 6379;
  const redisPassword = configService.get<string>('REDIS_PASSWORD');

  const options: any = {
    host: redisHost,
    port: redisPort,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    lazyConnect: false,
  };

  if (redisPassword) {
    options.password = redisPassword;
  }

  if (redisUrl) {
    return new Redis(redisUrl, options);
  }

  return new Redis(options);
}



