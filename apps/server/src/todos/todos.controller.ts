import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import type { Todo } from '@maomao/shared';
import { AuthGuard, type AuthedRequest } from '../auth/guards';
import { CreateTodoDto, UpdateTodoDto } from './todo.dto';
import { TodosService } from './todos.service';

@Controller(`${API_PREFIX}/todos`)
@UseGuards(AuthGuard)
export class TodosController {
  constructor(private readonly todos: TodosService) {}

  @Get()
  list(@Req() request: AuthedRequest, @Query('date') date: string): Promise<Todo[]> {
    return this.todos.list(request.currentUser!.id, date);
  }

  @Post()
  create(@Req() request: AuthedRequest, @Body() dto: CreateTodoDto): Promise<Todo> {
    return this.todos.create(request.currentUser!.id, dto);
  }

  @Patch(':id')
  update(
    @Req() request: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTodoDto,
  ): Promise<Todo> {
    return this.todos.update(request.currentUser!.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(@Req() request: AuthedRequest, @Param('id') id: string): Promise<{ id: string }> {
    await this.todos.remove(request.currentUser!.id, id);
    return { id };
  }

  /** 清除某日已完成：DELETE /api/todos/completed?date=YYYY-MM-DD */
  @Delete('completed')
  @HttpCode(200)
  clearCompleted(
    @Req() request: AuthedRequest,
    @Query('date') date: string,
  ): Promise<{ count: number }> {
    return this.todos.clearCompleted(request.currentUser!.id, date);
  }
}
