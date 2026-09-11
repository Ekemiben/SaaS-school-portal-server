import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, originalUrl } = request;
    const requestId = request['requestId'];
    const tenantId = request.tenantContext?.tenantId || 'platform';
    const userId = request.user?.id || 'anonymous';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        const duration = Date.now() - start;

        this.logger.log(
          JSON.stringify({
            requestId,
            tenantId,
            userId,
            method,
            route: originalUrl,
            statusCode,
            durationMs: duration,
          }),
        );
      }),
    );
  }
}
