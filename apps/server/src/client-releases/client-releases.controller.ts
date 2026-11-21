import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { API_PREFIX } from '@maomao/shared';
import type { ClientRelease } from '@maomao/shared';
import type { Response } from 'express';
import { AdminGuard } from '../auth/guards';
import {
  ALLOWED_EXTENSIONS_TEXT,
  MAX_CLIENT_FILE_SIZE,
  resolveClientExtension,
  type UploadedClientFile,
} from './client-releases.constants';
import { UploadClientReleaseDto } from './client-releases.dto';
import { ClientReleasesService } from './client-releases.service';

const uploadOptions = {
  limits: { fileSize: MAX_CLIENT_FILE_SIZE, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { originalname: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ): void => {
    if (!resolveClientExtension(file.originalname)) {
      callback(new BadRequestException(`仅支持 ${ALLOWED_EXTENSIONS_TEXT} 格式的安装包`), false);
      return;
    }
    callback(null, true);
  },
};

function setDownloadHeaders(res: Response, release: ClientRelease): void {
  const encoded = encodeURIComponent(release.fileName);
  const ascii = release.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', release.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);
  res.setHeader('Content-Length', String(release.size));
  res.setHeader('Cache-Control', 'no-cache');
}

function streamDownload(
  res: Response,
  releases: ClientReleasesService,
  target: Awaited<ReturnType<ClientReleasesService['findForDownload']>>,
): StreamableFile {
  setDownloadHeaders(res, target.release);
  void releases.recordDownload(target.release.id);
  return new StreamableFile(createReadStream(target.path));
}

/** 管理后台：列表 / 上传 / 下载 / 删除，全部要求管理员令牌 */
@Controller(`${API_PREFIX}/admin/client-releases`)
@UseGuards(AdminGuard)
export class ClientReleasesController {
  constructor(private readonly releases: ClientReleasesService) {}

  @Get()
  list(): Promise<ClientRelease[]> {
    return this.releases.list();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  create(
    @Body() dto: UploadClientReleaseDto,
    @UploadedFile() file: UploadedClientFile,
  ): Promise<ClientRelease> {
    return this.releases.create(dto, file);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return streamDownload(res, this.releases, await this.releases.findForDownload(id));
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<{ id: string }> {
    await this.releases.remove(id);
    return { id };
  }
}

/** 公开分发：无需登录即可查看与下载，方便把安装包链接直接发给使用者 */
@Controller(`${API_PREFIX}/client-downloads`)
export class ClientDownloadsController {
  constructor(private readonly releases: ClientReleasesService) {}

  @Get()
  list(@Query('platform') platform?: string): Promise<ClientRelease[]> {
    return this.releases.list(platform);
  }

  @Get('latest/file')
  async downloadLatest(
    @Query('platform') platform: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return streamDownload(res, this.releases, await this.releases.findLatestForDownload(platform));
  }

  @Get(':id/file')
  async download(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return streamDownload(res, this.releases, await this.releases.findForDownload(id));
  }
}
