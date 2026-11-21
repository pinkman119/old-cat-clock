import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DEFAULT_SERVER_PORT } from '@maomao/shared';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Vue 管理后台是独立 Web 应用（开发时由 Vite 代理 /api，生产可独立部署），
  // 放开来源以便两端统一通过 REST API 访问本服务。
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  // 生产部署时由 MAOMAO_ADMIN_DIST 指定 Vue 构建产物，与 /api 同源提供，
  // 客户端与后台只需开放同一个端口。
  const adminDist = process.env.MAOMAO_ADMIN_DIST;
  const staticRoot = adminDist ? resolve(adminDist) : '';
  const serveAdmin = staticRoot !== '' && existsSync(resolve(staticRoot, 'index.html'));
  if (serveAdmin) app.useStaticAssets(staticRoot, { index: 'index.html' });

  const port = Number(process.env.MAOMAO_SERVER_PORT ?? DEFAULT_SERVER_PORT);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API 服务已启动: http://0.0.0.0:${port}/api/health`);
  logger.log(serveAdmin ? `管理后台已启用: http://0.0.0.0:${port}/` : `Vue 管理后台请访问: http://127.0.0.1:5173/`);
}

void bootstrap();
