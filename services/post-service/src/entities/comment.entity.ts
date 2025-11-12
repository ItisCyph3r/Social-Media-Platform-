import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Post } from './post.entity';

@Entity('comments')
@Index(['postId', 'parentCommentId', 'createdAt']) 
@Index(['parentCommentId']) 
@Index(['userId'])
@Index(['postId'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  postId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  parentCommentId: string | null; 

  @Column({ type: 'text' })
  content: string;

  @Column('text', { array: true, default: [] })
  mentions: string[]; 

  @Column({ type: 'int', default: 0 })
  replyCount: number; 

  @Column({ type: 'boolean', default: false })
  isDeleted: boolean;

  @ManyToOne(() => Post, (post) => post.comments, { onDelete: 'CASCADE' })
  post: Post;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

