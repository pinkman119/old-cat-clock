import { BadRequestException, Injectable } from '@nestjs/common';
import type { SalaryDaySummary, SalaryMonthSummary, WorkConfig, WorkDayRecord } from '@maomao/shared';
import { DEFAULT_WORK_CONFIG } from '@maomao/shared';
import type { WorkConfig as WorkConfigRow } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { daySummary, monthSummary } from './salary.calc';
import type { UpdateWorkConfigDto } from './salary.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function toConfigView(row: WorkConfigRow): WorkConfig {
  return {
    monthly: row.monthly,
    workDays: row.workDays,
    workStart: row.workStart,
    workEnd: row.workEnd,
    lunchStart: row.lunchStart,
    lunchEnd: row.lunchEnd,
    otStart: row.otStart,
    remindMin: row.remindMin,
    autoBoot: row.autoBoot,
    excludeHolidays: row.excludeHolidays,
    customHolidays: row.customHolidays,
    tiers: Array.isArray(row.tiers) ? (row.tiers as unknown as WorkConfig['tiers']) : [],
  };
}

function toRecordView(row: {
  date: string;
  checkinAt: string | null;
  overtime: boolean;
  otStart: string | null;
  otEnd: string | null;
}): WorkDayRecord {
  return {
    date: row.date,
    checkinAt: row.checkinAt,
    overtime: row.overtime,
    otStart: row.otStart,
    otEnd: row.otEnd,
  };
}

@Injectable()
export class SalaryService {
  constructor(private readonly prisma: PrismaService) {}

  /** 读取工资配置；没有则按默认值创建一份 */
  async getConfig(userId: string): Promise<WorkConfig> {
    const row = await this.prisma.workConfig.findUnique({ where: { userId } });
    if (row) return toConfigView(row);

    const created = await this.prisma.workConfig.create({
      data: { userId, ...DEFAULT_WORK_CONFIG, tiers: DEFAULT_WORK_CONFIG.tiers },
    });
    return toConfigView(created);
  }

  async updateConfig(userId: string, dto: UpdateWorkConfigDto): Promise<WorkConfig> {
    await this.getConfig(userId);
    const row = await this.prisma.workConfig.update({
      where: { userId },
      data: {
        monthly: dto.monthly,
        workDays: dto.workDays,
        workStart: dto.workStart,
        workEnd: dto.workEnd,
        lunchStart: dto.lunchStart,
        lunchEnd: dto.lunchEnd,
        otStart: dto.otStart,
        remindMin: dto.remindMin,
        autoBoot: dto.autoBoot,
        excludeHolidays: dto.excludeHolidays,
        customHolidays: dto.customHolidays,
        tiers: dto.tiers.map((tier) => ({ time: tier.time, pay: tier.pay })),
      },
    });
    return toConfigView(row);
  }

  private nowHm(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private todayStr(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /** 启动打卡：当日首次启动记录时刻，之后保持不变 */
  async checkin(userId: string): Promise<WorkDayRecord> {
    const date = this.todayStr();
    const row = await this.prisma.workDayRecord.upsert({
      where: { userId_date: { userId, date } },
      update: {},
      create: { userId, date, checkinAt: this.nowHm() },
    });
    return toRecordView(row);
  }

  /** 记录当日加班安排（下班弹窗或提前设置） */
  async setOvertime(userId: string, otEnd: string): Promise<WorkDayRecord> {
    const config = await this.getConfig(userId);
    const date = this.todayStr();
    const row = await this.prisma.workDayRecord.upsert({
      where: { userId_date: { userId, date } },
      update: { overtime: true, otStart: config.otStart, otEnd },
      create: { userId, date, overtime: true, otStart: config.otStart, otEnd },
    });
    return toRecordView(row);
  }

  async getDay(userId: string, date: string): Promise<{ record: WorkDayRecord | null; summary: SalaryDaySummary }> {
    if (!DATE_PATTERN.test(date)) throw new BadRequestException('日期格式应为 YYYY-MM-DD');
    const config = await this.getConfig(userId);
    const row = await this.prisma.workDayRecord.findUnique({
      where: { userId_date: { userId, date } },
    });
    const record = row ? toRecordView(row) : null;
    return { record, summary: daySummary(date, config, record) };
  }

  /** 月度日历聚合 */
  async getCalendar(userId: string, month: string): Promise<SalaryMonthSummary> {
    if (!MONTH_PATTERN.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM');
    const config = await this.getConfig(userId);
    const rows = await this.prisma.workDayRecord.findMany({
      where: { userId, date: { startsWith: month } },
    });
    const records = new Map(rows.map((row) => [row.date, toRecordView(row)]));
    return monthSummary(month, config, records);
  }
}
