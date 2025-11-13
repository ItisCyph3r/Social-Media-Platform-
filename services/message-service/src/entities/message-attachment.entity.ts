import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Message } from './message.entity';

@Entity({ name: 'message_attachments', schema: 'message' })
@Index(['messageId'])
@Index(['fileHash']) 
@Index(['createdAt']) 
@Index(['referenceCount']) 
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'varchar', length: 20 }) // 'image', 'video', 'document', 'audio'
  fileType: string;

  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'bigint' })
  fileSize: number; // in bytes

  @Column({ type: 'varchar', length: 64, unique: true })
  fileHash: string; // SHA-256 for deduplication

  @Column({ type: 'varchar', length: 500 })
  objectName: string; 

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnailObjectName: string | null; // For images/videos

  @Column({ type: 'int', default: 1 })
  referenceCount: number; // How many messages reference this file

  @OneToOne(() => Message, (message) => message.attachment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @CreateDateColumn()
  createdAt: Date;
}

