import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminGuard, AuthGuard } from './guards';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('MAOMAO_JWT_SECRET') ?? 'maomao-dev-only-secret',
        signOptions: {
          expiresIn: (config.get<string>('MAOMAO_JWT_EXPIRES') ?? '7d') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AdminGuard],
  exports: [JwtModule, AuthService, AuthGuard, AdminGuard],
})
export class AuthModule {}
