import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface JwtRefreshPayload {
  sub: string;
  userId: string;
  tenantId: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtRefreshStrategy {
  constructor(private readonly jwtService: JwtService) {}

  async validate(token: string): Promise<JwtRefreshPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtRefreshPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-jwt-refresh-key-school-saas',
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
