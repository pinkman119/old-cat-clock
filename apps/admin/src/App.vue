<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, hasToken, setToken } from './api';
import type { AdminOverview, LoveNote, PublicUser, UserRole } from '@maomao/shared';

const loggedIn = ref(false);
const currentUser = ref<PublicUser | null>(null);
const serverReady = ref(false);
const busy = ref(false);
const loginError = ref('');
const toastText = ref('');

const loginForm = reactive({ username: 'admin', password: '' });
const createForm = reactive({
  username: '',
  password: '',
  displayName: '',
  role: 'user' as UserRole,
});
const resetTarget = ref<PublicUser | null>(null);
const resetPassword = ref('');

const overview = ref<AdminOverview | null>(null);
const users = ref<PublicUser[]>([]);
const loveNotes = ref<LoveNote[]>([]);
const newLoveNote = ref('');
const editingLove = ref<LoveNote | null>(null);
const editingLoveText = ref('');

let toastTimer: ReturnType<typeof setTimeout> | undefined;

function notify(message: string): void {
  toastText.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastText.value = '';
  }, 2200);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '未知错误';
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false });
}

async function loadData(): Promise<void> {
  try {
    const [nextOverview, nextUsers, nextLoveNotes] = await Promise.all([
      api.overview(),
      api.users(),
      api.loveNotes(),
    ]);
    overview.value = nextOverview;
    users.value = nextUsers;
    loveNotes.value = nextLoveNotes;
    serverReady.value = true;
  } catch (error) {
    notify(errorMessage(error));
    if (!hasToken()) logout();
  }
}

async function login(): Promise<void> {
  loginError.value = '';
  busy.value = true;
  try {
    const result = await api.login({
      username: loginForm.username.trim(),
      password: loginForm.password,
    });
    if (result.user.role !== 'admin') {
      setToken('');
      throw new Error('该账号不是管理员，无法进入管理后台');
    }
    setToken(result.accessToken);
    currentUser.value = result.user;
    loggedIn.value = true;
    loginForm.password = '';
    await loadData();
  } catch (error) {
    loginError.value = errorMessage(error);
  } finally {
    busy.value = false;
  }
}

function logout(): void {
  setToken('');
  loggedIn.value = false;
  currentUser.value = null;
  overview.value = null;
  users.value = [];
  loveNotes.value = [];
}

/** ===== 情话管理 ===== */

async function createLoveNote(): Promise<void> {
  const content = newLoveNote.value.trim();
  if (!content) return;
  try {
    await api.createLoveNote(content);
    newLoveNote.value = '';
    notify('情话已添加，客户端整点会轮换显示');
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

function startEditLove(note: LoveNote): void {
  editingLove.value = note;
  editingLoveText.value = note.content;
}

function cancelEditLove(): void {
  editingLove.value = null;
  editingLoveText.value = '';
}

async function submitEditLove(): Promise<void> {
  const target = editingLove.value;
  const content = editingLoveText.value.trim();
  if (!target || !content) return;
  try {
    await api.updateLoveNote(target.id, content);
    cancelEditLove();
    notify('情话已更新');
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

async function removeLoveNote(note: LoveNote): Promise<void> {
  if (!window.confirm(`确认删除这条情话？\n「${note.content}」`)) return;
  try {
    await api.deleteLoveNote(note.id);
    notify('情话已删除');
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

/** 在后台创建账号：密码只提交给服务端，随后即可在 Electron 客户端登录 */
async function createUser(): Promise<void> {
  try {
    await api.createUser({
      username: createForm.username.trim(),
      password: createForm.password,
      displayName: createForm.displayName.trim() || undefined,
      role: createForm.role,
    });
    Object.assign(createForm, {
      username: '',
      password: '',
      displayName: '',
      role: 'user',
    });
    notify('账号已创建，可直接在 Electron 客户端登录使用');
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

function openReset(user: PublicUser): void {
  resetTarget.value = user;
  resetPassword.value = '';
}

async function submitReset(): Promise<void> {
  const target = resetTarget.value;
  if (!target) return;
  try {
    await api.updateUser(target.id, { password: resetPassword.value });
    notify('密码已重置，请在客户端使用新密码登录');
    resetTarget.value = null;
    resetPassword.value = '';
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

async function removeUser(user: PublicUser): Promise<void> {
  if (!window.confirm(`确认删除账号「${user.username}」？其名下数据也会一并删除。`)) return;
  try {
    await api.deleteUser(user.id);
    notify('账号已删除');
    await loadData();
  } catch (error) {
    notify(errorMessage(error));
  }
}

onMounted(async () => {
  try {
    await api.health();
    serverReady.value = true;
  } catch {
    serverReady.value = false;
  }
  if (hasToken()) {
    try {
      currentUser.value = await api.me();
      loggedIn.value = true;
      await loadData();
    } catch {
      logout();
    }
  }
});
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark"></span>
        <div>
          <h1>耄猫时钟</h1>
          <p>管理后台 · Vue Console</p>
        </div>
      </div>
      <div class="topbar-right">
        <span class="status" :class="serverReady ? 'ok' : 'bad'">
          {{ serverReady ? '服务正常' : '服务端未连接' }}
        </span>
        <button v-if="loggedIn" class="btn" type="button" @click="logout">退出登录</button>
      </div>
    </header>

    <main>
      <section v-if="!loggedIn" class="card login-card">
        <h2>管理员登录</h2>
        <p class="muted" style="margin: 0 0 18px">账户与密码由服务端保存，登录后即可配置客户端使用的账号。</p>
        <form @submit.prevent="login">
          <label>用户名<input v-model="loginForm.username" autocomplete="username" required /></label>
          <label>密码<input v-model="loginForm.password" type="password" autocomplete="current-password" required /></label>
          <p class="error">{{ loginError }}</p>
          <button class="btn primary block" type="submit" :disabled="busy">
            {{ busy ? '登录中…' : '登录' }}
          </button>
        </form>
        <p class="tip">初始账号 <code>admin</code> / <code>maomao123</code>，可在服务端 <code>.env</code> 修改。</p>
      </section>

      <section v-else>
        <div class="notice">
          在此配置的账号与密码保存在服务端，可直接在 Electron 客户端登录使用；情话库由客户端「写给你的话」整点轮换展示。
        </div>

        <div class="stat-grid">
          <div class="stat-card"><span>账号数</span><strong>{{ overview?.totalUsers ?? 0 }}</strong></div>
          <div class="stat-card"><span>待办总数</span><strong>{{ overview?.totalTodos ?? 0 }}</strong></div>
          <div class="stat-card"><span>已完成待办</span><strong>{{ overview?.completedTodos ?? 0 }}</strong></div>
          <div class="stat-card"><span>打卡记录</span><strong>{{ overview?.totalCheckins ?? 0 }}</strong></div>
          <div class="stat-card"><span>加班天数</span><strong>{{ overview?.overtimeDays ?? 0 }}</strong></div>
          <div class="stat-card"><span>情话总数</span><strong>{{ overview?.totalLoveNotes ?? 0 }}</strong></div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>账户与密码配置</h2>
            <span class="muted">当前管理员：{{ currentUser?.displayName }}</span>
          </div>

          <form class="inline-form" @submit.prevent="createUser">
            <input v-model="createForm.username" placeholder="用户名（至少 3 位）" required />
            <input v-model="createForm.password" type="password" placeholder="密码（至少 6 位）" required />
            <input v-model="createForm.displayName" placeholder="显示名（可选）" />
            <select v-model="createForm.role">
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <button class="btn primary" type="submit">新增账号</button>
          </form>

          <div v-if="resetTarget" class="reset-panel">
            <p class="muted" style="margin-bottom: 12px">
              为 <strong>{{ resetTarget?.username }}</strong> 重置密码（新密码至少 6 位）
            </p>
            <form class="inline-form" @submit.prevent="submitReset">
              <input v-model="resetPassword" type="password" placeholder="输入新密码" minlength="6" required />
              <button class="btn primary" type="submit">确认重置</button>
              <button class="btn" type="button" @click="resetTarget = null">取消</button>
            </form>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>用户名</th><th>显示名</th><th>角色</th><th>创建时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="user in users" :key="user.id">
                  <td>{{ user.username }}</td>
                  <td>{{ user.displayName }}</td>
                  <td><span class="tag">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</span></td>
                  <td>{{ formatTime(user.createdAt) }}</td>
                  <td>
                    <div class="cell-actions">
                      <button class="btn" type="button" @click="openReset(user)">重置密码</button>
                      <button class="btn danger" type="button" @click="removeUser(user)">删除</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!users.length"><td colspan="5" class="empty">暂无账号</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>情话管理 ·「写给你的话」</h2>
            <span class="muted">客户端每小时按日期+小时确定性轮换一条</span>
          </div>

          <form class="inline-form" @submit.prevent="createLoveNote">
            <input
              v-model="newLoveNote"
              placeholder="新情话（1-120 字，重复内容无法保存）"
              maxlength="120"
              style="flex: 1 1 320px"
              required
            />
            <button class="btn primary" type="submit">添加情话</button>
          </form>

          <div v-if="editingLove" class="reset-panel">
            <p class="muted" style="margin-bottom: 12px">编辑情话（{{ formatTime(editingLove.createdAt) }} 创建）</p>
            <form class="inline-form" @submit.prevent="submitEditLove">
              <input
                v-model="editingLoveText"
                maxlength="120"
                placeholder="修改后的内容"
                style="flex: 1 1 320px"
                required
              />
              <button class="btn primary" type="submit">保存修改</button>
              <button class="btn" type="button" @click="cancelEditLove">取消</button>
            </form>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>内容</th><th>创建时间</th><th>操作</th></tr>
              </thead>
              <tbody>
                <tr v-for="note in loveNotes" :key="note.id">
                  <td class="love-cell">「{{ note.content }}」</td>
                  <td>{{ formatTime(note.createdAt) }}</td>
                  <td>
                    <div class="cell-actions">
                      <button class="btn" type="button" @click="startEditLove(note)">编辑</button>
                      <button class="btn danger" type="button" @click="removeLoveNote(note)">删除</button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!loveNotes.length"><td colspan="3" class="empty">情话库为空，客户端将一直显示兜底文案</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>

    <div class="toast" :class="{ show: toastText }">{{ toastText }}</div>
  </div>
</template>
