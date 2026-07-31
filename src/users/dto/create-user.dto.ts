import { IsEmail, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SportPreference, UserRole } from '../user.entity';

export class CreateUserDto {
  @IsString()
  clerkId: string;

  @IsEmail()
  email: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  profilePictureUrl?: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  /** Which sport this user follows. Defaults to both when omitted. */
  @IsEnum(SportPreference)
  @IsOptional()
  sportPreference?: SportPreference;

  @IsOptional()
  @IsUUID()
  competitorId?: string;
}
