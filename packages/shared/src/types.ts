export type UserRole = 'admin' | 'user';

/** 对外暴露的用户信息，绝不包含密码哈希 */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

/** 持久化在 PostgreSQL 中的用户（Prisma User 模型的对外形态） */
export interface StoredUser extends PublicUser {
  passwordHash: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: PublicUser;
}

export interface CreateUserPayload {
  username: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}

/** 管理后台配置既有账号：重置密码、改显示名或角色 */
export interface UpdateUserPayload {
  password?: string;
  displayName?: string;
  role?: UserRole;
}

/* ============ 带薪时钟 ============ */

/** 加班工资梯度：到点时间 -> 应得加班费 */
export interface OtTier {
  time: string;
  pay: number;
}

/** 每个用户的工资/工时配置（原型 cfg 的服务器形态） */
export interface WorkConfig {
  monthly: number;
  workDays: number;
  workStart: string;
  workEnd: string;
  lunchStart: string;
  lunchEnd: string;
  otStart: string;
  remindMin: number;
  autoBoot: boolean;
  excludeHolidays: boolean;
  customHolidays: string[];
  tiers: OtTier[];
}

/** 某日的工作记录：启动打卡时刻 + 加班安排 */
export interface WorkDayRecord {
  date: string;
  checkinAt: string | null;
  overtime: boolean;
  otStart: string | null;
  otEnd: string | null;
}

/** 待办（原型 xinguang_todos 的服务器形态） */
export interface Todo {
  id: string;
  text: string;
  remindAt: string;
  date: string;
  done: boolean;
  createdAt: string;
}

export interface CreateTodoPayload {
  text: string;
  remindAt: string;
  date: string;
}

export interface UpdateTodoPayload {
  text?: string;
  remindAt?: string;
  done?: boolean;
}

/** 每日小记 */
export interface DayNote {
  date: string;
  content: string;
}

/** 服务器计算的某天统计 */
export interface SalaryDaySummary {
  date: string;
  isWork: boolean;
  /** 法定假日或自定义剔除日（开启剔除后） */
  holiday: boolean;
  /** 调休上班日 */
  makeup: boolean;
  overtime: boolean;
  checkinAt: string | null;
  /** 打卡/配置的上班时刻 */
  start: string;
  /** 推算的下班时刻 */
  end: string;
  netMin: number;
  otMin: number;
  totalMin: number;
  base: number;
  ot: number;
  pay: number;
}

/** 月度日历聚合 */
export interface SalaryMonthSummary {
  month: string;
  days: SalaryDaySummary[];
  monthDays: number;
  workDays: number;
  restDays: number;
  otDays: number;
  totalMin: number;
  totalPay: number;
  avgMin: number;
}

/** 情话：每小时一句，Vue 后台维护 */
export interface LoveNote {
  id: string;
  content: string;
  createdAt: string;
}

export interface AdminOverview {
  totalUsers: number;
  totalTodos: number;
  completedTodos: number;
  totalCheckins: number;
  overtimeDays: number;
  totalLoveNotes: number;
}
