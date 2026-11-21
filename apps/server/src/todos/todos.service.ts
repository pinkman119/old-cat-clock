import { Injectable, NotFoundException } from '@nestjs/common';
import type { Todo } from '@maomao/shared';
import type { Todo as TodoRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTodoDto, UpdateTodoDto } from './todo.dto';

function toView(row: TodoRow): Todo {
  return {
    id: row.id,
    text: row.text,
    remindAt: row.remindAt,
    date: row.date,
    done: row.done,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class TodosService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string, date: string): Promise<Todo[]> {
    return this.prisma.todo
      .findMany({
        where: { userId, date },
        orderBy: [{ remindAt: 'asc' }, { createdAt: 'asc' }],
      })
      .then((rows) => rows.map(toView));
  }

  async create(userId: string, dto: CreateTodoDto): Promise<Todo> {
    const row = await this.prisma.todo.create({
      data: { userId, text: dto.text.trim(), remindAt: dto.remindAt, date: dto.date },
    });
    return toView(row);
  }

  async update(userId: string, id: string, dto: UpdateTodoDto): Promise<Todo> {
    const row = await this.prisma.todo.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('待办不存在');

    const updated = await this.prisma.todo.update({
      where: { id },
      data: {
        ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
        ...(dto.remindAt !== undefined ? { remindAt: dto.remindAt } : {}),
        ...(dto.done !== undefined ? { done: dto.done } : {}),
      },
    });
    return toView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.prisma.todo.findUnique({ where: { id } });
    if (!row || row.userId !== userId) throw new NotFoundException('待办不存在');
    await this.prisma.todo.delete({ where: { id } });
  }

  /** 清除某日已完成的待办 */
  async clearCompleted(userId: string, date: string): Promise<{ count: number }> {
    const result = await this.prisma.todo.deleteMany({
      where: { userId, date, done: true },
    });
    return { count: result.count };
  }
}
