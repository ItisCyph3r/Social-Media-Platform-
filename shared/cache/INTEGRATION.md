# Caching Infrastructure Integration Guide

This guide explains how to integrate the robust, scalable caching infrastructure into any NestJS service.

## Architecture

The caching system consists of:
1. **CacheService**: Core Redis wrapper with connection management, error handling, and common operations
2. **Service-specific Cache Services**: Domain-specific caching (e.g., `PostCacheService`, `UserCacheService`)
3. **CacheModule**: Global module that provides `CacheService` to all services

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

## Integration Steps

### 1. Install Dependencies

```bash
npm install ioredis @nestjs/config
```

### 2. Copy Cache Module Files

Copy these files to your service:
- `src/config/redis.config.ts`
- `src/cache/cache.service.ts`
- `src/cache/cache.module.ts`

### 3. Configure Environment Variables

Add to your service's `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Optional
REDIS_URL=  # Optional, alternative to HOST/PORT
CACHE_PREFIX=your-service-name  # Optional, defaults to 'app'
```

### 4. Import CacheModule

In your service's `app.module.ts`:

```typescript
import { CacheModule } from './cache/cache.module';

@Module({
  imports: [
    // ... other imports
    CacheModule,  // Global module, available everywhere
  ],
  // ...
})
export class AppModule {}
```

### 5. Create Service-Specific Cache Service (Optional)

For domain-specific caching, create a service like `PostCacheService`:

```typescript
import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class YourCacheService {
  private readonly CACHE_PREFIX = 'your-service';
  private readonly DEFAULT_TTL = {
    ENTITY_COUNT: 300,  // 5 minutes
    ENTITY_PAGE: 120,   // 2 minutes
  };

  constructor(private cacheService: CacheService) {}

  async getEntityCount(entityId: string): Promise<number | null> {
    return this.cacheService.get<number>(
      `entity:count:${entityId}`,
      this.CACHE_PREFIX,
    );
  }

  async setEntityCount(entityId: string, count: number): Promise<boolean> {
    return this.cacheService.set(
      `entity:count:${entityId}`,
      count,
      {
        ttl: this.DEFAULT_TTL.ENTITY_COUNT,
        prefix: this.CACHE_PREFIX,
      },
    );
  }

  async incrementEntityCount(entityId: string): Promise<number> {
    const key = `entity:count:${entityId}`;
    const count = await this.cacheService.increment(key, this.CACHE_PREFIX);
    
    // Set TTL if key was just created
    const exists = await this.cacheService.exists(key, this.CACHE_PREFIX);
    if (!exists) {
      await this.cacheService.expire(key, this.DEFAULT_TTL.ENTITY_COUNT, this.CACHE_PREFIX);
    }
    
    return count;
  }

  async invalidateEntity(entityId: string): Promise<void> {
    await this.cacheService.deletePattern(
      `entity:*:${entityId}`,
      this.CACHE_PREFIX,
    );
  }
}
```

### 6. Use in Your Service

Inject and use in your domain services:

```typescript
import { Injectable } from '@nestjs/common';
import { YourCacheService } from './cache/your-cache.service';

@Injectable()
export class YourService {
  constructor(
    // ... other dependencies
    private cacheService: YourCacheService,
  ) {}

  async getEntity(entityId: string) {
    // Cache-aside pattern
    return this.cacheService.getOrSet(
      `entity:${entityId}`,
      async () => {
        // Fetch from database
        return await this.repository.findOne({ where: { id: entityId } });
      },
      {
        ttl: 600,  // 10 minutes
        prefix: 'your-service',
      },
    );
  }

  async createEntity(data: CreateEntityDto) {
    const entity = await this.repository.save(data);
    
    // Invalidate related caches
    await this.cacheService.invalidateEntity(entity.id);
    
    return entity;
  }
}
```

## Best Practices

### 1. TTL Strategy

- **Counts**: 5 minutes (frequently updated)
- **Pages/Lists**: 2 minutes (user-generated content)
- **Details**: 10 minutes (relatively stable)
- **User Profiles**: 10 minutes (changes infrequently)

### 2. Cache Invalidation

Always invalidate related caches on writes:
- On create: Invalidate list/feed caches
- On update: Invalidate detail and list caches
- On delete: Invalidate all related caches

### 3. Key Naming Convention

Use consistent patterns:
```
{prefix}:{type}:{id}
{prefix}:{type}:{id}:{subtype}
{prefix}:{type}:{filter}:{page}
```

Examples:
- `post:comment:count:123`
- `post:comment:page:123:1:20`
- `user:profile:abc-123`

### 4. Error Handling

The `CacheService` handles errors gracefully:
- Returns `null` on cache miss (not an error)
- Logs errors but doesn't throw (fails gracefully)
- Falls back to database on cache errors

### 5. Batch Operations

Use batch operations for multiple keys:
```typescript
// Get multiple
const counts = await cacheService.mget<number>(
  ['post:1', 'post:2', 'post:3'],
  'post',
);

// Set multiple
await cacheService.mset(
  {
    'post:1': 10,
    'post:2': 20,
    'post:3': 30,
  },
  { ttl: 300, prefix: 'post' },
);
```

## Performance Considerations

1. **Connection Pooling**: Redis client handles connection pooling automatically
2. **Pipeline Operations**: Use `mget`/`mset` for multiple operations
3. **Pattern Matching**: Use `deletePattern` sparingly (it scans keys)
4. **TTL Management**: Set appropriate TTLs to balance freshness and performance

## Monitoring

Monitor these metrics:
- Cache hit rate
- Redis connection status
- Cache operation latency
- Memory usage

## Scaling

For production:
- Use Redis Cluster for high availability
- Configure read replicas for read-heavy workloads
- Use Redis Sentinel for automatic failover
- Monitor memory usage and set eviction policies

