import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ClientDownloadsController, ClientReleasesController } from './client-releases.controller';
import { ClientReleasesService } from './client-releases.service';

@Module({
  // AdminGuard 依赖 UsersService，需与 AdminModule 一样同时引入 UsersModule
  imports: [AuthModule, UsersModule],
  controllers: [ClientReleasesController, ClientDownloadsController],
  providers: [ClientReleasesService],
  exports: [ClientReleasesService],
})
export class ClientReleasesModule {}
