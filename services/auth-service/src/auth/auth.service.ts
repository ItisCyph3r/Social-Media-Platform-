import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';
import { EventPublisherService } from '../events/event-publisher.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private eventPublisher: EventPublisherService,
  ) {}

  async register(email: string, password: string, username?: string): Promise<{ userId: string }> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      email,
      passwordHash,
    });

    const savedUser = await this.userRepository.save(user);

    // Publish user.created event for profile creation
    await this.eventPublisher.publishUserCreated(savedUser.id, savedUser.email, username);

    return { userId: savedUser.id };
  }

  async login(email: string, password: string): Promise<{ userId: string; accessToken: string }> {
    // console.log('[AuthService] Login attempt for:', email);
    
    // Find user
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      console.error('[AuthService] User not found:', email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // console.log('[AuthService] User found:', { id: user.id, email: user.email });

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      console.error('[AuthService] Invalid password for:', email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // console.log('[AuthService] Password valid, generating token...');

    // Generate JWT token
    const payload = { sub: user.id, email: user.email };
    // console.log('[AuthService] JWT payload:', payload);
    // console.log('[AuthService] JWT service available:', !!this.jwtService);
    
    const accessToken = this.jwtService.sign(payload);
    // console.log('[AuthService] Token generated:', { 
    //   hasToken: !!accessToken, 
    //   tokenLength: accessToken?.length,
    //   tokenPreview: accessToken?.substring(0, 20) + '...'
    // });

    const result = {
      userId: user.id,
      accessToken,
    };
    
    // console.log('[AuthService] Returning:', { 
    //   userId: result.userId, 
    //   hasToken: !!result.accessToken 
    // });

    return result;
  }

  async validateToken(token: string): Promise<{ userId: string; email: string } | null> {
    try {
      const payload = this.jwtService.verify(token);
      return {
        userId: payload.sub,
        email: payload.email,
      };
    } catch (error) {
      return null;
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
    });
  }
}

