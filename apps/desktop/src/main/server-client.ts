import type {
  LoginResult,
  PublicUser,
  SalaryDaySummary,
  SalaryMonthSummary,
  Todo,
  WorkConfig,
  WorkDayRecord,
} from '@maomao/shared';

/**
 * 主进程中的 HTTP 客户端：token 只保存在主进程内存，
 * renderer 通过 preload 的 contextBridge 间接访问，避免跨域与凭据泄露。
 */
export class ServerClient {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  hasToken(): boolean {
    return this.token !== null;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new Error('无法连接服务端，请确认后台已启动');
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const message = Array.isArray(data.message)
        ? data.message.join('；')
        : (data.message as string | undefined);
      if (response.status === 401) this.token = null;
      throw new Error(message || `请求失败 (${response.status})`);
    }
    return data as T;
  }

  health(): Promise<{ status: string }> {
    return this.request('/api/health');
  }

  login(username: string, password: string): Promise<LoginResult> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  me(): Promise<PublicUser> {
    return this.request('/api/auth/me');
  }

  // ===== 薪资 =====

  getSalaryConfig(): Promise<WorkConfig> {
    return this.request('/api/salary/config');
  }

  saveSalaryConfig(config: WorkConfig): Promise<WorkConfig> {
    return this.request('/api/salary/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }

  checkin(): Promise<WorkDayRecord> {
    return this.request('/api/salary/checkin', { method: 'POST' });
  }

  setOvertime(otEnd: string): Promise<WorkDayRecord> {
    return this.request('/api/salary/overtime', {
      method: 'PUT',
      body: JSON.stringify({ otEnd }),
    });
  }

  getSalaryDay(date: string): Promise<{ record: WorkDayRecord | null; summary: SalaryDaySummary }> {
    return this.request(`/api/salary/day/${encodeURIComponent(date)}`);
  }

  getSalaryCalendar(month: string): Promise<SalaryMonthSummary> {
    return this.request(`/api/salary/calendar?month=${encodeURIComponent(month)}`);
  }

  // ===== 待办 =====

  listTodos(date: string): Promise<Todo[]> {
    return this.request(`/api/todos?date=${encodeURIComponent(date)}`);
  }

  createTodo(payload: { text: string; remindAt: string; date: string }): Promise<Todo> {
    return this.request('/api/todos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateTodo(id: string, changes: { text?: string; remindAt?: string; done?: boolean }): Promise<Todo> {
    return this.request(`/api/todos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    });
  }

  deleteTodo(id: string): Promise<void> {
    return this.request(`/api/todos/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  clearTodos(date: string): Promise<{ count: number }> {
    return this.request(`/api/todos/completed?date=${encodeURIComponent(date)}`, {
      method: 'DELETE',
    });
  }

  // ===== 小记 / 情话 =====

  getNote(date: string): Promise<{ date: string; content: string }> {
    return this.request(`/api/notes/${encodeURIComponent(date)}`);
  }

  saveNote(date: string, content: string): Promise<{ date: string; content: string }> {
    return this.request(`/api/notes/${encodeURIComponent(date)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  getLoveNote(): Promise<{ content: string }> {
    return this.request('/api/love-notes/current');
  }
}
