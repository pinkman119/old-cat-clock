import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import type { SalaryDaySummary, SalaryMonthSummary, WorkConfig, WorkDayRecord } from '@maomao/shared';
import { AuthGuard, type AuthedRequest } from '../auth/guards';
import { SetOvertimeDto, UpdateWorkConfigDto } from './salary.dto';
import { SalaryService } from './salary.service';

@Controller(`${API_PREFIX}/salary`)
@UseGuards(AuthGuard)
export class SalaryController {
  constructor(private readonly salary: SalaryService) {}

  @Get('config')
  getConfig(@Req() request: AuthedRequest): Promise<WorkConfig> {
    return this.salary.getConfig(request.currentUser!.id);
  }

  @Put('config')
  updateConfig(
    @Req() request: AuthedRequest,
    @Body() dto: UpdateWorkConfigDto,
  ): Promise<WorkConfig> {
    return this.salary.updateConfig(request.currentUser!.id, dto);
  }

  /** 客户端启动打卡（幂等：当日首次时刻为准） */
  @Post('checkin')
  checkin(@Req() request: AuthedRequest): Promise<WorkDayRecord> {
    return this.salary.checkin(request.currentUser!.id);
  }

  /** 记录今日加班：加班结束时间（开始时间取配置 otStart） */
  @Put('overtime')
  setOvertime(
    @Req() request: AuthedRequest,
    @Body() dto: SetOvertimeDto,
  ): Promise<WorkDayRecord> {
    return this.salary.setOvertime(request.currentUser!.id, dto.otEnd);
  }

  @Get('day/:date')
  getDay(
    @Req() request: AuthedRequest,
    @Param('date') date: string,
  ): Promise<{ record: WorkDayRecord | null; summary: SalaryDaySummary }> {
    return this.salary.getDay(request.currentUser!.id, date);
  }

  @Get('calendar')
  getCalendar(
    @Req() request: AuthedRequest,
    @Query('month') month: string,
  ): Promise<SalaryMonthSummary> {
    return this.salary.getCalendar(request.currentUser!.id, month);
  }
}
