import { Injectable, OnModuleInit, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface AuthServiceClient {
  Register(
    data: { email: string; password: string; username: string },
    callback: (error: any, response: { success: boolean; user_id: string; message: string }) => void,
  ): void;
  Login(
    data: { email: string; password: string },
    callback: (error: any, response: { success: boolean; access_token: string; user_id: string; message: string }) => void,
  ): void;
  ValidateToken(
    data: { token: string },
    callback: (error: any, response: { valid: boolean; user_id: string; email: string }) => void,
  ): void;
  GetUserById(
    data: { user_id: string },
    callback: (error: any, response: { id: string; email: string; created_at: string }) => void,
  ): void;
}

@Injectable()
export class AuthClientService implements OnModuleInit {
  private authService: AuthServiceClient;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const authServiceUrl = this.configService.get<string>('AUTH_SERVICE_GRPC_URL') || 'localhost:5001';
    const protoPath = join(__dirname, '../../../../shared/protos/auth.proto');

    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const authProto = grpc.loadPackageDefinition(packageDefinition).auth as any;

    this.authService = new authProto.AuthService(
      authServiceUrl,
      grpc.credentials.createInsecure(),
    ) as AuthServiceClient;

    console.log('[AuthClientService] Connected to Auth Service');
  }

  async register(email: string, password: string, username?: string): Promise<{ userId: string; accessToken: string }> {
    return new Promise((resolve, reject) => {
      this.authService.Register(
        { email, password, username: username || '' },
        (error, response) => {
          if (error) {
            reject(error);
          } else if (!response?.success) {
            reject(new BadRequestException(response?.message || 'Registration failed'));
          } else {
            // After registration, login to get token
            this.login(email, password).then(resolve).catch(reject);
          }
        },
      );
    });
  }

  async login(email: string, password: string): Promise<{ userId: string; accessToken: string }> {
    return new Promise((resolve, reject) => {
      this.authService.Login(
        { email, password },
        (error, response) => {
          if (error) {
            console.error('[AuthClientService] Login error:', error);
            reject(error);
          } else {
            // Debug: Log the entire response to see what we're getting
            // console.log('[AuthClientService] Full login response:', JSON.stringify(response, null, 2));
            // console.log('[AuthClientService] Response keys:', Object.keys(response || {}));
            // console.log('[AuthClientService] Response properties:', {
            //   success: response?.success,
            //   access_token: response?.access_token,
            //   user_id: response?.user_id,
            //   message: response?.message
            // });
            
            if (!response?.success) {
              console.error('[AuthClientService] Login failed:', response?.message);
              reject(new UnauthorizedException(response?.message || 'Invalid credentials'));
            } else {
              const userId = response.user_id || '';
              const accessToken = response.access_token || '';
              
              // console.log('[AuthClientService] Extracted:', { userId, hasToken: !!accessToken, tokenLength: accessToken.length });
              
              if (!accessToken || !userId) {
                console.error('[AuthClientService] Missing token or userId in response:', response);
                reject(new Error('Login succeeded but no token or userId returned'));
              } else {
                resolve({
                  userId,
                  accessToken,
                });
              }
            }
          }
        },
      );
    });
  }

  async validateToken(token: string): Promise<{ userId: string; email: string } | null> {
    return new Promise((resolve) => {
      // console.log('[AuthClientService] Validating token...');
      this.authService.ValidateToken(
        { token },
        (error, response) => {
          if (error) {
            console.error('[AuthClientService] ValidateToken error:', error);
            resolve(null);
          } else {
            // console.log('[AuthClientService] ValidateToken response:', {
            //   valid: response?.valid,
            //   hasUserId: !!response?.user_id,
            //   hasEmail: !!response?.email,
            // });
            if (!response?.valid) {
              resolve(null);
            } else {
              resolve({
                userId: response.user_id,
                email: response.email,
              });
            }
          }
        },
      );
    });
  }

  async getUserById(userId: string): Promise<{ id: string; email: string; created_at: string } | null> {
    return new Promise((resolve) => {
      this.authService.GetUserById(
        { user_id: userId },
        (error, response) => {
          if (error) {
            resolve(null);
          } else {
            resolve({
              id: response?.id || '',
              email: response?.email || '',
              created_at: response?.created_at || '',
            });
          }
        },
      );
    });
  }
}

