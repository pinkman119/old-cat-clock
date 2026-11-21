#!/usr/bin/env node
'use strict';

/**
 * 清空全部业务数据，只保留一个 huimin / 20001024 管理员账号。
 * 该账号 role=admin，既能进管理后台，也能登录 Electron 客户端。
 * 本机运行：node deploy/reset-db.cjs
 * 容器内运行：node /app/deploy/reset-db.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, scryptSync } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  const envFile = path.resolve(__dirname, '..', 'apps', 'server', '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function clearReleaseFiles() {
  const dir = process.env.MAOMAO_CLIENT_RELEASES_DIR
    || path.resolve(__dirname, '..', 'apps', 'server', 'storage', 'client-releases');
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      removed += 1;
    } catch {
      /* 单个文件删除失败不阻断重置 */
    }
  }
  return removed;
}

function loadLoveNoteSeed() {
  const candidates = [
    path.resolve(__dirname, '..', 'apps', 'server', 'dist', 'love', 'love-notes.seed.js'),
    '/app/apps/server/dist/love/love-notes.seed.js',
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const seed = require(file).LOVE_NOTE_SEED;
    if (Array.isArray(seed)) return seed;
  }
  return [];
}

async function main() {
  loadLocalEnv();
  if (!process.env.DATABASE_URL) throw new Error('缺少 DATABASE_URL，请先配置数据库连接');

  const username = process.env.MAOMAO_ADMIN_USERNAME || 'huimin';
  const password = process.env.MAOMAO_ADMIN_PASSWORD || '20001024';
  const prisma = new PrismaClient();

  try {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Todo", "DayNote", "WorkDayRecord", "WorkConfig", "LoveNote", "ClientRelease", "User" RESTART IDENTITY CASCADE',
    );
    const removedFiles = clearReleaseFiles();

    const user = await prisma.user.create({
      data: {
        username,
        displayName: username,
        role: 'admin',
        passwordHash: hashPassword(password),
      },
    });

    const seeds = loadLoveNoteSeed();
    if (seeds.length) {
      await prisma.loveNote.createMany({
        data: seeds.map((content) => ({ content })),
        skipDuplicates: true,
      });
    }

    console.log(`数据已清零，唯一账号: ${user.username} / ${password}（role=${user.role}）`);
    console.log(`已恢复内置情话: ${seeds.length} 条；已删除安装包文件: ${removedFiles} 个`);
    console.log('当前各表记录数:', await Promise.all([
      prisma.user.count(),
      prisma.todo.count(),
      prisma.dayNote.count(),
      prisma.workDayRecord.count(),
      prisma.workConfig.count(),
      prisma.loveNote.count(),
      prisma.clientRelease.count(),
    ]).then(([User, Todo, DayNote, WorkDayRecord, WorkConfig, LoveNote, ClientRelease]) => ({
      User, Todo, DayNote, WorkDayRecord, WorkConfig, LoveNote, ClientRelease,
    })));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('数据库重置失败:', error);
  process.exit(1);
});
