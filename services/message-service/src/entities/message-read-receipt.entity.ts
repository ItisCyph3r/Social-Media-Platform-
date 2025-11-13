import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Message } from './message.entity';

@Entity({ name: 'message_read_receipts', schema: 'message' })
@Unique(['messageId', 'userId']) 
@Index(['messageId', 'readAt'])
@Index(['userId', 'readAt'])
export class MessageReadReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'uuid' })
  userId: string; 

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  readAt: Date;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @CreateDateColumn()
  createdAt: Date;
}

