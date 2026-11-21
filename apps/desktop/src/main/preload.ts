import { contextBridge, ipcRenderer } from 'electron';

interface InvokeResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function invoke<T>(action: string, payload?: Record<string, unknown>): Promise<T> {
  const response = (await ipcRenderer.invoke('maomao:invoke', { action, payload })) as InvokeResponse<T>;
  if (!response.ok) throw new Error(response.error ?? '请求失败');
  return response.data as T;
}

/**
 * 预置给渲染进程的交互接口：渲染层只通过 window.desktopApi 访问 NestJS，
 * 不直接发起业务 HTTP 请求（摸鱼魔盒由主进程直连三方）。
 * 基础 config/health；账户 login/logout/me/restoreSession；
 * 薪资 getSalaryConfig/saveSalaryConfig/checkin/setOvertime/getSalaryDay/getSalaryCalendar；
 * 待办 listTodos/createTodo/updateTodo/deleteTodo/clearTodos；
 * 小记 getNote/saveNote；情话 getLoveNote；应用 setMode/closeApp/getBootStatus/setBoot/notify。
 */
contextBridge.exposeInMainWorld('desktopApi', {
  // 基础
  getConfig: () => invoke('config'),
  checkHealth: () => invoke('health'),

  // 账户
  login: (username: string, password: string) => invoke('login', { username, password }),
  logout: () => invoke('logout'),
  me: () => invoke('me'),
  restoreSession: () => invoke('restore-session'),

  // 薪资
  getSalaryConfig: () => invoke('salary:get-config'),
  saveSalaryConfig: (config: Record<string, unknown>) =>
    invoke('salary:save-config', { config }),
  checkin: () => invoke('salary:checkin'),
  setOvertime: (otEnd: string) => invoke('salary:set-overtime', { otEnd }),
  getSalaryDay: (date: string) => invoke('salary:day', { date }),
  getSalaryCalendar: (month: string) => invoke('salary:calendar', { month }),

  // 待办
  listTodos: (date: string) => invoke('todos:list', { date }),
  createTodo: (text: string, remindAt: string, date: string) =>
    invoke('todos:create', { text, remindAt, date }),
  updateTodo: (id: string, changes: Record<string, unknown>) =>
    invoke('todos:update', { id, changes }),
  deleteTodo: (id: string) => invoke('todos:delete', { id }),
  clearTodos: (date: string) => invoke('todos:clear', { date }),

  // 小记 / 情话
  getNote: (date: string) => invoke('notes:get', { date }),
  saveNote: (date: string, content: string) => invoke('notes:save', { date, content }),
  getLoveNote: () => invoke('love:current'),

  // 摸鱼魔盒（主进程直连三方 API）
  moyuImage: () => invoke('moyu:img'),
  moyuPoem: () => invoke('moyu:poem'),
  moyuSaying: () => invoke('moyu:saying'),

  // 应用控制
  setMode: (mode: 'full' | 'compact') => invoke('app:set-mode', { mode }),
  closeApp: () => invoke('app:close'),
  getBootStatus: () => invoke('app:boot-status'),
  setBoot: (enabled: boolean) => invoke('app:set-boot', { enabled }),
  notify: (title: string, body: string) => invoke('app:notify', { title, body }),
});
