import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { verifyToken } from '@clerk/backend';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * Clerk Authentication Guard
 * Verifies JWT tokens from Clerk and attaches user info to request
 * Supports @Public() decorator to skip authentication for specific routes
 */
@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true; // Skip authentication for public routes
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract token from Authorization header
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    try {
      // Verify token with Clerk
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      // Attach user info to request
      request['user'] = {
        clerkId: payload.sub, // Clerk user ID
        sessionId: payload.sid, // Session ID
        ...payload,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Extract JWT token from Authorization header
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return undefined;
    }

    // Format: "Bearer <token>"
    const [type, token] = authHeader.split(' ');

    return type === 'Bearer' ? token : undefined;
  }
}
