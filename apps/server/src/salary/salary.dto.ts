import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import type { OtTier, WorkConfig } from '@maomao/shared';

const HHMM = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class OtTierDto implements OtTier {
  @IsString()
  @Matches(HHMM, { message: '到点时间格式应为 HH:MM' })
  time!: string;

  @IsInt()
  @Min(0)
  @Max(100000)
  pay!: number;
}

export class UpdateWorkConfigDto implements WorkConfig {
  @IsInt()
  @Min(1)
  @Max(100000000)
  monthly!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  workDays!: number;

  @IsString()
  @Matches(HHMM)
  workStart!: string;

  @IsString()
  @Matches(HHMM)
  workEnd!: string;

  @IsString()
  @Matches(HHMM)
  lunchStart!: string;

  @IsString()
  @Matches(HHMM)
  lunchEnd!: string;

  @IsString()
  @Matches(HHMM)
  otStart!: string;

  @IsInt()
  @Min(1)
  @Max(480)
  remindMin!: number;

  @IsBoolean()
  autoBoot!: boolean;

  @IsBoolean()
  excludeHolidays!: boolean;

  @IsArray()
  @ArrayMaxSize(64)
  @Matches(DATE, { each: true, message: '假日日期格式应为 YYYY-MM-DD' })
  customHolidays!: string[];

  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => OtTierDto)
  tiers!: OtTierDto[];
}

export class SetOvertimeDto {
  @IsString()
  @Matches(HHMM, { message: '加班结束时间格式应为 HH:MM' })
  otEnd!: string;
}
