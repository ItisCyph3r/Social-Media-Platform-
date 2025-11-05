import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  Unique,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum ParticipantRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
@Index(['userId', 'joinedAt'])
@Index(['conversationId'])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    enum: ParticipantRole,
    default: ParticipantRole.MEMBER,
  })
  role: ParticipantRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean; // false if user left the group

  @ManyToOne(() => Conversation, (conversation) => conversation.participants, {
    onDelete: 'CASCADE',
  })
  conversation: Conversation;

  @CreateDateColumn()
  joinedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

