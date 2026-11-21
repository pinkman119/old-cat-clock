import { Controller, Get, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import { AuthGuard } from '../auth/guards';
import { LoveNotesService } from './love-notes.service';

@Controller(`${API_PREFIX}/love-notes`)
@UseGuards(AuthGuard)
export class LoveController {
  constructor(private readonly loveNotes: LoveNotesService) {}

  /** 客户端每小时拉取一次当前情话 */
  @Get('current')
  current(): Promise<{ content: string }> {
    return this.loveNotes.current();
  }
}
