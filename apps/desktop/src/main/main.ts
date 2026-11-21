import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, safeStorage, shell, Notification, Menu, Tray, nativeImage, screen } from 'electron';
import { APP_NAME, APP_VERSION, DEFAULT_SERVER_URL } from '@maomao/shared';
import type { WorkConfig } from '@maomao/shared';
import { ServerClient } from './server-client';

/** 服务端地址优先级：环境变量 > 打包时生成的 server-config.json > 本机默认地址 */
function resolveServerUrl(): string {
  const fromEnv = process.env.MAOMAO_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  try {
    const configPath = join(app.getAppPath(), 'server-config.json');
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, 'utf8')) as { serverUrl?: string };
      if (config.serverUrl) return config.serverUrl.replace(/\/+$/, '');
    }
  } catch {
    /* 配置缺失或损坏时回退到本机默认地址 */
  }
  return DEFAULT_SERVER_URL;
}

const serverUrl = resolveServerUrl();
const client = new ServerClient(serverUrl);

/**
 * 窗口即卡片：圆角直接贴窗口边缘，无边框/阴影/透明余量。
 * 宽度严格按原型（全屏 404、缩放 430）；全屏版高度约为原来的 2/3 再加 1/6，
 * 被盖住的内容由 w-body 滚轮滚动查看。缩放版为卡片自然高度，无底部提示。
 */
const WINDOW_SIZE = {
  full: { width: 404, height: 587 },
  compact: { width: 430, height: 203 },
} as const;

/** 系统图标：与主界面「甲骨文猫」logo 同款；Windows 用多尺寸 ICO，其他平台用 PNG */
const ASSETS_DIR = join(__dirname, '..', '..', 'assets');
const TRAY_ICON_PATH = join(ASSETS_DIR, process.platform === 'win32' ? 'tray.ico' : 'tray.png');
const APP_ICON_PATH = join(ASSETS_DIR, process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');
const NOTIFICATION_ICON_PATH = join(ASSETS_DIR, 'app-icon.png');

/** 当前窗口模式 + 缩小前的全屏版位置（展开时还原） */
let windowMode: 'full' | 'compact' = 'full';
let fullWindowPosition: { x: number; y: number } | null = null;

/* ============ 登录态：safeStorage 加密落盘，重启免登录 ============ */

const tokenFile = () => join(app.getPath('userData'), 'auth-token.bin');

function persistToken(token: string): void {
  try {
    const data = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(token)
      : Buffer.from(token, 'utf8');
    writeFileSync(tokenFile(), data);
  } catch {
    /* 落盘失败仅影响下次启动需重新登录 */
  }
}

function loadPersistedToken(): string | null {
  try {
    if (!existsSync(tokenFile())) return null;
    const raw = readFileSync(tokenFile());
    return safeStorage.isEncryptionAvailable() && !raw.equals(Buffer.from(raw.toString('utf8'), 'utf8'))
      ? safeStorage.decryptString(raw)
      : raw.toString('utf8');
  } catch {
    return null;
  }
}

function clearPersistedToken(): void {
  try {
    if (existsSync(tokenFile())) writeFileSync(tokenFile(), '');
  } catch {
    /* ignore */
  }
}

/* ============ 摸鱼魔盒：主进程直连三方 API（无 CORS） ============ */

async function fetchMoyuImage(): Promise<{ url: string }> {
  const url = `https://picsum.photos/600/400?t=${Date.now()}`;
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  if (!response) throw new Error('图片服务不可达');
  return { url: response.url || url };
}

async function fetchMoyuPoem(): Promise<{ title: string; meta: string; lines: string[] }> {
  const response = await fetch('https://poetry.palemoky.com/api/poems/random?lang=zh-Hans');
  if (!response.ok) throw new Error(`poem http ${response.status}`);
  const json = (await response.json()) as {
    data?: { title?: string; content?: string | string[]; author?: { name?: string }; dynasty?: { name?: string } };
  };
  const data = json.data;
  if (!data) throw new Error('poem no data');
  const meta = [data.dynasty?.name, data.author?.name].filter(Boolean).join(' · ') || '佚名';
  const lines = Array.isArray(data.content) ? data.content : String(data.content ?? '').split('\n');
  return { title: data.title || '无题', meta, lines };
}

async function fetchMoyuSaying(): Promise<{ text: string }> {
  const response = await fetch('https://uapis.cn/api/v1/saying');
  if (!response.ok) throw new Error(`saying http ${response.status}`);
  const json = (await response.json()) as { text?: string; saying?: string; content?: string };
  const text = json.text || json.saying || json.content;
  if (!text) throw new Error('saying no text');
  return { text: String(text) };
}

/* ============ IPC 分发 ============ */

interface InvokeRequest {
  action: string;
  payload?: Record<string, unknown>;
}

interface InvokeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

/**
 * IPC 统一分发：所有业务逻辑最终都由 NestJS 提供，主进程只负责请求转发与令牌保管。
 * 新能力在此添加 action，并在 preload.ts 暴露同名方法即可。
 */
async function dispatch(request: InvokeRequest): Promise<unknown> {
  const payload = request.payload ?? {};
  const date = typeof payload.date === 'string' ? payload.date : '';

  switch (request.action) {
    case 'config':
      return { serverUrl, appName: APP_NAME, version: APP_VERSION };

    case 'health':
      return client.health();

    // ===== 账户 =====
    case 'login': {
      const result = await client.login(
        String(payload.username ?? ''),
        String(payload.password ?? ''),
      );
      client.setToken(result.accessToken);
      persistToken(result.accessToken);
      return result;
    }
    case 'logout':
      client.setToken(null);
      clearPersistedToken();
      return true;
    case 'me':
      return client.me();
    /** 启动时恢复登录态：token 有效则返回用户，否则返回 null */
    case 'restore-session': {
      if (!client.hasToken()) return null;
      try {
        return await client.me();
      } catch {
        client.setToken(null);
        return null;
      }
    }

    // ===== 薪资 =====
    case 'salary:get-config':
      return client.getSalaryConfig();
    case 'salary:save-config':
      return client.saveSalaryConfig(payload.config as unknown as WorkConfig);
    case 'salary:checkin':
      return client.checkin();
    case 'salary:set-overtime':
      return client.setOvertime(String(payload.otEnd ?? ''));
    case 'salary:day':
      return client.getSalaryDay(date);
    case 'salary:calendar':
      return client.getSalaryCalendar(String(payload.month ?? ''));

    // ===== 待办 =====
    case 'todos:list':
      return client.listTodos(date);
    case 'todos:create':
      return client.createTodo({
        text: String(payload.text ?? ''),
        remindAt: String(payload.remindAt ?? ''),
        date,
      });
    case 'todos:update':
      return client.updateTodo(
        String(payload.id ?? ''),
        payload.changes as { text?: string; remindAt?: string; done?: boolean },
      );
    case 'todos:delete':
      await client.deleteTodo(String(payload.id ?? ''));
      return true;
    case 'todos:clear':
      return client.clearTodos(date);

    // ===== 小记 / 情话 =====
    case 'notes:get':
      return client.getNote(date);
    case 'notes:save':
      return client.saveNote(date, String(payload.content ?? ''));
    case 'love:current':
      return client.getLoveNote();

    // ===== 摸鱼魔盒 =====
    case 'moyu:img':
      return fetchMoyuImage();
    case 'moyu:poem':
      return fetchMoyuPoem();
    case 'moyu:saying':
      return fetchMoyuSaying();

    // ===== 应用控制 =====
    case 'app:set-mode': {
      const mode = payload.mode === 'compact' ? 'compact' : 'full';
      const win = BrowserWindow.getAllWindows()[0];
      if (win && mode !== windowMode) {
        if (mode === 'compact') {
          // 缩小前记住全屏版位置，展开时还原
          const [x, y] = win.getPosition();
          fullWindowPosition = { x, y };
          windowMode = 'compact';
          win.setContentSize(WINDOW_SIZE.compact.width, WINDOW_SIZE.compact.height);
        } else {
          windowMode = 'full';
          win.setContentSize(WINDOW_SIZE.full.width, WINDOW_SIZE.full.height);
          if (fullWindowPosition) {
            const saved = fullWindowPosition;
            fullWindowPosition = null;
            // 还原缩小前的位置，并夹紧到所在屏幕可视区内，避免跑出屏幕
            const { workArea } = screen.getDisplayNearestPoint({ x: saved.x, y: saved.y });
            const x = Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - WINDOW_SIZE.full.width);
            const y = Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - WINDOW_SIZE.full.height);
            win.setPosition(Math.round(x), Math.round(y));
          }
        }
      }
      return mode;
    }
    case 'app:close': {
      // 点 × 只是退到后台（隐藏窗口），托盘「退出」才是真正退出
      mainWindow?.hide();
      return true;
    }
    case 'app:boot-status':
      return app.getLoginItemSettings().openAtLogin;
    case 'app:set-boot': {
      const enabled = payload.enabled === true;
      app.setLoginItemSettings({ openAtLogin: enabled });
      return app.getLoginItemSettings().openAtLogin;
    }
    case 'app:notify': {
      new Notification({
        title: String(payload.title ?? APP_NAME),
        body: String(payload.body ?? ''),
        icon: NOTIFICATION_ICON_PATH,
      }).show();
      return true;
    }

    default:
      throw new Error(`未知操作: ${request.action}`);
  }
}

/* ============ 窗口 ============ */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function showMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** 系统托盘：点 × 只是隐藏到后台，托盘「退出」才是真正退出 */
function createTray(): void {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip('耄猫时钟 · 给她的带薪时钟');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示带薪时钟', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else showMainWindow();
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.full.width,
    height: WINDOW_SIZE.full.height,
    resizable: false,
    fullscreenable: false,
    frame: false,
    transparent: true,
    // 显式声明完全透明背景，避免 Windows 上窗口顶部出现系统默认的矩形底色
    backgroundColor: '#00000000',
    roundedCorners: true,
    title: APP_NAME,
    icon: APP_ICON_PATH,
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 注：transparent 窗口在 Windows 上不触发 ready-to-show，直接显示（透明窗口无白闪）
  // 点 × / Alt+F4：不退出，只隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadFile(join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  // 启动即恢复登录态（safeStorage 解密）
  const token = loadPersistedToken();
  if (token) client.setToken(token);

  ipcMain.handle(
    'maomao:invoke',
    async (_event, request: InvokeRequest): Promise<InvokeResponse> => {
      try {
        return { ok: true, data: await dispatch(request) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : '未知错误' };
      }
    },
  );

  createWindow();
  createTray();
  app.on('activate', () => showMainWindow());
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

void bootstrap();
