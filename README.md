# 耄猫时钟 · Old Cat Clock

给她的带薪时钟：npm workspaces monorepo，三端职责，

| 端 | 技术 | 职责 |
| --- | --- | --- |
| 客户端 `apps/desktop` | Electron（无边框双视图小窗） | **带薪时钟 widget**：时钟/待办/日历/设置四页 + 摸鱼魔盒；每秒本地计算已赚薪资与进度，打卡、待办、小记、情话、配置全部存服务端 |
| 管理后台 `apps/admin` | Vue 3 + Vite | **独立 Web 页面**：管理员登录、账号配置、数据概览、情话库维护（客户端「写给你的话」数据源） |
| 服务端 `apps/server` | NestJS + Prisma 6 | **唯一逻辑与数据层**：REST API + JWT 鉴权；数据持久化在 PostgreSQL 16（Docker 容器） |
| 共享包 `packages/shared` | TypeScript | 三端复用的类型、常量（默认工时配置、2026 节假日常量） |

> 设计原型：`doc/salary-clock.html`（浏览器版）。本仓库是它的产品化落地：localStorage 全部迁入 PostgreSQL，计算口径与原型保持一致。

## 功能总览

- **带薪时钟**：今日已赚（逐位翻滚计数器）、进度条（含午休时段条）、下班倒计时、每小时一句「写给你的话」、收益脉冲动效
- **加班**：倒计时归零弹「是否加班」，或点倒计时卡片提前设置；按梯度到点结算，到点撒花；日历/当天统计均含加班时长与加班费
- **待办**：按日期时间线、到点系统通知 + 应用内提醒、勾选/删除/清除已完成
- **日历**：月度聚合（总工时/已获薪资/平均时长/出勤/休息/加班），点日期看当天统计 + 当天感悟 + 当天待办；内置 2026 年 33 天法定假与 6 天调休
- **设置**：月薪/工时/午休/加班梯度/提醒间隔/剔除节假日（可加自定义剔除日），保存到服务端，换设备一致
- **开机自启并打卡**：Electron `setLoginItemSettings` 真自启；启动时刻写入打卡记录，autoBoot 开启时按打卡时间推算下班
- **缩放版**：`−` 收成迷你小窗（窗口同步缩为 448×272），`↗` 展开
- **摸鱼魔盒**：随机图片 / 随机古诗 / 莫名其妙的话（主进程直连三方 API，网络异常本地兜底）
- **登录态**：safeStorage（Windows DPAPI）加密落盘，重启免登录

## 目录结构

```
old-cat-clock/
├── package.json                 # monorepo 根配置（workspaces + 统一脚本）
├── tsconfig.base.json
├── doc/salary-clock.html        # 设计原型（浏览器版，仅参考）
├── apps/
│   ├── server/                  # @maomao/server · NestJS + Prisma
│   │   ├── docker-compose.yml   # postgres:16-alpine，宿主端口 15432，卷持久化
│   │   ├── prisma/schema.prisma # User/WorkConfig/Todo/DayNote/WorkDayRecord/LoveNote
│   │   ├── src/
│   │   │   ├── prisma/          # PrismaService（全局模块）
│   │   │   ├── users/           # 账号服务、默认管理员初始化
│   │   │   ├── auth/            # 登录、JWT、AuthGuard/AdminGuard
│   │   │   ├── salary/          # 薪资配置/打卡/加班/日统计/月聚合（salary.calc 纯函数）
│   │   │   ├── todos/           # 待办 CRUD（按账号+日期隔离）
│   │   │   ├── notes/           # 每日小记（空内容即删除）
│   │   │   ├── love/            # 情话（空表自动写入 18 条种子；按日+小时确定性选句）
│   │   │   └── admin/           # 管理接口（概览、账号、情话维护）
│   │   ├── .env / .env.example
│   │   └── data/                # 已废弃（数据全部进 PostgreSQL）
│   ├── admin/                   # @maomao/admin · Vue 3 + Vite
│   │   ├── vite.config.ts      # 5173 端口 + /api 代理到 NestJS
│   │   └── src/{main.ts,App.vue,api.ts,style.css}
│   └── desktop/                 # @maomao/desktop · Electron
│       └── src/
│           ├── main/            # 主进程：无边框窗口、safeStorage 登录态、IPC 分发、魔盒 fetch
│           │   ├── main.ts
│           │   ├── preload.ts  # contextBridge 暴露 window.desktopApi
│           │   └── server-client.ts
│           └── renderer/       # index.html / styles.css / app.js（原型移植）
└── packages/shared/             # @maomao/shared · 类型 + DEFAULT_WORK_CONFIG + 2026 节假日
```

## 环境要求

- Node.js >= 20、npm >= 10
- Docker Desktop（含独立二进制 `docker-compose`；本机若装了 compose 插件亦可）

## 快速开始

```bash
# 1. 根目录安装全部 workspace 依赖（postinstall 自动 prisma generate）
npm install

# 2. 复制服务端配置，按需修改默认管理员与 JWT 密钥
cp apps/server/.env.example apps/server/.env

# 3. 启动 PostgreSQL 容器（postgres:16，宿主 127.0.0.1:15432）
npm run db:up -w @maomao/server

# 4. 执行数据库迁移（生成表结构）
npm run prisma:migrate -w @maomao/server

# 5. 启动 NestJS + Vue 管理后台
npm run dev
```

| 入口 | 地址 / 命令 |
| --- | --- |
| NestJS 健康检查 | `http://127.0.0.1:3000/api/health` |
| Vue 管理后台 | `http://127.0.0.1:5173/` |
| Electron 客户端 | `npm run dev:desktop` |

分端命令：`npm run dev:server` / `npm run dev:admin` / `npm run dev:desktop`；`npm run dev:all` 同时启动三端。其他：`npm run build`（四包依次构建）、`npm run typecheck`。数据库：`npm run db:down -w @maomao/server`（数据卷保留）。

**默认管理员**：`admin` / `maomao123`（首次启动且账号表为空时自动创建，可在 `.env` 修改）。密码以 `scrypt` 哈希存入 PostgreSQL，永不明文落盘。

## 使用流程

1. 浏览器打开 `http://127.0.0.1:5173/`，用默认管理员登录。
2. 在「账户与密码配置」中为 TA 新增账号；在「情话管理」中维护情话库（客户端整点轮换展示）。
3. 打包好 Electron 客户端后，在「客户端安装包」中上传（填写版本号、平台、更新说明）；后台可直接下载，也可复制公开链接分发给使用者。
4. 启动 Electron 客户端，用该账号登录：无边框 widget 小窗即带薪时钟；登录态加密保存，重启免登录。
5. 客户端「设置」页可调薪资与工时；「开机自启并打卡」开关同时写入系统自启项与服务端配置。

> 安全约束：系统至少保留一个管理员账号，删除或降级最后一个管理员会被服务端拒绝。

## 配置项

服务端 `apps/server/.env`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://maomao:maomao123@127.0.0.1:15432/maomao_clock?schema=public` | Prisma 连接串（端口 15432，避开本机 5432/5433 冲突） |
| `MAOMAO_SERVER_PORT` | `3000` | API 端口 |
| `MAOMAO_JWT_SECRET` | 开发用固定值 | JWT 密钥，生产必须替换 |
| `MAOMAO_JWT_EXPIRES` | `7d` | 令牌有效期 |
| `MAOMAO_ADMIN_USERNAME` | `admin` | 初始管理员用户名 |
| `MAOMAO_ADMIN_PASSWORD` | `maomao123` | 初始管理员密码 |
| `MAOMAO_CLIENT_RELEASES_DIR` | `apps/server/storage/client-releases` | 后台上传的客户端安装包存放目录（生产建议挂持久卷） |
| `MAOMAO_CLIENT_MAX_SIZE_MB` | `300` | 单个安装包上传大小上限（MB） |

Vue 后台开发时由 `vite.config.ts` 把 `/api` 代理到 `MAOMAO_SERVER_URL`（默认 `http://127.0.0.1:3000`）；Electron 主进程同样读取该环境变量决定服务端地址。生产构建产物 `apps/admin/dist` 可部署到任意静态服务器（服务端 CORS 已放开）。

客户端安装包存放在 `apps/server/storage/client-releases/`（可通过 `MAOMAO_CLIENT_RELEASES_DIR` 改到持久卷），该目录已加入 `.gitignore`；生产部署时请备份此目录，否则重新部署后已上传的安装包会丢失。

## 关键设计

1. **服务端是唯一逻辑中心**：Vue 后台与 Electron 客户端都经由 NestJS REST API 读写；`AuthGuard`/`AdminGuard` 区分登录用户与管理员。
2. **计算口径双端一致**：客户端每秒本地算「已赚/进度/倒计时」（原型算法原样移植）；服务端 `salary.calc.ts` 用同一口径算 `daySummary`/`monthSummary` 供日历与详情聚合。节假日/调休由 `@maomao/shared` 常量在服务端判定后随统计下发。
3. **Electron 三层结构**：渲染层 → `preload` 的 `contextBridge`（`window.desktopApi`）→ 主进程 IPC 分发 → `ServerClient`（HTTP）。令牌只在主进程：内存保管 + safeStorage 加密落盘 `userData/auth-token.bin`。
4. **无边框双视图窗口**：`frame:false` + `-webkit-app-region: drag`；全屏版 448×744、缩放版 448×272，`setContentSize` 切换。
5. **三方魔盒无 CORS 问题**：图片/诗歌/怪话由主进程 `fetch`，渲染层只收结果；失败时本地兜底文案。
6. **情话确定性轮换**：服务器按「日期×24+小时」做 sin 哈希选句，同一小时全网一致、跨小时自动换新；内容在 Vue 后台维护。
7. **客户端安装包分发**：后台以 `multipart/form-data` 上传，文件写入服务端磁盘、版本与大小等元数据存入 `ClientRelease` 表；管理端下载带令牌，公开链接无需登录即可分发，下载次数自动累计。

## REST API

除登录、健康检查与 `/api/client-downloads/*` 外，均需 `Authorization: Bearer <token>`；`/api/admin/*` 还需管理员角色。

| 方法 | 路径 | 说明 | 使用方 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查 | 两端 |
| POST | `/api/auth/login` | 账户密码登录 | 两端 |
| GET | `/api/auth/me` | 当前用户 | 两端 |
| GET / PUT | `/api/salary/config` | 读取/保存工资工时配置 | 客户端 |
| POST | `/api/salary/checkin` | 启动打卡（当日首次记录时刻） | 客户端 |
| PUT | `/api/salary/overtime` | 记录加班（`otEnd`） | 客户端 |
| GET | `/api/salary/day/:date` | 当日记录 + 统计 | 客户端 |
| GET | `/api/salary/calendar?month=` | 月度聚合 | 客户端 |
| GET / POST | `/api/todos?date=` | 待办列表 / 新建 | 客户端 |
| PATCH / DELETE | `/api/todos/:id` | 更新 / 删除待办 | 客户端 |
| DELETE | `/api/todos/completed?date=` | 清除某日已完成 | 客户端 |
| GET / PUT | `/api/notes/:date` | 读 / 存每日小记（空即删） | 客户端 |
| GET | `/api/love-notes/current` | 当前小时情话 | 客户端 |
| GET | `/api/admin/overview` | 统计概览（账号/待办/打卡/加班/情话） | Vue 后台 |
| GET / POST | `/api/admin/users` | 账号列表 / 新增 | Vue 后台 |
| PATCH / DELETE | `/api/admin/users/:id` | 重置密码等 / 删除账号 | Vue 后台 |
| GET / POST | `/api/admin/love-notes` | 情话列表 / 新增 | Vue 后台 |
| PATCH / DELETE | `/api/admin/love-notes/:id` | 编辑 / 删除情话 | Vue 后台 |
| GET / POST | `/api/admin/client-releases` | 安装包列表 / 上传（multipart：`version`、`platform`、`note`、`file`） | Vue 后台 |
| GET | `/api/admin/client-releases/:id/download` | 后台下载安装包（带令牌） | Vue 后台 |
| DELETE | `/api/admin/client-releases/:id` | 删除安装包（记录与文件） | Vue 后台 |
| GET | `/api/client-downloads?platform=` | 公开安装包列表 | 分发页面 |
| GET | `/api/client-downloads/latest/file?platform=` | 公开下载指定平台最新版 | 分发链接 |
| GET | `/api/client-downloads/:id/file` | 公开下载指定版本 | 分发链接 |

## 后续可演进方向

- 接入 `electron-builder` 打包客户端，生产环境使用 HTTPS 与随机 JWT 密钥
- 增加修改密码（需旧密码）、账号禁用、操作日志
- 日历支持多账户视图 / 年度报表
