import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Register')
  async register(data: { email: string; password: string; username: string }) {
    try {
      const { userId } = await this.authService.register(
        data.email,
        data.password,
        data.username,
      );
      return {
        success: true,
        user_id: userId,
        message: 'User registered successfully',
      };
    } catch (error) {
      return {
        success: false,
        user_id: '',
        message: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  @GrpcMethod('AuthService', 'Login')
  async login(data: { email: string; password: string }) {
    try {
      const { userId, accessToken } = await this.authService.login(
        data.email,
        data.password,
      );
      
      if (!accessToken || !userId) {
        // console.error('[AuthController] Missing token or userId:', { accessToken: !!accessToken, userId: !!userId });
        throw new Error('Failed to generate token or get userId');
      }
      
      const response = {
        success: true,
        access_token: accessToken,
        user_id: userId,
        message: 'Login successful',
      };
      
      // console.log('[AuthController] Returning response:', {
      //   success: response.success,
      //   access_token: response.access_token.substring(0, 30) + '...',
      //   user_id: response.user_id,
      //   hasToken: !!response.access_token,
      //   hasUserId: !!response.user_id,
      //   message: response.message
      // });
      
      return response;
    } catch (error) {
      console.error('[AuthController] Login error:', error);
      return {
        success: false,
        access_token: '',
        user_id: '',
        message: error instanceof Error ? error.message : 'Login failed',
      };
    }
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  async validateToken(data: { token: string }) {
    const result = await this.authService.validateToken(data.token);
    if (result) {
      return {
        valid: true,
        user_id: result.userId,
        email: result.email,
      };
    }
    return {
      valid: false,
      user_id: '',
      email: '',
    };
  }

  @GrpcMethod('AuthService', 'GetUserById')
  async getUserById(data: { user_id: string }) {
    const user = await this.authService.getUserById(data.user_id);
    if (user) {
      return {
        id: user.id,
        email: user.email,
        created_at: user.createdAt.toISOString(),
      };
    }
    return {
      id: '',
      email: '',
      created_at: '',
    };
  }
}
