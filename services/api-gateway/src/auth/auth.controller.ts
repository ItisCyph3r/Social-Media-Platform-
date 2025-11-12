import { Controller, Post, Body, HttpCode, HttpStatus, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthClientService } from '../clients/auth-client.service';
import { UserClientService } from '../clients/user-client.service';
import { Public } from './public.decorator';

@Controller('api/auth')
export class AuthController {
  constructor(
    private authClient: AuthClientService,
    private userClient: UserClientService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: { email: string; password: string; username?: string }) {
    try {
      const { userId, accessToken } = await this.authClient.register(
        body.email,
        body.password,
        body.username,
      );

      // Get user profile
      const profile = await this.userClient.getProfile(userId);

      return {
        access_token: accessToken,
        user: {
          id: userId,
          email: body.email,
          username: profile?.username || body.username || '',
          bio: profile?.bio || '',
          profile_picture: profile?.profilePicture || '',
        },
      };
    } catch (error: any) {
      // Re-throw NestJS exceptions as-is, otherwise wrap as 400
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException(error.message || 'Registration failed');
    }
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    try {
      const { userId, accessToken } = await this.authClient.login(body.email, body.password);

      // console.log('[AuthController] Login result:', { userId, hasToken: !!accessToken });

      // Get user profile
      const profile = await this.userClient.getProfile(userId);

      return {
        access_token: accessToken,
        user: {
          id: userId,
          email: body.email,
          username: profile?.username || '',
          bio: profile?.bio || '',
          profile_picture: profile?.profilePicture || '',
        },
      };
    } catch (error: any) {
      console.error('[AuthController] Login error:', error);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Unable to complete login. Please try again.');
    }
  }
}

