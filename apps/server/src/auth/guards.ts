import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PublicUser } from '@maomao/shared';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './auth.service';

export interface AuthedRequest extends Request {
  currentUser?: PublicUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    protected readonly jwt: JwtService,
    protected readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice(7)
      : null;
    if (!token) throw new UnauthorizedException('请先登录');

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      const user = await this.users.findById(payload.sub);
      if (!user) throw new UnauthorizedException('登录已失效');
      request.currentUser = this.users.toPublic(user);
      return true;
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }
}

@Injectable()
export class AdminGuard extends AuthGuard {
  constructor(jwt: JwtService, users: UsersService) {
    super(jwt, users);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await super.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.currentUser?.role !== 'admin') {
      throw new ForbiddenException('需要管理员权限');
    }
    return true;
  }
}
