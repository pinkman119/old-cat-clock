import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, date: string): Promise<{ date: string; content: string }> {
    const row = await this.prisma.dayNote.findUnique({
      where: { userId_date: { userId, date } },
    });
    return { date, content: row?.content ?? '' };
  }

  /** 保存小记：空内容视为删除（与原型行为一致） */
  async save(userId: string, date: string, content: string): Promise<{ date: string; content: string }> {
    const trimmed = content.trim();
    if (!trimmed) {
      await this.prisma.dayNote.deleteMany({ where: { userId, date } });
      return { date, content: '' };
    }
    await this.prisma.dayNote.upsert({
      where: { userId_date: { userId, date } },
      update: { content: trimmed },
      create: { userId, date, content: trimmed },
    });
    return { date, content: trimmed };
  }

  async remove(userId: string, date: string): Promise<void> {
    await this.prisma.dayNote.deleteMany({ where: { userId, date } });
  }
}
