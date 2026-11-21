import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { CreateTodoPayload, UpdateTodoPayload } from '@maomao/shared';

const HHMM = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTodoDto implements CreateTodoPayload {
  @IsString()
  @Length(1, 40)
  text!: string;

  @IsString()
  @Matches(HHMM, { message: '提醒时间格式应为 HH:MM' })
  remindAt!: string;

  @IsString()
  @Matches(DATE, { message: '日期格式应为 YYYY-MM-DD' })
  date!: string;
}

export class UpdateTodoDto implements UpdateTodoPayload {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  text?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: '提醒时间格式应为 HH:MM' })
  remindAt?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class ClearTodosDto {
  @IsIn(['completed'])
  scope!: string;
}
