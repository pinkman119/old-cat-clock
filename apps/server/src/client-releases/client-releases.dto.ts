import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { CLIENT_PLATFORMS } from '@maomao/shared';
import type { ClientPlatform } from '@maomao/shared';

/** multipart/form-data 中的文本字段，文件字段为 file */
export class UploadClientReleaseDto {
  @IsString()
  @Matches(/^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$/, {
    message: '版本号仅支持字母、数字、点、下划线和短横线，且不超过 32 位',
  })
  version!: string;

  @IsIn(CLIENT_PLATFORMS as unknown as string[])
  platform!: ClientPlatform;

  @IsOptional()
  @IsString()
  @Length(0, 200, { message: '更新说明最多 200 字' })
  note?: string;
}
