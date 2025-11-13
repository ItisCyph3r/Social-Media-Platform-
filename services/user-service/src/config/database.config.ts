import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { UserProfile } from '../entities/user-profile.entity';
import { Follow } from '../entities/follow.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:9730/smp_db';
  
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'user',
    entities: [UserProfile, Follow],
    synchronize: configService.get<string>('NODE_ENV') !== 'production',
    logging: false, // Disable SQL query logging
  };
};

