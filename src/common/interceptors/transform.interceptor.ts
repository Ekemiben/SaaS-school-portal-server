import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../types/api-response.interface.js';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request['requestId'] || 'req_unknown';

    return next.handle().pipe(
      map((data) => {
        // If the controller already returned an ApiResponse format, preserve it
        if (data && typeof data === 'object' && 'success' in data) {
          return {
            ...data,
            requestId: data.requestId || requestId,
          };
        }

        return {
          success: true,
          data,
          message: 'Operation successful',
          requestId,
        };
      }),
    );
  }
}
