import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AlumniService } from './alumni.service';

@Controller('alumni')
export class AlumniController {
  constructor(private readonly service: AlumniService) {}

  @Get('reminders/claim')
  claim(@CurrentUser('clerkId') clerkId: string) {
    return this.service.claimForUser(clerkId);
  }

  @Public()
  @Get('tv-today')
  tvToday() {
    return this.service.tvAnniversaries();
  }

  @Public()
  @Get('hall-of-fame')
  hallOfFame() {
    return this.service.hallOfFame();
  }
}
