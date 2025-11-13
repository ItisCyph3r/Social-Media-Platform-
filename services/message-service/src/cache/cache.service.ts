import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisClient } from '../config/redis.config';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string; // Key prefix for namespacing
}

/**
 * Shared CacheService for all NestJS services
 * Provides Redis caching with connection pooling, error handling, and common operations
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;
  private defaultPrefix: string;

  constructor(private configService: ConfigService) {
    this.defaultPrefix = configService.get<string>('CACHE_PREFIX') || 'app';
    this.redis = createRedisClient(configService);

    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });

    this.redis.on('error', (error) => {
      this.logger.error('Redis error:', error);
    });

    this.redis.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      this.logger.log('Redis reconnecting...');
    });
  }

  async onModuleInit() {
    try {
      await this.redis.ping();
      this.logger.log('Redis cache service initialized');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
    this.logger.log('Redis cache service disconnected');
  }

  /**
   * Build cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const keyPrefix = prefix || this.defaultPrefix;
    return `${keyPrefix}:${key}`;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, prefix?: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, prefix);
      const value = await this.redis.get(fullKey);
      
      if (!value) return null;
      
      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      this.logger.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(
    key: string,
    value: any,
    options?: CacheOptions,
  ): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (options?.ttl) {
        await this.redis.setex(fullKey, options.ttl, serialized);
      } else {
        await this.redis.set(fullKey, serialized);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, prefix);
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.logger.error(`Failed to delete cache key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async deletePattern(pattern: string, prefix?: string): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, prefix);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) return 0;
      
      // Use pipeline for better performance
      const pipeline = this.redis.pipeline();
      keys.forEach((key) => pipeline.del(key));
      await pipeline.exec();
      
      return keys.length;
    } catch (error) {
      this.logger.error(`Failed to delete pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, prefix);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to check existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, ttl: number, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, prefix);
      const result = await this.redis.expire(fullKey, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(`Failed to set expiration on key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment numeric value
   */
  async increment(key: string, prefix?: string, by: number = 1): Promise<number> {
    try {
      const fullKey = this.buildKey(key, prefix);
      if (by === 1) {
        return await this.redis.incr(fullKey);
      }
      return await this.redis.incrby(fullKey, by);
    } catch (error) {
      this.logger.error(`Failed to increment key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement numeric value
   */
  async decrement(key: string, prefix?: string, by: number = 1): Promise<number> {
    try {
      const fullKey = this.buildKey(key, prefix);
      if (by === 1) {
        return await this.redis.decr(fullKey);
      }
      return await this.redis.decrby(fullKey, by);
    } catch (error) {
      this.logger.error(`Failed to decrement key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[], prefix?: string): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map((key) => this.buildKey(key, prefix));
      const values = await this.redis.mget(...fullKeys);
      
      return values.map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      });
    } catch (error) {
      this.logger.error(`Failed to mget keys:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once
   */
  async mset(
    data: Record<string, any>,
    options?: CacheOptions,
  ): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      
      Object.entries(data).forEach(([key, value]) => {
        const fullKey = this.buildKey(key, options?.prefix);
        const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        if (options?.ttl) {
          pipeline.setex(fullKey, options.ttl, serializedValue);
        } else {
          pipeline.set(fullKey, serializedValue);
        }
      });
      
      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.error(`Failed to mset keys:`, error);
      return false;
    }
  }

  /**
   * Get or set pattern (cache-aside)
   * This is the recommended pattern for caching
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key, options?.prefix);
    
    if (cached !== null) {
      return cached;
    }
    
    const value = await fetchFn();
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string, prefix?: string): Promise<number> {
    return this.deletePattern(pattern, prefix);
  }

  /**
   * Get Redis client (for advanced operations)
   */
  getClient(): Redis {
    return this.redis;
  }
}



