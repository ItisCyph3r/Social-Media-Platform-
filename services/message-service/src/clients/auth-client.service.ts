import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

interface AuthServiceClient {
  ValidateToken(
    data: { token: string },
    callback: (error: any, response: { valid: boolean; user_id: string; email: string }) => void,
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

  async validateToken(token: string): Promise<{ valid: boolean; userId: string; email: string } | null> {
    return new Promise((resolve) => {
      this.authService.ValidateToken(
        { token },
        (error, response) => {
          if (error) {
            console.error(`[AuthClientService] Failed to validate token:`, error);
            resolve(null);
          } else {
            resolve({
              valid: response?.valid || false,
              userId: response?.user_id || '',
              email: response?.email || '',
            });
          }
        },
      );
    });
  }
}

