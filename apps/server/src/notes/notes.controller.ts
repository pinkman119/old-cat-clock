import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import type { DayNote } from '@maomao/shared';
import { IsString, Length, Matches } from 'class-validator';
import { AuthGuard, type AuthedRequest } from '../auth/guards';
import { NotesService } from './notes.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class SaveNoteDto {
  @IsString()
  @Length(0, 500)
  content!: string;
}

@Controller(`${API_PREFIX}/notes`)
@UseGuards(AuthGuard)
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get(':date')
  get(@Req() request: AuthedRequest, @Param('date') date: string): Promise<DayNote> {
    return this.notes.get(request.currentUser!.id, date);
  }

  @Put(':date')
  save(
    @Req() request: AuthedRequest,
    @Param('date') date: string,
    @Body() dto: SaveNoteDto,
  ): Promise<DayNote> {
    if (!DATE.test(date)) throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    return this.notes.save(request.currentUser!.id, date, dto.content);
  }

  @Delete(':date')
  async remove(@Req() request: AuthedRequest, @Param('date') date: string): Promise<void> {
    await this.notes.remove(request.currentUser!.id, date);
  }
}
