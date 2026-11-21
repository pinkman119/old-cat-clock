import type {
  AdminOverview,
  ClientPlatform,
  ClientRelease,
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

function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(response: Response): Promise<Error> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const message = Array.isArray(data.message)
    ? data.message.join('；')
    : (data.message as string | undefined);
  if (response.status === 401) setToken('');
  return new Error(message || `请求失败 (${response.status})`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
    });
  } catch {
    throw new Error('无法连接服务端，请确认 NestJS 已启动');
  }

  if (!response.ok) throw await readError(response);
  return (await response.json().catch(() => ({}))) as unknown as T;
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

  // ===== 客户端安装包管理 =====

  clientReleases: () => request<ClientRelease[]>('/admin/client-releases'),

  /** FormData 不能复用 JSON 封装；用 XHR 是为了拿到上传进度 */
  uploadClientRelease: (
    payload: { version: string; platform: ClientPlatform; note: string; file: File },
    onProgress?: (percent: number) => void,
  ): Promise<ClientRelease> =>
    new Promise<ClientRelease>((resolve, reject) => {
      const form = new FormData();
      form.append('version', payload.version.trim());
      form.append('platform', payload.platform);
      form.append('note', payload.note.trim());
      form.append('file', payload.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/client-releases');
      for (const [key, value] of Object.entries(authHeaders())) {
        xhr.setRequestHeader(key, value);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        let data: Record<string, unknown> = {};
        try {
          data = JSON.parse(xhr.responseText) as Record<string, unknown>;
        } catch {
          // 非 JSON 响应按状态码处理
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          if (xhr.status === 401) setToken('');
          const message = Array.isArray(data.message)
            ? data.message.join('；')
            : (data.message as string | undefined);
          reject(new Error(message || `上传失败 (${xhr.status})`));
          return;
        }
        resolve(data as unknown as ClientRelease);
      };
      xhr.onerror = () => reject(new Error('无法连接服务端，请确认 NestJS 已启动'));
      xhr.send(form);
    }),

  /** 下载必须带管理员令牌，不能用 <a href> 直接跳转 */
  downloadClientRelease: async (release: ClientRelease): Promise<void> => {
    let response: Response;
    try {
      response = await fetch(
        `/api/admin/client-releases/${encodeURIComponent(release.id)}/download`,
        { headers: authHeaders() },
      );
    } catch {
      throw new Error('无法连接服务端，请确认 NestJS 已启动');
    }
    if (!response.ok) throw await readError(response);

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = release.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },

  deleteClientRelease: (id: string) =>
    request<{ id: string }>(`/admin/client-releases/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  /** 无需登录的公开下载地址，可直接发给使用者 */
  publicClientDownloadUrl: (id: string): string =>
    `${window.location.origin}/api/client-downloads/${encodeURIComponent(id)}/file`,
};
