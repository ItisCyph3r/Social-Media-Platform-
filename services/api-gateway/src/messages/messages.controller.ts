import { Controller, Get, Post, Param, Body, Query, UseGuards, Delete } from '@nestjs/common';
import { MessageClientService } from '../clients/message-client.service';
import { UserClientService } from '../clients/user-client.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, CurrentUser as CurrentUserType } from '../auth/current-user.decorator';

@Controller('api/conversations')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private messageClient: MessageClientService,
    private userClient: UserClientService,
  ) {}

  @Get()
  async getConversations(
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.messageClient.getConversations(
      currentUser.userId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
    
    const enrichedConversations = await Promise.all(
      result.conversations.map(async (conversation) => {
        const enrichedParticipants = await Promise.all(
          conversation.participants.map(async (participant) => {
            const userProfile = await this.userClient.getProfile(participant.userId);
            return {
              id: participant.userId,
              user_id: participant.userId,
              username: userProfile?.username || 'Unknown',
              profile_picture: userProfile?.profilePicture || '',
              role: participant.role as 'admin' | 'member',
            };
          })
        );
        
        return {
          ...conversation,
          participants: enrichedParticipants,
        };
      })
    );
    
    return {
      ...result,
      conversations: enrichedConversations,
    };
  }

  @Post()
  async createConversation(
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { type?: string; name?: string; participant_ids: string[] },
  ) {
    const conversationType = body.type || (body.participant_ids.length === 1 ? 'direct' : 'group');
    
    const allParticipants = body.participant_ids.includes(currentUser.userId)
      ? body.participant_ids
      : [...body.participant_ids, currentUser.userId];
    
    const conversationName = conversationType === 'group' 
      ? (body.name?.trim() || 'Group Chat')
      : undefined;
    
    const conversation = await this.messageClient.createConversation(
      currentUser.userId,
      conversationType,
      allParticipants,
      conversationName,
    );
    
    const enrichedParticipants = await Promise.all(
      conversation.participants.map(async (participant) => {
        const userProfile = await this.userClient.getProfile(participant.userId);
        return {
          id: participant.userId,
          user_id: participant.userId,
          username: userProfile?.username || 'Unknown',
          profile_picture: userProfile?.profilePicture || '',
          role: participant.role as 'admin' | 'member',
        };
      })
    );
    
    return {
      ...conversation,
      participants: enrichedParticipants,
    };
  }

  @Get(':id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.messageClient.getMessages(
      conversationId,
      currentUser.userId,
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10),
    );
    return result;
  }

  @Post(':id/messages')
  async sendMessage(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { content: string; reply_to_message_id?: string },
  ) {
    if (body.reply_to_message_id) {
      return await this.messageClient.replyToMessage(
        conversationId,
        currentUser.userId,
        body.content,
        body.reply_to_message_id,
      );
    } else {
      return await this.messageClient.sendMessage(conversationId, currentUser.userId, body.content);
    }
  }

  @Post(':id/messages/:messageId/reply')
  async replyToMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { content: string },
  ) {
    return await this.messageClient.replyToMessage(
      conversationId,
      currentUser.userId,
      body.content,
      messageId,
    );
  }

  @Post(':id/share-post')
  async sharePost(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { post_id: string; message?: string },
  ) {
    return await this.messageClient.sharePost(conversationId, currentUser.userId, body.post_id, body.message);
  }

  @Post(':id/participants')
  async addParticipant(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: CurrentUserType,
    @Body() body: { user_id: string },
  ) {
    await this.messageClient.addParticipant(conversationId, body.user_id, currentUser.userId);
    
    const conversation = await this.messageClient.getConversation(conversationId, currentUser.userId);
    const enrichedParticipants = await Promise.all(
      conversation.participants.map(async (participant) => {
        const userProfile = await this.userClient.getProfile(participant.userId);
        return {
          id: participant.userId,
          user_id: participant.userId,
          username: userProfile?.username || 'Unknown',
          profile_picture: userProfile?.profilePicture || '',
          role: participant.role as 'admin' | 'member',
        };
      })
    );
    
    return {
      success: true,
      message: 'Participant added successfully',
      conversation: {
        ...conversation,
        participants: enrichedParticipants,
      },
    };
  }

  @Delete(':id/participants/:userId')
  async removeParticipant(
    @Param('id') conversationId: string,
    @Param('userId') userId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    await this.messageClient.removeParticipant(conversationId, userId, currentUser.userId);
    return { success: true, message: 'Participant removed successfully' };
  }

  @Get(':id')
  async getConversation(
    @Param('id') conversationId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    const result = await this.messageClient.getConversation(conversationId, currentUser.userId);
    
    const enrichedParticipants = await Promise.all(
      result.participants.map(async (participant) => {
        const userProfile = await this.userClient.getProfile(participant.userId);
        return {
          id: participant.userId, 
          user_id: participant.userId,
          username: userProfile?.username || 'Unknown',
          profile_picture: userProfile?.profilePicture || '',
          role: participant.role as 'admin' | 'member',
        };
      })
    );
    
    return {
      ...result,
      participants: enrichedParticipants,
    };
  }

  @Delete(':id/messages/:messageId')
  async deleteMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @CurrentUser() currentUser: CurrentUserType,
  ) {
    await this.messageClient.deleteMessage(conversationId, messageId, currentUser.userId);
    return { success: true, message: 'Message deleted successfully' };
  }
}




