import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { LoveNote } from '@maomao/shared';
import type { LoveNote as LoveNoteRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LOVE_NOTE_SEED } from './love-notes.seed';

function toView(row: LoveNoteRow): LoveNote {
  return { id: row.id, content: row.content, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class LoveNotesService implements OnModuleInit {
  private readonly logger = new Logger(LoveNotesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 首次启动写入原型内置情话（幂等） */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.loveNote.count();
    if (count > 0) return;
    await this.prisma.loveNote.createMany({
      data: LOVE_NOTE_SEED.map((content) => ({ content })),
      skipDuplicates: true,
    });
    this.logger.log(`已写入 ${LOVE_NOTE_SEED.length} 条内置情话`);
  }

  /**
   * 当前小时的情话：与原型一致按「天 x 小时」确定性选择，
   * 同一小时内稳定，跨小时自动换新。
   */
  async current(): Promise<{ content: string }> {
    const notes = await this.prisma.loveNote.findMany({ select: { id: true } });
    if (!notes.length) return { content: '先喝口水，我在想你。' };

    const now = new Date();
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const seed = (day * 24 + now.getHours()) | 0;
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    const index = Math.floor((x - Math.floor(x)) * notes.length);
    const row = await this.prisma.loveNote.findUnique({
      where: { id: notes[Math.min(index, notes.length - 1)].id },
    });
    return { content: row?.content ?? LOVE_NOTE_SEED[0] };
  }

  list(): Promise<LoveNote[]> {
    return this.prisma.loveNote
      .findMany({ orderBy: { createdAt: 'asc' } })
      .then((rows) => rows.map(toView));
  }

  async create(content: string): Promise<LoveNote> {
    const trimmed = content.trim();
    const exists = await this.prisma.loveNote.findUnique({ where: { content: trimmed } });
    if (exists) throw new ConflictException('这条情话已经存在啦');
    const row = await this.prisma.loveNote.create({ data: { content: trimmed } });
    return toView(row);
  }

  async update(id: string, content: string): Promise<LoveNote> {
    const row = await this.prisma.loveNote.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('情话不存在');
    const trimmed = content.trim();
    const dup = await this.prisma.loveNote.findUnique({ where: { content: trimmed } });
    if (dup && dup.id !== id) throw new ConflictException('这条情话已经存在啦');
    const updated = await this.prisma.loveNote.update({
      where: { id },
      data: { content: trimmed },
    });
    return toView(updated);
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.loveNote.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('情话不存在');
    await this.prisma.loveNote.delete({ where: { id } });
  }
}
