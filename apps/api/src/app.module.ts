import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { OriginGuard } from './common/origin.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DictionaryModule } from './modules/dictionary/dictionary.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { TeamsModule } from './modules/teams/teams.module.js';

@Module({
  imports: [HealthModule, AuthModule, TeamsModule, DictionaryModule, ReportsModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
  ],
})
export class AppModule {}
