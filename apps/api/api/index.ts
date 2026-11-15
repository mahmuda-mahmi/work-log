import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppModule } from '../src/app.module.js';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter.js';
import { ZodValidationPipe } from '../src/common/zod-validation.pipe.js';

let cached: Promise<NestExpressApplication> | null = null;

async function bootstrap(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const app = await (cached ??= bootstrap());
  const instance = app.getHttpAdapter().getInstance();
  instance(req, res);
}
