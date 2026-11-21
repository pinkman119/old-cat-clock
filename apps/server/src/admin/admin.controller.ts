import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import type { AdminOverview, LoveNote, PublicUser } from '@maomao/shared';
import { CreateUserDto, UpdateUserDto } from '../auth/auth.dto';
import { AdminGuard } from '../auth/guards';
import { LoveNotesService } from '../love/love-notes.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateLoveNoteDto, UpdateLoveNoteDto } from './admin.dto';

@Controller(`${API_PREFIX}/admin`)
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly loveNotes: LoveNotesService,
  ) {}

  @Get('overview')
  async overview(): Promise<AdminOverview> {
    const [totalUsers, totalTodos, completedTodos, totalCheckins, overtimeDays, totalLoveNotes] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.todo.count(),
        this.prisma.todo.count({ where: { done: true } }),
        this.prisma.workDayRecord.count({ where: { checkinAt: { not: null } } }),
        this.prisma.workDayRecord.count({ where: { overtime: true } }),
        this.prisma.loveNote.count(),
      ]);
    return { totalUsers, totalTodos, completedTodos, totalCheckins, overtimeDays, totalLoveNotes };
  }

  // ===== 账户管理 =====

  @Get('users')
  listUsers(): Promise<PublicUser[]> {
    return this.users.list();
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto): Promise<PublicUser> {
    return this.users.create(dto);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<PublicUser> {
    return this.users.update(id, dto);
  }

  @Delete('users/:id')
  async removeUser(@Param('id') id: string): Promise<{ id: string }> {
    await this.users.remove(id);
    return { id };
  }

  // ===== 情话管理 =====

  @Get('love-notes')
  listLoveNotes(): Promise<LoveNote[]> {
    return this.loveNotes.list();
  }

  @Post('love-notes')
  createLoveNote(@Body() dto: CreateLoveNoteDto): Promise<LoveNote> {
    return this.loveNotes.create(dto.content);
  }

  @Patch('love-notes/:id')
  updateLoveNote(@Param('id') id: string, @Body() dto: UpdateLoveNoteDto): Promise<LoveNote> {
    return this.loveNotes.update(id, dto.content);
  }

  @Delete('love-notes/:id')
  async removeLoveNote(@Param('id') id: string): Promise<void> {
    await this.loveNotes.remove(id);
  }
}
