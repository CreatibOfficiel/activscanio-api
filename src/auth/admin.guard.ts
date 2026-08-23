import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clerkId = request.user?.clerkId as string | undefined;
    const user = clerkId ? await this.usersService.findByClerkId(clerkId) : null;
    const bootstrapIds = (process.env.ADMIN_CLERK_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!user || (!user.isAdmin && !bootstrapIds.includes(clerkId!))) {
      throw new ForbiddenException('Accès administrateur requis');
    }
    return true;
  }
}
