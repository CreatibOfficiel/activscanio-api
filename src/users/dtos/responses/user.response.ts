import { Expose, Type, Transform } from 'class-transformer';
import { UserRole } from '../../user.entity';
import { CompetitorResponse } from '../../../competitors/dtos/responses/competitor.response';

/**
 * Response DTO for User entity
 * Used for all API responses involving users
 * NOTE: clerkId is excluded for security
 */
export class UserResponse {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  firstName: string;

  @Expose()
  lastName: string;

  @Expose()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  @Transform(({ obj }) => `${obj.firstName} ${obj.lastName}`)
  fullName: string;

  @Expose()
  profilePictureUrl: string | null;

  @Expose()
  role: UserRole;

  @Expose()
  competitorId: string | null;

  @Expose()
  @Type(() => CompetitorResponse)
  competitor?: CompetitorResponse;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
