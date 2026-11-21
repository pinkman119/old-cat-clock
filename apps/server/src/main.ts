import 'reflect-metadata';
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

  const port = Number(process.env.MAOMAO_SERVER_PORT ?? DEFAULT_SERVER_PORT);
  await app.listen(port, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`API 服务已启动: http://127.0.0.1:${port}/api/health`);
  logger.log(`Vue 管理后台请访问: http://127.0.0.1:5173/`);
}

void bootstrap();
