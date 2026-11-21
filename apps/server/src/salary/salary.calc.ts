import { HOLIDAYS_2026, MAKEUP_2026 } from '@maomao/shared';
import type { OtTier, SalaryDaySummary, SalaryMonthSummary, WorkConfig, WorkDayRecord } from '@maomao/shared';

const HOLIDAYS = new Set<string>(HOLIDAYS_2026);
const MAKEUPS = new Set<string>(MAKEUP_2026);

export function timeToMin(time: string): number {
  const [h, m] = String(time || '0:0').split(':');
  return Number(h) * 60 + (Number(m) || 0);
}

export function minToTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function dailySalary(config: WorkConfig): number {
  return config.monthly / Math.max(1, config.workDays);
}

/** 法定假日（开启剔除后不计薪） */
export function isHoliday(dateStr: string, config: WorkConfig): boolean {
  if (!config.excludeHolidays) return false;
  return HOLIDAYS.has(dateStr) || config.customHolidays.includes(dateStr);
}

/** 调休上班日 */
export function isMakeup(dateStr: string, config: WorkConfig): boolean {
  return config.excludeHolidays && MAKEUPS.has(dateStr) && !isHoliday(dateStr, config);
}

export function isWorkDay(dateStr: string, config: WorkConfig): boolean {
  if (isHoliday(dateStr, config)) return false;
  if (isMakeup(dateStr, config)) return true;
  const [, , day] = dateStr.split('-').map(Number);
  const [y, m] = dateStr.split('-').map(Number);
  const dow = new Date(y, m - 1, day).getDay();
  return dow !== 0 && dow !== 6;
}

/** 加班费：达到的档位里取最高（与原型 otPay 一致） */
export function otPay(record: Pick<WorkDayRecord, 'overtime' | 'otEnd'>, tiers: OtTier[]): number {
  if (!record?.overtime) return 0;
  const end = timeToMin(record.otEnd ?? '20:40');
  let pay = 0;
  for (const tier of tiers) {
    if (end >= timeToMin(tier.time)) pay = Math.max(pay, tier.pay);
  }
  return pay;
}

/** 某天统计：打卡推算下班 + 净工时/加班时长 + 基本工资与加班费 */
export function daySummary(
  dateStr: string,
  config: WorkConfig,
  record: WorkDayRecord | null,
): SalaryDaySummary {
  const work = isWorkDay(dateStr, config);
  const startMin = config.autoBoot && record?.checkinAt
    ? timeToMin(record.checkinAt)
    : timeToMin(config.workStart);
  const span = timeToMin(config.workEnd) - timeToMin(config.workStart);
  const rest = Math.max(0, timeToMin(config.lunchEnd) - timeToMin(config.lunchStart));
  const otMin = record?.overtime
    ? Math.max(0, timeToMin(record.otEnd ?? '20:40') - timeToMin(record.otStart ?? config.otStart))
    : 0;
  const netMin = work ? Math.max(0, span - rest) : 0;
  const base = work ? dailySalary(config) : 0;
  const ot = otPay(
    { overtime: record?.overtime ?? false, otEnd: record?.otEnd ?? null },
    config.tiers,
  );

  return {
    date: dateStr,
    isWork: work,
    holiday: isHoliday(dateStr, config),
    makeup: isMakeup(dateStr, config),
    overtime: record?.overtime ?? false,
    checkinAt: record?.checkinAt ?? null,
    start: minToTime(startMin),
    end: minToTime(startMin + span),
    netMin,
    otMin,
    totalMin: netMin + otMin,
    base,
    ot,
    pay: base + ot,
  };
}

/** 月度聚合：逐天统计 + 汇总 */
export function monthSummary(
  month: string,
  config: WorkConfig,
  records: Map<string, WorkDayRecord>,
): SalaryMonthSummary {
  const [year, mon] = month.split('-').map(Number);
  const monthDays = new Date(year, mon, 0).getDate();

  const days: SalaryDaySummary[] = [];
  let totalMin = 0;
  let totalPay = 0;
  let workDays = 0;
  let otDays = 0;

  for (let d = 1; d <= monthDays; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const summary = daySummary(dateStr, config, records.get(dateStr) ?? null);
    days.push(summary);
    totalMin += summary.totalMin;
    totalPay += summary.pay;
    if (summary.isWork) workDays++;
    if (summary.overtime) otDays++;
  }

  return {
    month,
    days,
    monthDays,
    workDays,
    restDays: monthDays - workDays,
    otDays,
    totalMin,
    totalPay,
    avgMin: workDays ? Math.round(totalMin / workDays) : 0,
  };
}
