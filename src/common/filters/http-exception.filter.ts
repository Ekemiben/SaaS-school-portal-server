import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ErrorCodes } from '../constants/error-codes.js';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse: any = exception.getResponse();

    let errorCode: string = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = exception.message;
    let details: any = null;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      message = exceptionResponse.message || exception.message;
      errorCode = exceptionResponse.errorCode || this.mapStatusToErrorCode(status);
      details = exceptionResponse.details || exceptionResponse.error || null;
      if (Array.isArray(exceptionResponse.message)) {
        message = exceptionResponse.message.join('; ');
        details = exceptionResponse.message;
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
      errorCode = this.mapStatusToErrorCode(status);
    }

    const errorPayload = {
      success: false,
      statusCode: status,
      error: {
        code: errorCode,
        message,
        details,
        path: request.url,
        timestamp: new Date().toISOString(),
        requestId: (request as any).requestId || null,
      },
    };

    response.status(status).json(errorPayload);
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.RESOURCE_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCodes.VALIDATION_FAILED;
      default:
        return ErrorCodes.INTERNAL_SERVER_ERROR;
    }
  }
}
