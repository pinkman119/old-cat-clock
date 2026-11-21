export const APP_NAME = '耄猫时钟';
export const APP_VERSION = '0.1.0';

export const API_PREFIX = 'api';
export const DEFAULT_SERVER_PORT = 3000;
export const DEFAULT_SERVER_URL = `http://127.0.0.1:${DEFAULT_SERVER_PORT}`;

/** HH:MM 时间格式 */
export const HHMM_PATTERN = /^\d{2}:\d{2}$/;

/** 默认工资配置（与设计原型一致） */
export const DEFAULT_WORK_CONFIG = {
  monthly: 12000,
  workDays: 21,
  workStart: '09:00',
  workEnd: '18:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
  otStart: '18:00',
  remindMin: 60,
  autoBoot: false,
  excludeHolidays: false,
  customHolidays: [] as string[],
  tiers: [
    { time: '19:30', pay: 30 },
    { time: '20:40', pay: 60 },
    { time: '22:10', pay: 100 },
  ],
};

/**
 * 国务院办公厅《2026年部分节假日安排》国办发明电〔2025〕7号
 * 法定假日（不计薪）与调休上班日（照常计薪）
 */
export const HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
] as const;

export const MAKEUP_2026 = [
  '2026-01-04', '2026-02-14', '2026-02-28',
  '2026-05-09', '2026-09-20', '2026-10-10',
] as const;

/** 客户端安装包：支持的平台 */
export const CLIENT_PLATFORMS = ['windows', 'macos', 'linux', 'other'] as const;

/** 客户端安装包：允许上传的后缀（.tar.gz 由服务端单独识别） */
export const CLIENT_FILE_EXTENSIONS = [
  '.exe', '.msi', '.dmg', '.pkg', '.zip', '.7z',
  '.appimage', '.deb', '.rpm', '.apk', '.tar.gz',
] as const;

/** 客户端安装包：单文件默认大小上限（MB），可用 MAOMAO_CLIENT_MAX_SIZE_MB 覆盖 */
export const CLIENT_MAX_SIZE_MB = 300;
