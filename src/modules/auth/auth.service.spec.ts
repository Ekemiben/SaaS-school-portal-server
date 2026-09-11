import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { NotificationProcessor } from '../../jobs/processors/notification.processor.js';
import { EmailAdapter } from '../notifications/adapters/email.adapter.js';
import { SmsAdapter } from '../notifications/adapters/sms.adapter.js';
import { WhatsAppAdapter } from '../notifications/adapters/whatsapp.adapter.js';

describe('AuthService Extended Features', () => {
  let authService: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  beforeEach(() => {
    prisma = new PrismaService();
    jwtService = new JwtService({ secret: 'test-secret' });
    const configService = new ConfigService({
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
    });
    const notifProcessor = new NotificationProcessor(
      prisma,
      new EmailAdapter(),
      new SmsAdapter(),
      new WhatsAppAdapter(),
    );

    authService = new AuthService(prisma, jwtService, configService, notifProcessor);
  });

  it('should initiate forgot password and generate reset token', async () => {
    const result = await authService.forgotPassword('tenant_greenfield_100', 'admin@greenfield.edu.ng');
    expect(result).toBeDefined();
    expect(result.message.toLowerCase()).toContain('password reset link');
  });

  it('should set up 2FA and provide secret and otpauth url', async () => {
    const setup = await authService.setup2FA('user_owner_001', 'tenant_greenfield_100');
    expect(setup.secret).toBeDefined();
    expect(setup.otpAuthUrl).toContain('otpauth://totp/');
  });

  it('should switch campus and return new token with activeCampusId', async () => {
    const switched = await authService.switchCampus('user_owner_001', 'tenant_greenfield_100', 'campus_main_01');
    expect(switched.user.activeCampusId).toBe('campus_main_01');
    expect(switched.accessToken).toBeDefined();
  });
});
