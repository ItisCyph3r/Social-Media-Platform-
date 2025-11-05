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

@Entity('shared_posts')
@Index(['postId', 'messageId'])
export class SharedPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'uuid' })
  postId: string; // Post ID from Post Service

  @Column({ type: 'uuid' })
  sharedByUserId: string; // User who shared the post

  @OneToOne(() => Message, (message) => message.sharedPost, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @CreateDateColumn()
  createdAt: Date;
}




