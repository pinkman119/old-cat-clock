import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LoveModule } from '../love/love.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [AuthModule, UsersModule, LoveModule],
  controllers: [AdminController],
})
export class AdminModule {}
