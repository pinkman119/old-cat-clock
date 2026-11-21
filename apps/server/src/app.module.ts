import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ClientReleasesModule } from './client-releases/client-releases.module';
import { LoveModule } from './love/love.module';
import { NotesModule } from './notes/notes.module';
import { PrismaModule } from './prisma/prisma.module';
import { SalaryModule } from './salary/salary.module';
import { TodosModule } from './todos/todos.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    SalaryModule,
    TodosModule,
    NotesModule,
    LoveModule,
    AdminModule,
    ClientReleasesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
