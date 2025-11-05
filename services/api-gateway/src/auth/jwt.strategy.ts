import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthClientService } from '../clients/auth-client.service';

export interface JwtPayload {
  sub: string; // userId
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authClient: AuthClientService,
  ) {
    const secret = configService.get<string>('JWT_SECRET') || 'placeholder-secret';
    // console.log('[JwtStrategy] Initializing with secret:', secret ? `${secret.substring(0, 10)}...` : 'NOT SET');
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // IMPORTANT: The secret MUST match the Auth Service's JWT_SECRET
      // Passport verifies the signature before calling validate()
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: JwtPayload) {
    // console.log('[JwtStrategy] Token validated by Passport, payload:', payload);
    
    // Extract token from request
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

    if (!token) {
      console.error('[JwtStrategy] No token provided');
      throw new UnauthorizedException('No token provided');
    }

    // console.log('[JwtStrategy] Validating token via Auth Service...');
    
    // Validate token via Auth Service (authoritative source)
    const validation = await this.authClient.validateToken(token);

    if (!validation) {
      console.error('[JwtStrategy] Token validation failed via Auth Service');
      throw new UnauthorizedException('Invalid token');
    }

    // console.log('[JwtStrategy] Token validated successfully:', { userId: validation.userId, email: validation.email });

    // Return user info to be attached to request
    return {
      userId: validation.userId,
      email: validation.email,
    };
  }
}

