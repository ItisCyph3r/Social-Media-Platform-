# Shared Caching Infrastructure

This directory contains reusable caching patterns and utilities that can be integrated into any NestJS service.

## Usage

1. Copy the cache module files to your service
2. Install dependencies: `npm install ioredis @nestjs/config`
3. Configure Redis connection in your service's `.env`
4. Import `CacheModule` in your service's `app.module.ts`
5. Inject `CacheService` in your services

## Features

- Connection pooling
- Automatic reconnection
- TTL support
- Batch operations
- Cache invalidation patterns
- Key prefix management
- Type-safe operations

