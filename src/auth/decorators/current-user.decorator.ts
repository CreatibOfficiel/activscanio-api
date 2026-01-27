import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract current user from request
 * Use with ClerkGuard
 *
 * @example
 * @Get('profile')
 * @UseGuards(ClerkGuard)
 * getProfile(@CurrentUser() user: any) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<{ user?: any }>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const user = request.user;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return data ? user?.[data] : user;
  },
);
