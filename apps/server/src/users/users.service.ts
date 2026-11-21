import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { CreateUserPayload, PublicUser, UpdateUserPayload, UserRole } from '@maomao/shared';
import { hashPassword } from '../common/password';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 首次启动且用户表为空时，按环境变量创建默认管理员 */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;

    const username = process.env.MAOMAO_ADMIN_USERNAME ?? 'admin';
    const password = process.env.MAOMAO_ADMIN_PASSWORD ?? 'maomao123';
    await this.create({ username, password, displayName: '管理员', role: 'admin' });
    this.logger.warn(`已创建默认管理员 [${username}]，请登录后及时修改初始密码配置`);
  }

  toPublic(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...rest } = user;
    return {
      ...rest,
      role: user.role as UserRole,
      createdAt: user.createdAt.toISOString(),
    };
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { username } });
  }

  list(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } }).then((users) => users.map((u) => this.toPublic(u)));
  }

  async create(payload: CreateUserPayload): Promise<PublicUser> {
    const username = payload.username.trim();
    const exists = await this.findByUsername(username);
    if (exists) throw new ConflictException('该用户名已存在');

    const user = await this.prisma.user.create({
      data: {
        username,
        displayName: payload.displayName?.trim() || username,
        role: payload.role ?? 'user',
        passwordHash: hashPassword(payload.password),
      },
    });
    return this.toPublic(user);
  }

  /** 管理后台配置账号：重置密码、修改显示名或角色 */
  async update(id: string, payload: UpdateUserPayload): Promise<PublicUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('用户不存在');

    if (payload.role === 'user' && user.role === 'admin' && (await this.adminCount()) <= 1) {
      throw new BadRequestException('至少需要保留一个管理员账号');
    }

    const user2 = await this.prisma.user.update({
      where: { id },
      data: {
        ...(payload.password !== undefined ? { passwordHash: hashPassword(payload.password) } : {}),
        ...(payload.displayName !== undefined
          ? { displayName: payload.displayName.trim() || user.username }
          : {}),
        ...(payload.role !== undefined ? { role: payload.role } : {}),
      },
    });
    return this.toPublic(user2);
  }

  private adminCount(): Promise<number> {
    return this.prisma.user.count({ where: { role: 'admin' } });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('用户不存在');
    if (user.role === 'admin' && (await this.adminCount()) <= 1) {
      throw new BadRequestException('至少需要保留一个管理员账号');
    }
    await this.prisma.user.delete({ where: { id } });
  }
}
