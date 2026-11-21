import { basename, extname, resolve, sep } from 'node:path';
import {
  CLIENT_FILE_EXTENSIONS,
  CLIENT_MAX_SIZE_MB,
  CLIENT_PLATFORMS,
} from '@maomao/shared';
import type { ClientPlatform } from '@maomao/shared';

/**
 * 安装包存放目录。编译后本文件位于 apps/server/dist/client-releases/，
 * 因此 ../.. 恒为 apps/server；也可通过环境变量指向挂载了持久卷的目录。
 */
export const RELEASES_DIR = process.env.MAOMAO_CLIENT_RELEASES_DIR
  ? resolve(process.env.MAOMAO_CLIENT_RELEASES_DIR)
  : resolve(__dirname, '..', '..', 'storage', 'client-releases');

function maxFileSize(): number {
  const configured = Number(process.env.MAOMAO_CLIENT_MAX_SIZE_MB ?? CLIENT_MAX_SIZE_MB);
  const mb = Number.isFinite(configured) && configured > 0 ? configured : CLIENT_MAX_SIZE_MB;
  return Math.floor(mb * 1024 * 1024);
}

export const MAX_CLIENT_FILE_SIZE = maxFileSize();

export const ALLOWED_EXTENSIONS_TEXT = (CLIENT_FILE_EXTENSIONS as readonly string[]).join(' / ');

/** multer 内存模式收到的文件（避免校验失败时在磁盘留下孤儿文件） */
export interface UploadedClientFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function isClientPlatform(value: unknown): value is ClientPlatform {
  return typeof value === 'string' && (CLIENT_PLATFORMS as readonly string[]).includes(value);
}

/** 只允许白名单后缀；返回空串表示应拒绝该上传 */
export function resolveClientExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.tar.gz')) return '.tar.gz';
  const ext = extname(lower);
  return (CLIENT_FILE_EXTENSIONS as readonly string[]).includes(ext) ? ext : '';
}

/** 去掉浏览器可能带上的路径，防止路径穿越与响应头注入 */
export function safeFileName(originalName: string): string {
  const name = basename(originalName.replace(/\\/g, '/')).replace(/[\r\n"\\]/g, '_');
  return name.slice(0, 180) || 'client-installer';
}

/** 把数据库里的磁盘文件名限制在存储目录内 */
export function releaseFilePath(storageName: string): string | null {
  const filePath = resolve(RELEASES_DIR, storageName);
  return filePath.startsWith(RELEASES_DIR + sep) ? filePath : null;
}
