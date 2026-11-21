import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { CreateUserPayload, LoginPayload, UpdateUserPayload, UserRole } from '@maomao/shared';

export class LoginDto implements LoginPayload {
  @IsString()
  @Length(1, 64)
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;
}

export class CreateUserDto implements CreateUserPayload {
  @IsString()
  @Length(3, 64)
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: '用户名只能包含字母、数字、_、-、.' })
  username!: string;

  @IsString()
  @Length(6, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  displayName?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: UserRole;
}

/** 在管理后台重置密码 / 修改显示名与角色 */
export class UpdateUserDto implements UpdateUserPayload {
  @IsOptional()
  @IsString()
  @Length(6, 128)
  password?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  displayName?: string;

  @IsOptional()
  @IsIn(['admin', 'user'])
  role?: UserRole;
}
