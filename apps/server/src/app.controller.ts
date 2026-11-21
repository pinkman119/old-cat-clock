import { Controller, Get } from '@nestjs/common';
import { APP_NAME, APP_VERSION, API_PREFIX } from '@maomao/shared';

@Controller(API_PREFIX)
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      app: APP_NAME,
      version: APP_VERSION,
      time: new Date().toISOString(),
    };
  }
}
