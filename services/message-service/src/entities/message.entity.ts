import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { SharedPost } from './shared-post.entity';
import { MessageAttachment } from './message-attachment.entity';

@Entity({ name: 'messages', schema: 'message' })
@Index(['conversationId', 'createdAt'])
@Index(['senderId', 'createdAt'])
@Index(['replyToMessageId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'uuid', nullable: true })
  replyToMessageId: string | null; 

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  conversation: Conversation;

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replyToMessageId' })
  replyToMessage: Message | null;

  @OneToOne(() => SharedPost, (sharedPost) => sharedPost.message, {
    nullable: true,
    cascade: true,
  })
  sharedPost: SharedPost | null;

  @OneToOne(() => MessageAttachment, (attachment) => attachment.message, {
    nullable: true,
    cascade: true,
  })
  attachment: MessageAttachment | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null; 
}




