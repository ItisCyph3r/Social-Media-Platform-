# Shared Caching Infrastructure

This directory contains reusable caching patterns and utilities that can be integrated into any NestJS service.

## Files

- `cache.service.ts` - Core Redis wrapper with connection management
- `cache.module.ts` - Global NestJS module for dependency injection
- `redis.config.ts` - Redis client factory function

## Usage

1. Copy the cache module files to your service's `src/cache/` directory
2. Install dependencies: `npm install ioredis @nestjs/config`
3. Configure Redis connection in your service's `.env`
4. Import `CacheModule` in your service's `app.module.ts`
5. Inject `CacheService` in your services

## Features

- ✅ Connection pooling and automatic reconnection
- ✅ TTL support for automatic expiration
- ✅ Batch operations (mget, mset)
- ✅ Pattern-based invalidation
- ✅ Key prefix management for namespacing
- ✅ Type-safe operations
- ✅ Cache-aside pattern support
- ✅ Increment/decrement for counters
- ✅ Error handling and logging

## Example: User Profile Caching

```typescript
// user-cache.service.ts
@Injectable()
export class UserCacheService {
  constructor(private cacheService: CacheService) {}

  async getOrSetProfile(userId: string, fetchFn: () => Promise<UserProfile>) {
    return this.cacheService.getOrSet(
      `profile:${userId}`,
      fetchFn,
      { ttl: 600, prefix: 'user' } 
    );
  }
}
```

See `INTEGRATION.md` for detailed integration guide.

