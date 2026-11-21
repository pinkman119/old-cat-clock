import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { LoveController } from './love.controller';
import { LoveNotesService } from './love-notes.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [LoveController],
  providers: [LoveNotesService],
  exports: [LoveNotesService],
})
export class LoveModule {}
