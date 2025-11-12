import { Module } from '@nestjs/common';
import { FileProcessingService } from './file-processing/file-processing.service';
import { StorageService } from './storage/storage.service';
import { ValidationModule } from '../validation/validation.module';
import { DeduplicationModule } from '../deduplication/deduplication.module';
import { IStorageAdapter } from './adapters/storage-adapter.interface';
import { CloudinaryStorageAdapter } from './adapters/cloudinary-storage.adapter';

@Module({
  imports: [ValidationModule, DeduplicationModule],
  providers: [
    FileProcessingService,
    StorageService,
    {
      provide: 'IStorageAdapter',
      useClass: CloudinaryStorageAdapter,
    },
  ],
  exports: [FileProcessingService, StorageService],
})
export class StorageModule {}
