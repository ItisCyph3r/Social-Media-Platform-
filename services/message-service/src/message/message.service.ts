import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Conversation, ConversationType } from '../entities/conversation.entity';
import { ConversationParticipant, ParticipantRole } from '../entities/conversation-participant.entity';
import { Message } from '../entities/message.entity';
import { SharedPost } from '../entities/shared-post.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { MessageGateway } from '../gateways/message.gateway';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private participantRepository: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(SharedPost)
    private sharedPostRepository: Repository<SharedPost>,
    private eventPublisher: EventPublisherService,
    @Inject(forwardRef(() => MessageGateway))
    private messageGateway: MessageGateway,
  ) {}

  /**
   * Create a new conversation (direct or group)
   */
  async createConversation(
    creatorId: string,
    type: ConversationType,
    participantIds: string[],
    name?: string,
  ): Promise<Conversation> {
    // Ensure creator is in participants
    const allParticipants = [creatorId, ...participantIds.filter((id) => id !== creatorId)];
    const uniqueParticipants = [...new Set(allParticipants)];

    if (type === ConversationType.DIRECT) {
      if (uniqueParticipants.length !== 2) {
        throw new BadRequestException('Direct conversation must have exactly 2 participants');
      }

      // Check if direct conversation already exists
      const existingConversation = await this.findDirectConversation(
        uniqueParticipants[0],
        uniqueParticipants[1],
      );
      if (existingConversation) {
        return existingConversation;
      }
    } else if (type === ConversationType.GROUP) {
      if (!name || name.trim().length === 0) {
        throw new BadRequestException('Group conversation must have a name');
      }
      if (uniqueParticipants.length < 2) {
        throw new BadRequestException('Group conversation must have at least 2 participants');
      }
    }

    // Create conversation
    const conversation = this.conversationRepository.create({
      type,
      name: type === ConversationType.GROUP ? name : null,
    });
    const savedConversation = await this.conversationRepository.save(conversation);

    // Add participants
    const participants: ConversationParticipant[] = [];
    for (let i = 0; i < uniqueParticipants.length; i++) {
      const participant = this.participantRepository.create({
        conversationId: savedConversation.id,
        userId: uniqueParticipants[i],
        role: i === 0 || (type === ConversationType.GROUP && uniqueParticipants[i] === creatorId)
          ? ParticipantRole.ADMIN
          : ParticipantRole.MEMBER,
      });
      participants.push(participant);
    }

    await this.participantRepository.save(participants);

    // Load with participants
    return await this.conversationRepository.findOne({
      where: { id: savedConversation.id },
      relations: ['participants'],
    }) as Conversation;
  }

  /**
   * Find existing direct conversation between two users
   */
  private async findDirectConversation(userId1: string, userId2: string): Promise<Conversation | null> {
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .innerJoin('conversation.participants', 'p1', 'p1.userId = :userId1', { userId1 })
      .innerJoin('conversation.participants', 'p2', 'p2.userId = :userId2', { userId2 })
      .where('conversation.type = :type', { type: ConversationType.DIRECT })
      .andWhere('p1.isActive = true')
      .andWhere('p2.isActive = true')
      .groupBy('conversation.id')
      .having('COUNT(DISTINCT p1.userId) = 2')
      .getOne();

    return conversation;
  }

  /**
   * Get all conversations for a user
   */
  async getConversations(userId: string, page: number = 1, limit: number = 20): Promise<{
    conversations: Conversation[];
    total: number;
    page: number;
  }> {
    const skip = (page - 1) * limit;

    // Get conversations where user is a participant
    const [conversations, total] = await this.conversationRepository.findAndCount({
      where: {
        participants: {
          userId,
          isActive: true,
        },
      },
      relations: ['participants', 'messages'],
      order: { updatedAt: 'DESC' },
      skip,
      take: limit,
    });

    // Load last message for each conversation
    for (const conversation of conversations) {
      const lastMessage = await this.messageRepository.findOne({
        where: { conversationId: conversation.id },
        order: { createdAt: 'DESC' },
        relations: ['sharedPost'],
      });

      if (lastMessage) {
        conversation.messages = [lastMessage];
      }
    }

    return {
      conversations,
      total,
      page,
    };
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: {
        id: conversationId,
        participants: {
          userId,
          isActive: true,
        },
      },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found or user is not a participant');
    }

    return conversation;
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
  ): Promise<Message> {
    // Verify sender is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId: senderId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    // Create message
    const message = this.messageRepository.create({
      conversationId,
      senderId,
      content,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation's updatedAt
    await this.conversationRepository.update(conversationId, { updatedAt: new Date() });

    // Send real-time message via WebSocket
    await this.messageGateway.sendMessageToConversation(
      conversationId,
      {
        id: savedMessage.id,
        conversation_id: savedMessage.conversationId,
        sender_id: savedMessage.senderId,
        content: savedMessage.content,
        reply_to: null,
        shared_post: null,
        created_at: savedMessage.createdAt.toISOString(),
      },
      senderId,
    );

    // Publish message.received event for all other participants
    const participants = await this.participantRepository.find({
      where: {
        conversationId,
        userId: Not(senderId),
        isActive: true,
      },
    });

    for (const participant of participants) {
      await this.eventPublisher.publishMessageReceived(
        savedMessage.id,
        conversationId,
        senderId,
        participant.userId,
      );
    }

    return savedMessage;
  }

  /**
   * Reply to a message
   */
  async replyToMessage(
    conversationId: string,
    senderId: string,
    content: string,
    replyToMessageId: string,
  ): Promise<Message> {
    // Verify sender is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId: senderId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    // Verify reply-to message exists and is in same conversation
    const replyToMessage = await this.messageRepository.findOne({
      where: {
        id: replyToMessageId,
        conversationId,
      },
    });

    if (!replyToMessage) {
      throw new NotFoundException('Message to reply to not found');
    }

    // Create reply message
    const message = this.messageRepository.create({
      conversationId,
      senderId,
      content,
      replyToMessageId,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation's updatedAt
    await this.conversationRepository.update(conversationId, { updatedAt: new Date() });

    // Reload message with reply-to relation
    const messageWithReply = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['replyToMessage', 'sharedPost'],
    }) as Message;

    // Send real-time message via WebSocket
    await this.messageGateway.sendMessageToConversation(
      conversationId,
      {
        id: messageWithReply.id,
        conversation_id: messageWithReply.conversationId,
        sender_id: messageWithReply.senderId,
        content: messageWithReply.content,
        reply_to: messageWithReply.replyToMessage
          ? {
              id: messageWithReply.replyToMessage.id,
              conversation_id: messageWithReply.replyToMessage.conversationId,
              sender_id: messageWithReply.replyToMessage.senderId,
              content: messageWithReply.replyToMessage.content,
              reply_to: null,
              shared_post: null,
              created_at: messageWithReply.replyToMessage.createdAt.toISOString(),
            }
          : null,
        shared_post: null,
        created_at: messageWithReply.createdAt.toISOString(),
      },
      senderId,
    );

    // Publish message.received event for all other participants
    const participants = await this.participantRepository.find({
      where: {
        conversationId,
        userId: Not(senderId),
        isActive: true,
      },
    });

    for (const participant of participants) {
      await this.eventPublisher.publishMessageReceived(
        messageWithReply.id,
        conversationId,
        senderId,
        participant.userId,
      );
    }

    return messageWithReply;
  }

  /**
   * Share a post in a conversation
   */
  async sharePost(
    conversationId: string,
    senderId: string,
    postId: string,
    message?: string,
  ): Promise<Message> {
    // Verify sender is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId: senderId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    // Create message with shared post
    const messageEntity = this.messageRepository.create({
      conversationId,
      senderId,
      content: message || 'Shared a post',
    });

    const savedMessage = await this.messageRepository.save(messageEntity);

    // Create shared post record
    const sharedPost = this.sharedPostRepository.create({
      messageId: savedMessage.id,
      postId,
      sharedByUserId: senderId,
    });

    await this.sharedPostRepository.save(sharedPost);

    // Reload message with shared post
    const messageWithSharedPost = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['sharedPost'],
    }) as Message;

    // Update conversation's updatedAt
    await this.conversationRepository.update(conversationId, { updatedAt: new Date() });

    // Send real-time message via WebSocket
    await this.messageGateway.sendMessageToConversation(
      conversationId,
      {
        id: messageWithSharedPost.id,
        conversation_id: messageWithSharedPost.conversationId,
        sender_id: messageWithSharedPost.senderId,
        content: messageWithSharedPost.content,
        reply_to: null,
        shared_post: messageWithSharedPost.sharedPost
          ? {
              id: messageWithSharedPost.sharedPost.postId,
              user_id: messageWithSharedPost.sharedPost.sharedByUserId,
              content: '',
              media_urls: [],
            }
          : null,
        created_at: messageWithSharedPost.createdAt.toISOString(),
      },
      senderId,
    );

    // Publish message.received event for all other participants
    const participants = await this.participantRepository.find({
      where: {
        conversationId,
        userId: Not(senderId),
        isActive: true,
      },
    });

    for (const participant of participants) {
      await this.eventPublisher.publishMessageReceived(
        messageWithSharedPost.id,
        conversationId,
        senderId,
        participant.userId,
      );
    }

    return messageWithSharedPost;
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    messages: Message[];
    total: number;
    page: number;
  }> {
    // Verify user is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId },
      relations: ['sharedPost', 'replyToMessage'],
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      messages: messages.reverse(), // Reverse to show oldest first
      total,
      page,
    };
  }

  /**
   * Delete a message (soft delete - only admins can delete others' messages)
   */
  async deleteMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
    // Verify user is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    // Find the message
    const message = await this.messageRepository.findOne({
      where: {
        id: messageId,
        conversationId,
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user is the sender or an admin
    const isSender = message.senderId === userId;
    const isAdmin = participant.role === ParticipantRole.ADMIN;

    if (!isSender && !isAdmin) {
      throw new BadRequestException('Only message sender or admins can delete messages');
    }

    // Soft delete: set content to [deleted]
    message.content = '[deleted]';
    await this.messageRepository.save(message);
  }

  /**
   * Add participant to group conversation
   */
  async addParticipant(conversationId: string, userId: string, addedByUserId: string): Promise<void> {
    // Verify conversation exists and is a group
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Can only add participants to group conversations');
    }

    // Verify addedByUser is a participant and admin
    const addedBy = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId: addedByUserId,
        isActive: true,
      },
    });

    if (!addedBy) {
      throw new NotFoundException('User adding participant is not in this conversation');
    }

    // Only admins can add participants
    if (addedBy.role !== ParticipantRole.ADMIN) {
      throw new BadRequestException('Only admins can add participants');
    }

    // Check if user is already a participant
    const existing = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('User is already a participant');
      } else {
        // Re-activate user
        existing.isActive = true;
        await this.participantRepository.save(existing);
        return;
      }
    }

    // Add participant
    const participant = this.participantRepository.create({
      conversationId,
      userId,
      role: ParticipantRole.MEMBER,
      isActive: true,
    });

    await this.participantRepository.save(participant);
  }

  /**
   * Remove participant from group conversation
   */
  async removeParticipant(conversationId: string, userId: string, removedByUserId: string): Promise<void> {
    // Verify conversation exists and is a group
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Can only remove participants from group conversations');
    }

    // Verify removedByUser is a participant
    const removedBy = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId: removedByUserId,
        isActive: true,
      },
    });

    if (!removedBy) {
      throw new NotFoundException('User removing participant is not in this conversation');
    }

    // Find participant to remove
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
      },
    });

    if (!participant || !participant.isActive) {
      throw new NotFoundException('Participant not found or already removed');
    }

    // If removing self, just mark as inactive
    if (userId === removedByUserId) {
      participant.isActive = false;
      await this.participantRepository.save(participant);
      return;
    }

    // If removing another user, need admin role or be removing self
    if (removedBy.role !== ParticipantRole.ADMIN) {
      throw new BadRequestException('Only admins can remove other participants');
    }

    participant.isActive = false;
    await this.participantRepository.save(participant);
  }
}

