import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { CompetitorsService } from './competitors.service';
import { UpdatePlayerLifecycleDto } from './dtos/update-player-lifecycle.dto';
import { sanitizeCompetitor } from './utils/sanitize-competitor';

@Controller('admin/competitors')
@UseGuards(AdminGuard)
export class AdminCompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Get()
  async findAll() {
    return (await this.competitorsService.findAllIncludingAlumni()).map(sanitizeCompetitor);
  }

  @Patch(':id/lifecycle')
  async updateLifecycle(
    @Param('id') id: string,
    @Body() dto: UpdatePlayerLifecycleDto,
  ) {
    const updated = await this.competitorsService.updateLifecycle(id, dto);
    return sanitizeCompetitor(updated);
  }
}
