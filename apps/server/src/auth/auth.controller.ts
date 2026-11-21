import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { API_PREFIX } from '@maomao/shared';
import type { LoginResult, PublicUser } from '@maomao/shared';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';
import { AuthGuard, type AuthedRequest } from './guards';

@Controller(`${API_PREFIX}/auth`)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthedRequest): PublicUser {
    return request.currentUser!;
  }
}
