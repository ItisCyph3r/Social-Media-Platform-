import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('notifications')
@Index(['userId', 'read'])
@Index(['userId', 'createdAt'])
@Index(['type', 'relatedId'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string; // Who receives the notification

  @Column({ type: 'varchar' })
  type: string; // e.g., 'post.liked', 'post.commented', 'post.created', 'user.created'

  @Column({ type: 'uuid', nullable: true })
  relatedId: string; // e.g., postId, commentId

  @Column({ type: 'uuid', nullable: true })
  actorId: string; // User who performed the action (who liked, who commented)

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional data (post preview, user name, etc.)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}




