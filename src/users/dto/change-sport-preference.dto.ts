import { IsEnum } from 'class-validator';
import { SportPreference } from '../user.entity';

/**
 * Deliberately one field.
 *
 * The generic UpdateUserDto also carries `role` and `competitorId`; letting
 * this route accept it would mean a user could promote themselves or claim
 * another competitor while changing their sport.
 */
export class ChangeSportPreferenceDto {
  @IsEnum(SportPreference)
  sportPreference: SportPreference;
}
