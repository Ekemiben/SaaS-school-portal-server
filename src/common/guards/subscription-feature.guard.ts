import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SUBSCRIPTION_FEATURE_KEY } from '../decorators/subscription-feature.decorator.js';
import { SubscriptionsService } from '../../modules/subscriptions/subscriptions.service.js';
import { ErrorCodes } from '../constants/error-codes.js';

@Injectable()
export class SubscriptionFeatureGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionFeatureGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      SUBSCRIPTION_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If endpoint does not require a subscription feature, pass through
    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId || user?.tenantId;

    // Platform Super Admins can bypass tenant subscription gating when performing platform admin tasks
    const userRole = user?.role || (user?.roles && user?.roles[0]);
    const isPlatformSuperAdmin =
      userRole === 'SUPER_ADMIN' ||
      (user?.roles && user.roles.includes('SUPER_ADMIN')) ||
      (user?.scope === 'PLATFORM' && userRole === 'PLATFORM_ADMIN');

    if (isPlatformSuperAdmin && !tenantId) {
      return true;
    }

    if (!tenantId) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Tenant context required for subscription feature verification.',
      });
    }

    const check = await this.subscriptionsService.isFeatureEntitled(tenantId, requiredFeature);
    if (!check.entitled) {
      const friendlyName = check.featureName || requiredFeature;
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_FEATURE_REQUIRED',
        requiredFeature,
        currentTier: check.planTier || 'STARTER',
        message: `Your current subscription plan (${check.planTier || 'STARTER'}) does not include access to the '${friendlyName}' feature. Please upgrade your school subscription or contact your platform administrator.`,
      });
    }

    return true;
  }
}
