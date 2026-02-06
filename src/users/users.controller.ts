import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Webhook } from 'svix';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LinkCompetitorDto } from './dto/link-competitor.dto';
import { SyncClerkUserDto } from './dto/sync-clerk-user.dto';
import { ChangeCharacterDto } from './dto/change-character.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  /**
   * Sync user from Clerk webhook
   * Validates SVIX signature before processing
   */
  @Public()
  @Post('sync-clerk')
  async syncClerk(
    @Body() body: any,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
  ) {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error('CLERK_WEBHOOK_SECRET is not configured');
      throw new ForbiddenException('Webhook not configured');
    }

    // Verify SVIX signature
    const wh = new Webhook(webhookSecret);
    let evt: any;
    try {
      evt = wh.verify(JSON.stringify(body), {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': svixSignature,
      });
    } catch {
      this.logger.warn('Invalid webhook signature');
      throw new ForbiddenException('Invalid webhook signature');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const data = evt.data;
    const syncDto: SyncClerkUserDto = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      clerkId: data.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      email: data.email_addresses?.[0]?.email_address,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      firstName: data.first_name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      lastName: data.last_name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      profilePictureUrl: data.image_url,
    };

    return await this.usersService.syncFromClerk(syncDto);
  }

  /**
   * Create a new user manually
   */
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return await this.usersService.create(createUserDto);
  }

  /**
   * Get all users
   */
  @Get()
  async findAll() {
    return await this.usersService.findAll();
  }

  /**
   * Get current authenticated user
   * Automatically creates user if doesn't exist (first login)
   * Extracts user info from JWT token via ClerkGuard
   */
  @Get('me')
  async getMe(@CurrentUser() user: any) {
    const dbUser = await this.usersService.getOrCreateByClerkId({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      clerkId: user.clerkId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      email: user.email,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      firstName: user.first_name || user.firstName,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      lastName: user.last_name || user.lastName,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      profilePictureUrl: user.image_url || user.profilePictureUrl,
    });
    // Include the computed getter in the response
    return {
      ...dbUser,
      hasCompletedOnboarding: dbUser.hasCompletedOnboarding,
    };
  }

  /**
   * Get user by ID
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.usersService.findOne(id);
  }

  /**
   * Change character variant for current user
   * Only available for users with a linked competitor (players)
   * MUST be declared before @Patch(':id') to avoid route shadowing
   */
  @Patch('me/character')
  async changeCharacter(
    @CurrentUser() user: any,
    @Body() changeCharacterDto: ChangeCharacterDto,
  ) {
    const dbUser = await this.usersService.getOrCreateByClerkId({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      clerkId: user.clerkId,
    });
    return await this.usersService.changeCharacterVariant(
      dbUser.id,
      changeCharacterDto.characterVariantId,
    );
  }

  /**
   * Update user (ownership-checked)
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    await this.assertOwnership(id, currentUser);
    return await this.usersService.update(id, updateUserDto);
  }

  /**
   * Link user to a competitor (ownership-checked)
   */
  @Post(':id/link-competitor')
  async linkCompetitor(
    @Param('id') id: string,
    @Body() linkCompetitorDto: LinkCompetitorDto,
    @CurrentUser() currentUser: any,
  ) {
    await this.assertOwnership(id, currentUser);
    return await this.usersService.linkCompetitor(
      id,
      linkCompetitorDto.competitorId,
    );
  }

  /**
   * Unlink user from competitor (ownership-checked)
   */
  @Delete(':id/link-competitor')
  async unlinkCompetitor(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    await this.assertOwnership(id, currentUser);
    return await this.usersService.unlinkCompetitor(id);
  }

  /**
   * Delete user (ownership-checked)
   */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: any,
  ) {
    await this.assertOwnership(id, currentUser);
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }

  /**
   * Verify that the authenticated user owns the resource they're trying to access.
   * Compares Clerk ID from token against the user record in DB.
   */
  private async assertOwnership(userId: string, currentUser: any): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const clerkId = currentUser?.clerkId as string;
    const dbUser = await this.usersService.findOne(userId);
    if (dbUser.clerkId !== clerkId) {
      throw new ForbiddenException('You can only modify your own account');
    }
  }

}
