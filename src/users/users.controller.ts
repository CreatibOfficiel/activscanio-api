import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
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
  constructor(private readonly usersService: UsersService) {}

  /**
   * Sync user from Clerk webhook
   * This endpoint should be called by Clerk webhooks
   * Public endpoint (no auth required for webhooks)
   */
  @Public()
  @Post('sync-clerk')
  async syncClerk(@Body() syncClerkUserDto: SyncClerkUserDto) {
    return await this.usersService.syncFromClerk(syncClerkUserDto);
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
   * Update user
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.usersService.update(id, updateUserDto);
  }

  /**
   * Link user to a competitor
   */
  @Post(':id/link-competitor')
  async linkCompetitor(
    @Param('id') id: string,
    @Body() linkCompetitorDto: LinkCompetitorDto,
  ) {
    return await this.usersService.linkCompetitor(
      id,
      linkCompetitorDto.competitorId,
    );
  }

  /**
   * Unlink user from competitor
   */
  @Delete(':id/link-competitor')
  async unlinkCompetitor(@Param('id') id: string) {
    return await this.usersService.unlinkCompetitor(id);
  }

  /**
   * Delete user
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }

  /**
   * Change character variant for current user
   * Only available for users with a linked competitor (players)
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
}
