import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtAccessPayload {
  sub: string;
  userId: string;
  email: string;
  tenantId: string;
  campusId?: string;
  role: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAccessStrategy {
  constructor(private readonly jwtService: JwtService) {}

  async validate(token: string): Promise<JwtAccessPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtAccessPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'super-secret-jwt-access-key-school-saas',
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
