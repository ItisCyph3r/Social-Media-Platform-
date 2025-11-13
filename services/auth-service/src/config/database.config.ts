import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';

export const databaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL') || 'postgresql://postgres:postgres@localhost:9730/smp_db';
  
  return {
    type: 'postgres',
    url: databaseUrl,
    schema: 'auth',
    entities: [User],
    synchronize: configService.get<string>('NODE_ENV') !== 'production', 
    // logging: configService.get<string>('NODE_ENV') === 'development',
    logging: false, 
  };
};

