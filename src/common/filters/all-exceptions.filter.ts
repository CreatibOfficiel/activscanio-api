import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter that catches ALL exceptions
 * This filter catches exceptions that are not HttpException instances
 * (e.g., unexpected errors, TypeORM errors, etc.)
 *
 * Should be registered alongside HttpExceptionFilter to provide
 * comprehensive error handling coverage
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // If it's an HttpException, let HttpExceptionFilter handle it
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      return response.status(status).json(exceptionResponse);
    }

    // For all other exceptions, treat as internal server error
    const status = HttpStatus.INTERNAL_SERVER_ERROR;

    // Extract error details
    const errorDetails = this.extractErrorDetails(exception);

    // Build error response
    const errorResponse = {
      statusCode: status,
      message: 'Internal server error',
      error: errorDetails.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    // Log the unexpected error with full details
    this.logger.error(
      `Unhandled exception: ${errorDetails.message}`,
      errorDetails.stack,
      JSON.stringify({
        method: request.method,
        path: request.url,
        query: request.query,
        body: request.body,
        errorName: errorDetails.name,
      }),
    );

    // Send response
    response.status(status).json(errorResponse);
  }

  /**
   * Extract error details from unknown exception type
   */
  private extractErrorDetails(exception: unknown): {
    name: string;
    message: string;
    stack?: string;
  } {
    // If it's an Error instance
    if (exception instanceof Error) {
      return {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
      };
    }

    // If it's an object with message property
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'message' in exception
    ) {
      return {
        name: exception.constructor?.name || 'UnknownError',
        message: String(exception.message),
        stack: 'stack' in exception ? String(exception.stack) : undefined,
      };
    }

    // For primitive values or other types
    return {
      name: 'UnknownError',
      message: String(exception),
      stack: undefined,
    };
  }
}
