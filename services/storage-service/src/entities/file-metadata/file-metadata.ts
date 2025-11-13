import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity({ name: 'file_metadata', schema: 'storage' })
@Index(['fileHash'])
@Index(['serviceContexts'])
@Index(['createdAt'])
@Index(['referenceCount'])
export class FileMetadata {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  fileHash: string; 

  @Column({ type: 'varchar', length: 500 })
  objectName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailObjectName: string | null;

  @Column({ type: 'varchar', length: 20 })
  fileType: string; // 'image', 'video', 'document', 'audio'

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint' })
  fileSize: number; // in bytes

  @Column({ type: 'int', default: 1 })
  referenceCount: number;

  @Column({ type: 'jsonb', default: '[]' })
  serviceContexts: string[]; // Track which services reference this file: ['posts', 'messages']

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
