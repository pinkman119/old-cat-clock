import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, promises as fs } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ClientRelease as ClientReleaseRow } from '@prisma/client';
import type { ClientRelease } from '@maomao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UploadClientReleaseDto } from './client-releases.dto';
import {
  ALLOWED_EXTENSIONS_TEXT,
  RELEASES_DIR,
  isClientPlatform,
  releaseFilePath,
  resolveClientExtension,
  safeFileName,
  type UploadedClientFile,
} from './client-releases.constants';

export interface DownloadTarget {
  release: ClientRelease;
  path: string;
}

function toPublic(row: ClientReleaseRow): ClientRelease {
  return {
    id: row.id,
    version: row.version,
    platform: isClientPlatform(row.platform) ? row.platform : 'other',
    fileName: row.fileName,
    size: row.size,
    mimeType: row.mimeType,
    note: row.note,
    downloadCount: row.downloadCount,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ClientReleasesService {
  constructor(private readonly prisma: PrismaService) {
    mkdirSync(RELEASES_DIR, { recursive: true });
  }

  async list(platform?: string): Promise<ClientRelease[]> {
    const where = isClientPlatform(platform) ? { platform } : {};
    const rows = await this.prisma.clientRelease.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublic);
  }

  async create(dto: UploadClientReleaseDto, file: UploadedClientFile | undefined): Promise<ClientRelease> {
    if (!file?.buffer?.length) throw new BadRequestException('请选择要上传的客户端安装包');

    const fileName = safeFileName(file.originalname);
    const extension = resolveClientExtension(fileName);
    if (!extension) {
      throw new BadRequestException(`仅支持 ${ALLOWED_EXTENSIONS_TEXT} 格式的安装包`);
    }

    const storageName = `${randomUUID()}${extension}`;
    const filePath = join(RELEASES_DIR, storageName);
    await fs.writeFile(filePath, file.buffer);

    try {
      const row = await this.prisma.clientRelease.create({
        data: {
          version: dto.version.trim(),
          platform: dto.platform,
          fileName,
          storageName,
          size: file.buffer.length,
          mimeType: file.mimetype || 'application/octet-stream',
          note: dto.note?.trim() ?? '',
        },
      });
      return toPublic(row);
    } catch (error) {
      // 入库失败时清掉刚写入的文件，避免产生无记录的孤儿安装包
      await fs.rm(filePath, { force: true });
      throw error;
    }
  }

  async findForDownload(id: string): Promise<DownloadTarget> {
    const row = await this.prisma.clientRelease.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('安装包不存在或已被删除');
    return this.toDownload(row);
  }

  /** 公开入口：按平台取最新上传的一份，未传平台则取全部里最新的一份 */
  async findLatestForDownload(platform?: string): Promise<DownloadTarget> {
    const where = isClientPlatform(platform) ? { platform } : {};
    const row = await this.prisma.clientRelease.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new NotFoundException('暂无可用的客户端安装包');
    return this.toDownload(row);
  }

  async recordDownload(id: string): Promise<void> {
    try {
      await this.prisma.clientRelease.update({
        where: { id },
        data: { downloadCount: { increment: 1 } },
      });
    } catch {
      // 计数失败不影响下载本身
    }
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.clientRelease.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('安装包不存在或已被删除');
    const filePath = releaseFilePath(row.storageName);
    await this.prisma.clientRelease.delete({ where: { id } });
    if (filePath) await fs.rm(filePath, { force: true });
  }

  private toDownload(row: ClientReleaseRow): DownloadTarget {
    const filePath = releaseFilePath(row.storageName);
    if (!filePath || !existsSync(filePath)) {
      throw new NotFoundException('安装包文件已丢失，请在后台重新上传');
    }
    return { release: toPublic(row), path: filePath };
  }
}
