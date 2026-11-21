import type {
  AdminOverview,
  CreateUserPayload,
  LoveNote,
  LoginPayload,
  LoginResult,
  PublicUser,
  UpdateUserPayload,
} from '@maomao/shared';

const TOKEN_KEY = 'maomao.console.token';
let token = localStorage.getItem(TOKEN_KEY) ?? '';

export function setToken(value: string): void {
  token = value;
  if (value) localStorage.setItem(TOKEN_KEY, value);
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return token.length > 0;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new Error('无法连接服务端，请确认 NestJS 已启动');
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = Array.isArray(data.message)
      ? data.message.join('；')
      : (data.message as string | undefined);
    if (response.status === 401) setToken('');
    throw new Error(message || `请求失败 (${response.status})`);
  }
  return data as unknown as T;
}

/** 所有后台逻辑都经由 NestJS 的 REST API，不直接访问任何数据文件 */
export const api = {
  health: () => request<{ status: string }>('/health'),

  login: (payload: LoginPayload) =>
    request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  me: () => request<PublicUser>('/auth/me'),

  overview: () => request<AdminOverview>('/admin/overview'),

  users: () => request<PublicUser[]>('/admin/users'),

  createUser: (payload: CreateUserPayload) =>
    request<PublicUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** 配置既有账号：重置密码 / 改显示名 / 改角色 */
  updateUser: (id: string, payload: UpdateUserPayload) =>
    request<PublicUser>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteUser: (id: string) =>
    request<{ id: string }>(`/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ===== 情话管理（客户端「写给你的话」数据源） =====

  loveNotes: () => request<LoveNote[]>('/admin/love-notes'),

  createLoveNote: (content: string) =>
    request<LoveNote>('/admin/love-notes', {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  updateLoveNote: (id: string, content: string) =>
    request<LoveNote>(`/admin/love-notes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteLoveNote: (id: string) =>
    request<void>(`/admin/love-notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
