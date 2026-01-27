import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../exceptions/domain.exceptions';

/**
 * Global HTTP exception filter
 * Handles all HttpException instances including DomainException
 * Provides consistent error response format across the application
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    // Get exception response (can be string or object)
    const exceptionResponse = exception.getResponse();

    // Build error response
    const errorResponse = this.buildErrorResponse(
      exceptionResponse,
      status,
      request,
      exception,
    );

    // Log the error
    this.logError(exception, request, errorResponse);

    // Send response
    response.status(status).json(errorResponse);
  }

  /**
   * Build standardized error response
   */
  private buildErrorResponse(
    exceptionResponse: string | object,
    status: HttpStatus,
    request: Request,
    exception: HttpException,
  ) {
    // If it's a DomainException, it already has a well-structured response
    if (exception instanceof DomainException) {
      return {
        ...(typeof exceptionResponse === 'object' ? exceptionResponse : {}),
        path: request.url,
        method: request.method,
      };
    }

    // For standard HttpException
    if (typeof exceptionResponse === 'string') {
      return {
        statusCode: status,
        message: exceptionResponse,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
      };
    }

    // For object responses (like validation errors from class-validator)
    return {
      statusCode: status,
      ...(typeof exceptionResponse === 'object' ? exceptionResponse : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };
  }

  /**
   * Log the error with appropriate level
   */
  private logError(
    exception: HttpException,
    request: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    errorResponse: any,
  ) {
    const status = exception.getStatus();
    const message = exception.message;

    // Build log context
    const logContext = {
      statusCode: status,
      method: request.method,
      path: request.url,
      message,
      ...(exception instanceof DomainException && exception.code
        ? { code: exception.code }
        : {}),
      ...(exception instanceof DomainException && exception.details
        ? { details: exception.details }
        : {}),
    };

    // Log based on status code
    if (status >= 500) {
      // Server errors - log as error with stack trace
      this.logger.error(
        `Server error: ${message}`,
        exception.stack,
        JSON.stringify(logContext),
      );
    } else if (status >= 400) {
      // Client errors - log as warning
      this.logger.warn(`Client error: ${message}`, JSON.stringify(logContext));
    }
  }
}
