import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileMetadata } from '../entities/file-metadata/file-metadata';
import { DeduplicationService } from './deduplication/deduplication.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileMetadata])],
  providers: [DeduplicationService],
  exports: [DeduplicationService],
})
export class DeduplicationModule {}
