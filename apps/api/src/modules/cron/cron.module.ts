import { Module } from '@nestjs/common';
import { CronController } from './cron.controller.js';

@Module({
  controllers: [CronController],
})
export class CronModule {}
