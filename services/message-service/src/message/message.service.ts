import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThan } from 'typeorm';
import { Conversation, ConversationType } from '../entities/conversation.entity';
import { ConversationParticipant, ParticipantRole } from '../entities/conversation-participant.entity';
import { Message } from '../entities/message.entity';
import { SharedPost } from '../entities/shared-post.entity';
import { MessageAttachment } from '../entities/message-attachment.entity';
import { MessageReadReceipt } from '../entities/message-read-receipt.entity';
import { EventPublisherService } from '../events/event-publisher.service';
import { MessageGateway } from '../gateways/message.gateway';
import { MessageAttachmentService } from '../attachments/message-attachment.service';
import { UserClientService } from '../clients/user-client.service';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class MessageService {
  private readonly logger = new Logger(MessageService.name);

  constructor(
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private participantRepository: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(SharedPost)
    private sharedPostRepository: Repository<SharedPost>,
    @InjectRepository(MessageAttachment)
    private attachmentRepository: Repository<MessageAttachment>,
    @InjectRepository(MessageReadReceipt)
    private readReceiptRepository: Repository<MessageReadReceipt>,
    private eventPublisher: EventPublisherService,
    @Inject(forwardRef(() => MessageGateway))
    private messageGateway: MessageGateway,
    private attachmentService: MessageAttachmentService,
    private userClient: UserClientService,
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
        isActive: true, 
      });
      participants.push(participant);
    }

    await this.participantRepository.save(participants);

    const loadedConversation = await this.conversationRepository.findOne({
      where: { id: savedConversation.id },
      relations: ['participants'],
    }) as Conversation;
    
    if (loadedConversation) {
      loadedConversation.participants = loadedConversation.participants.filter((p) => p.isActive);
    }
    
    return loadedConversation;
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

    for (const conversation of conversations) {
      conversation.participants = conversation.participants.filter((p) => p.isActive);
      
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
    const userParticipant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
        isActive: true,
      },
    });

    if (!userParticipant) {
      throw new NotFoundException('Conversation not found or user is not a participant');
    }

    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participants'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Filter to only active participants
    conversation.participants = conversation.participants.filter((p) => p.isActive);

    return conversation;
  }

  /**
   * Send a message to a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    attachmentFileHash?: string,
    attachmentObjectName?: string,
    attachmentFileName?: string,
    attachmentFileSize?: number,
    attachmentMimeType?: string,
    replyToMessageId?: string,
  ): Promise<Message> {
    // Parallelize participant check and reply message check for better performance
    const [participant, replyToMessage] = await Promise.all([
      this.participantRepository.findOne({
        where: {
          conversationId,
          userId: senderId,
          isActive: true,
        },
      }),
      replyToMessageId
        ? this.messageRepository.findOne({
            where: {
              id: replyToMessageId,
              conversationId,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    if (replyToMessageId && !replyToMessage) {
      throw new NotFoundException('Message to reply to not found');
    }

    // Create message
    const message = this.messageRepository.create({
      conversationId,
      senderId,
      content,
      replyToMessageId: replyToMessageId || null,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Handle attachment 
    if (attachmentObjectName) {
      try {
        // Use provided metadata or extract from objectName
        const objectNameParts = attachmentObjectName.split('/');
        const fileName = attachmentFileName || objectNameParts[objectNameParts.length - 1];
        const mimeType = attachmentMimeType || 'application/octet-stream';
        const fileSize = attachmentFileSize || 0;
        
        // Determine file type from mimeType first, then fallback to path
        let fileType = 'document';
        if (mimeType.startsWith('image/')) {
          fileType = 'image';
        } else if (mimeType.startsWith('video/')) {
          fileType = 'video';
        } else if (mimeType.startsWith('audio/')) {
          fileType = 'audio';
        } else {
          // Fallback: search path for file type
          const pathStr = attachmentObjectName.toLowerCase();
          if (pathStr.includes('/image/')) fileType = 'image';
          else if (pathStr.includes('/video/')) fileType = 'video';
          else if (pathStr.includes('/audio/')) fileType = 'audio';
        }
        
        // Use provided hash or generate a placeholder (for Cloudinary direct uploads, hash might be empty)
        const fileHash = attachmentFileHash || `cloudinary-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        // Find existing attachment by hash (if hash was provided and not a placeholder)
        let existingAttachment = attachmentFileHash && !attachmentFileHash.startsWith('cloudinary-')
          ? await this.attachmentService.findExistingFile(attachmentFileHash)
          : null;
        
        if (existingAttachment) {
          // Link existing attachment to this message
          await this.attachmentService.linkAttachmentToMessage(savedMessage.id, attachmentFileHash!);
        } else {
          // Create new attachment record
          await this.attachmentService.createAttachment(
            savedMessage.id,
            fileType,
            fileName,
            mimeType,
            fileSize,
            fileHash,
            attachmentObjectName,
            null, // No thumbnail for now
          );
        }
      } catch (error) {
        this.logger.error(`Error creating/linking attachment to message: ${error.message}`);
        // Don't fail message creation if attachment creation fails
      }
    }

    // Update conversation timestamp 
    this.conversationRepository.update(conversationId, { updatedAt: new Date() }).catch(
      (error) => this.logger.error(`Failed to update conversation timestamp: ${error.message}`),
    );

    // Enrich and broadcast message in background
    this.enrichAndBroadcastMessage(savedMessage, conversationId, senderId, replyToMessageId).catch(
      (error) => this.logger.error(`Failed to enrich and broadcast message: ${error.message}`),
    );

    return savedMessage;
  }

  /**
   * Enrich message with profiles and attachments, then broadcast via WebSocket
   * This runs in the background to avoid blocking the main sendMessage response
   */
  private async enrichAndBroadcastMessage(
    savedMessage: Message,
    conversationId: string,
    senderId: string,
    replyToMessageId?: string,
  ): Promise<void> {
    try {
      // Load attachment and reply if exists for WebSocket broadcast
      const messageWithAttachment = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['attachment', 'replyToMessage', 'replyToMessage.attachment'],
      });

      // Parallelize all enrichment operations
      const [senderProfile, attachmentData, replyToData] = await Promise.all([
        this.userClient.getProfile(senderId),
        this.getAttachmentData(messageWithAttachment?.attachment),
        messageWithAttachment?.replyToMessage
          ? this.getReplyToData(messageWithAttachment.replyToMessage)
          : Promise.resolve(null),
      ]);

      const senderData = senderProfile
        ? { username: senderProfile.username, profile_picture: senderProfile.profilePicture }
        : { username: 'Unknown', profile_picture: '' };

      // Send real-time message via WebSocket
      await this.messageGateway.sendMessageToConversation(
        conversationId,
        {
          id: savedMessage.id,
          conversation_id: savedMessage.conversationId,
          sender_id: savedMessage.senderId,
          content: savedMessage.content,
          reply_to: replyToData,
          shared_post: null,
          attachment: attachmentData,
          sender: senderData,
          created_at: savedMessage.createdAt.toISOString(),
        },
        senderId,
      );

      // Publish message.received event for all other participants 
      this.publishNotifications(savedMessage, conversationId, senderId).catch(
        (error) => this.logger.error(`Failed to publish notifications: ${error.message}`),
      );
    } catch (error) {
      this.logger.error(`Error enriching and broadcasting message: ${error.message}`);
    }
  }

  /**
   * Get attachment data with URLs
   */
  private async getAttachmentData(attachment: any): Promise<any> {
    if (!attachment) return null;

    const [accessUrl, thumbnailAccessUrl] = await Promise.all([
      this.attachmentService.getFileAccessUrl(attachment.objectName),
      attachment.thumbnailObjectName
        ? this.attachmentService.getFileAccessUrl(attachment.thumbnailObjectName)
        : Promise.resolve(null),
    ]);

    return {
      id: attachment.id,
      file_type: attachment.fileType,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      file_size: attachment.fileSize.toString(),
      access_url: accessUrl,
      thumbnail_access_url: thumbnailAccessUrl,
    };
  }

  /**
   * Get reply-to message data with attachment and sender profile
   */
  private async getReplyToData(replyToMsg: any): Promise<any> {
    const [replyAttachmentData, replySenderProfile] = await Promise.all([
      replyToMsg.attachment ? this.getAttachmentData(replyToMsg.attachment) : Promise.resolve(null),
      this.userClient.getProfile(replyToMsg.senderId), // Cached
    ]);

    const replySenderData = replySenderProfile
      ? { username: replySenderProfile.username, profile_picture: replySenderProfile.profilePicture }
      : { username: 'Unknown', profile_picture: '' };

    return {
      id: replyToMsg.id,
      conversation_id: replyToMsg.conversationId,
      sender_id: replyToMsg.senderId,
      content: replyToMsg.content,
      reply_to: null,
      shared_post: null,
      attachment: replyAttachmentData,
      sender: replySenderData,
      created_at: replyToMsg.createdAt.toISOString(),
    };
  }

  /**
   * Publish notifications for message recipients (non-blocking)
   */
  private async publishNotifications(
    savedMessage: Message,
    conversationId: string,
    senderId: string,
  ): Promise<void> {
    const participants = await this.participantRepository.find({
      where: {
        conversationId,
        userId: Not(senderId),
        isActive: true,
      },
    });

    // Publish all notifications in parallel (non-blocking)
    const publishPromises = participants.map((participant) =>
      this.eventPublisher.publishMessageReceived(
        savedMessage.id,
        conversationId,
        senderId,
        participant.userId,
        savedMessage.content,
      ),
    );

    await Promise.all(publishPromises);
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

    // Reload message with reply-to relation and its attachment
    const messageWithReply = await this.messageRepository.findOne({
      where: { id: savedMessage.id },
      relations: ['replyToMessage', 'replyToMessage.attachment', 'sharedPost'],
    }) as Message;

    // Fetch sender profile
    const senderProfile = await this.userClient.getProfile(senderId);
    const senderData = senderProfile
      ? { username: senderProfile.username, profile_picture: senderProfile.profilePicture }
      : { username: 'Unknown', profile_picture: '' };

    // Prepare reply_to data with attachment if exists
    let replyToData: any = null;
    if (messageWithReply?.replyToMessage) {
      const replyToMsg = messageWithReply.replyToMessage;
      let replyAttachmentData: any = null;
      
      if (replyToMsg.attachment) {
        const replyAttachment = replyToMsg.attachment;
        const replyAccessUrl = await this.attachmentService.getFileAccessUrl(replyAttachment.objectName);
        let replyThumbnailAccessUrl: string | null = null;
        if (replyAttachment.thumbnailObjectName) {
          replyThumbnailAccessUrl = await this.attachmentService.getFileAccessUrl(
            replyAttachment.thumbnailObjectName,
          );
        }

        replyAttachmentData = {
          id: replyAttachment.id,
          file_type: replyAttachment.fileType,
          file_name: replyAttachment.fileName,
          mime_type: replyAttachment.mimeType,
          file_size: replyAttachment.fileSize.toString(),
          access_url: replyAccessUrl,
          thumbnail_access_url: replyThumbnailAccessUrl,
        };
      }

      // Fetch reply-to message sender profile
      const replySenderProfile = await this.userClient.getProfile(replyToMsg.senderId);
      const replySenderData = replySenderProfile
        ? { username: replySenderProfile.username, profile_picture: replySenderProfile.profilePicture }
        : { username: 'Unknown', profile_picture: '' };

      replyToData = {
        id: replyToMsg.id,
        conversation_id: replyToMsg.conversationId,
        sender_id: replyToMsg.senderId,
        content: replyToMsg.content,
        reply_to: null,
        shared_post: null,
        attachment: replyAttachmentData,
        sender: replySenderData,
        created_at: replyToMsg.createdAt.toISOString(),
      };
    }

    // Send real-time message via WebSocket
    await this.messageGateway.sendMessageToConversation(
      conversationId,
      {
        id: messageWithReply.id,
        conversation_id: messageWithReply.conversationId,
        sender_id: messageWithReply.senderId,
        content: messageWithReply.content,
        reply_to: replyToData,
        shared_post: null,
        sender: senderData,
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
        messageWithReply.content,
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

    // Fetch sender profile
    const senderProfile = await this.userClient.getProfile(senderId);
    const senderData = senderProfile
      ? { username: senderProfile.username, profile_picture: senderProfile.profilePicture }
      : { username: 'Unknown', profile_picture: '' };

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
        sender: senderData,
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
        messageWithSharedPost.content,
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
      relations: ['sharedPost', 'replyToMessage', 'attachment'],
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
   * Get message with attachment loaded
   */
  async getMessageWithAttachment(messageId: string): Promise<Message | null> {
    return await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['attachment', 'sharedPost', 'replyToMessage'],
    });
  }

  /**
   * Get attachment access URL
   */
  async getAttachmentAccessUrl(objectName: string): Promise<string> {
    return await this.attachmentService.getFileAccessUrl(objectName);
  }

  /**
   * Get attachment service
   */
  getAttachmentService(): MessageAttachmentService {
    return this.attachmentService;
  }

  /**
   * Mark conversation as read for a user
   */
  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
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

    const now = new Date();
    participant.lastReadAt = now;
    await this.participantRepository.save(participant);

    // Mark all unread messages in this conversation as read
    const unreadMessages = await this.messageRepository.find({
      where: {
        conversationId,
        senderId: Not(userId), // Only mark messages from others as read
      },
      relations: ['conversation'],
    });

    if (unreadMessages.length > 0) {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
        relations: ['participants'],
      });

      if (conversation) {
        const isDirectChat = conversation.type === ConversationType.DIRECT;
        
        // For direct chats, update message.readAt directly
        if (isDirectChat) {
          await this.messageRepository.update(
            { id: In(unreadMessages.map(m => m.id)) },
            { readAt: now },
          );
        }

        // For all chats, create read receipts
        const readReceipts = unreadMessages.map((message) => {
          const receipt = new MessageReadReceipt();
          receipt.messageId = message.id;
          receipt.userId = userId;
          receipt.readAt = now;
          return receipt;
        });

        // Use upsert to avoid duplicates
        await this.readReceiptRepository
          .createQueryBuilder()
          .insert()
          .into(MessageReadReceipt)
          .values(readReceipts)
          .orIgnore()
          .execute();

        // Emit read receipt events for all marked messages
        for (const message of unreadMessages) {
          await this.messageGateway.sendMessageReadReceipt(
            conversationId,
            message.id,
            userId,
            now,
          );
        }
      }
    }
  }

  /**
   * Mark a specific message as read
   */
  async markMessageAsRead(messageId: string, userId: string): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['conversation'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Check if user is a participant
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId: message.conversationId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      throw new NotFoundException('User is not a participant in this conversation');
    }

    // Don't mark own messages as read
    if (message.senderId === userId) {
      return;
    }

    const now = new Date();
    const conversation = await this.conversationRepository.findOne({
      where: { id: message.conversationId },
    });

    if (conversation) {
      const isDirectChat = conversation.type === ConversationType.DIRECT;

      // For direct chats, update message.readAt
      if (isDirectChat) {
        await this.messageRepository.update(
          { id: messageId },
          { readAt: now },
        );
      }

      // Create read receipt
      const existingReceipt = await this.readReceiptRepository.findOne({
        where: { messageId, userId },
      });

      if (!existingReceipt) {
        const receipt = new MessageReadReceipt();
        receipt.messageId = messageId;
        receipt.userId = userId;
        receipt.readAt = now;
        await this.readReceiptRepository.save(receipt);

        // Emit read receipt event
        await this.messageGateway.sendMessageReadReceipt(
          message.conversationId,
          messageId,
          userId,
          now,
        );
      }
    }
  }

  /**
   * Get read status for messages (which users have read each message)
   */
  async getMessageReadStatus(messageIds: string[]): Promise<Map<string, string[]>> {
    const receipts = await this.readReceiptRepository.find({
      where: { messageId: In(messageIds) },
    });

    const statusMap = new Map<string, string[]>();
    for (const receipt of receipts) {
      const existing = statusMap.get(receipt.messageId) || [];
      existing.push(receipt.userId);
      statusMap.set(receipt.messageId, existing);
    }

    return statusMap;
  }

  /**
   * Get unread message count for a conversation
   */
  async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const participant = await this.participantRepository.findOne({
      where: {
        conversationId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      return 0;
    }

    // If never read, count all messages
    if (!participant.lastReadAt) {
      const total = await this.messageRepository.count({
        where: {
          conversationId,
          senderId: Not(userId), 
        },
      });
      return total;
    }

    // Count messages after lastReadAt
    const unreadCount = await this.messageRepository.count({
      where: {
        conversationId,
        senderId: Not(userId), 
        createdAt: MoreThan(participant.lastReadAt),
      },
    });

    return unreadCount;
  }

  /**
   * Get unread counts for all conversations for a user
   */
  async getUnreadCounts(userId: string): Promise<Record<string, number>> {
    const participants = await this.participantRepository.find({
      where: {
        userId,
        isActive: true,
      },
    });

    const unreadCounts: Record<string, number> = {};

    for (const participant of participants) {
      const count = await this.getUnreadCount(participant.conversationId, userId);
      unreadCounts[participant.conversationId] = count;
    }

    return unreadCounts;
  }

  /**
   * Delete a message 
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

    // Find the message with attachment
    const message = await this.messageRepository.findOne({
      where: {
        id: messageId,
        conversationId,
      },
      relations: ['attachment'],
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

    // Delete attachment if exists 
    if (message.attachment) {
      try {
        await this.attachmentService.decrementReferenceCount(message.attachment.id);
      } catch (error) {
        this.logger.error(`Failed to delete attachment for message ${messageId}:`, error);
      }
    }

    // Soft delete: set content to [deleted]
    message.content = '[deleted]';
    await this.messageRepository.save(message);

    // Emit WebSocket event for message deletion
    await this.messageGateway.sendMessageDeleted(conversationId, messageId);
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
        return;
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

  /**
   * Delete a conversation 
   */
  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

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

    // Mark user's participation as inactive 
    participant.isActive = false;
    await this.participantRepository.save(participant);
  }
}

