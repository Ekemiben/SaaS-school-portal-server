import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;

    // Only audit mutating operations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const tenantId = req.tenant?.tenantId || req.tenantContext?.tenantId || req.tenantId || req.user?.tenantId;
    const actorUserId = req.user?.id || req.user?.sub;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const requestId = req.requestId;
    const path = req.path || req.url;

    return next.handle().pipe(
      tap({
        next: (data) => {
          if (tenantId) {
            this.auditService.log({
              tenantId,
              actorUserId,
              action: `${method} ${path}`,
              resourceType: path.split('/')[3] || 'resource',
              resourceId: req.params?.id || data?.id || undefined,
              afterData: method !== 'DELETE' ? data : undefined,
              ipAddress: typeof ipAddress === 'string' ? ipAddress : Array.isArray(ipAddress) ? ipAddress[0] : undefined,
              userAgent,
              requestId,
            }).catch(() => {
              // Non-blocking telemetry
            });
          }
        },
      }),
    );
  }
}
