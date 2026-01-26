import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Health check endpoint for monitoring
   * Checks API status and database connectivity
   */
  @Public()
  @Get('health')
  async health() {
    const timestamp = new Date().toISOString();

    try {
      // Check database connectivity
      await this.dataSource.query('SELECT 1');

      return {
        status: 'ok',
        timestamp,
        service: 'activscanio-api',
        database: 'connected',
        uptime: process.uptime(),
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp,
        service: 'activscanio-api',
        database: 'disconnected',
        error: error.message,
      };
    }
  }

  /**
   * Readiness check for Kubernetes/Docker
   */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.dataSource.query('SELECT 1');
      return { ready: true };
    } catch {
      return { ready: false };
    }
  }
}
