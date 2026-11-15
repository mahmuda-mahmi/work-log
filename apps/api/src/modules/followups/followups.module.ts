import { Module } from '@nestjs/common';
import { FollowupsController } from './followups.controller.js';

@Module({
  controllers: [FollowupsController],
})
export class FollowupsModule {}
