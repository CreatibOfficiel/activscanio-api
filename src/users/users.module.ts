import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { UserRepository } from './repositories/user.repository';
import { CharacterVariant } from '../character-variants/character-variant.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, CharacterVariant])],
  controllers: [UsersController],
  providers: [UsersService, UserRepository],
  exports: [UsersService, UserRepository],
})
export class UsersModule {}
