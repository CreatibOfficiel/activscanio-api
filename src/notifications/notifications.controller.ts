import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { SendNotificationDto } from './dto/send-notification.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClerkGuard } from '../auth/clerk.guard';
import { UsersService } from '../users/users.service';

@Controller('notifications')
@UseGuards(ClerkGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly usersService: UsersService,
  ) {}

  private async getUserIdFromClerkId(clerkId: string): Promise<string> {
    const user = await this.usersService.findByClerkId(clerkId);
    if (!user) {
      throw new NotFoundException(`User with clerkId ${clerkId} not found`);
    }
    return user.id;
  }

  /**
   * GET /api/notifications/preferences
   * Get current user's notification preferences
   */
  @Get('preferences')
  async getPreferences(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.notificationsService.getOrCreatePreferences(userId);
  }

  /**
   * PUT /api/notifications/preferences
   * Update notification preferences
   */
  @Put('preferences')
  async updatePreferences(
    @CurrentUser('clerkId') clerkId: string,
    @Body() updateDto: UpdatePreferencesDto,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.notificationsService.updatePreferences(userId, updateDto);
  }

  /**
   * POST /api/notifications/subscribe
   * Save push notification subscription
   */
  @Post('subscribe')
  async subscribe(
    @CurrentUser('clerkId') clerkId: string,
    @Body() subscription: PushSubscriptionDto,
  ) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    return await this.notificationsService.subscribe(userId, subscription);
  }

  /**
   * DELETE /api/notifications/unsubscribe
   * Remove push notification subscription
   */
  @Delete('unsubscribe')
  async unsubscribe(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    await this.notificationsService.unsubscribe(userId);
    return { message: 'Successfully unsubscribed from push notifications' };
  }

  /**
   * POST /api/notifications/test
   * Send a test notification to the current user
   */
  @Post('test')
  async sendTest(@CurrentUser('clerkId') clerkId: string) {
    const userId = await this.getUserIdFromClerkId(clerkId);
    await this.notificationsService.sendTestNotification(userId);
    return { message: 'Test notification sent' };
  }

  /**
   * POST /api/notifications/send
   * Send a notification to one or multiple users
   * (This could be restricted to admin users in production)
   */
  @Post('send')
  async send(@Body() sendDto: SendNotificationDto) {
    await this.notificationsService.sendNotification(sendDto);
    return {
      message: `Notification sent to ${sendDto.userIds.length} user(s)`,
    };
  }
}
