import { IsEmail, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * DTO for syncing user data from Clerk webhooks
 */
export class SyncClerkUserDto {
  @IsString()
  clerkId: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  profilePictureUrl?: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
