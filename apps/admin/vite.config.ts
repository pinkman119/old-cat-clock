import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// 管理后台是独立 Web 应用，开发时通过代理把 /api 转发到 NestJS 服务端，
// 生产构建产物可部署到任意静态服务器（服务端 CORS 已放开）。
const serverUrl = process.env.MAOMAO_SERVER_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [vue()],
  // 共享包产物是 CommonJS（__exportStar 动态再导出），Rollup 无法静态识别具名导出。
  // 直接指向 TS 源码，让 Vite 以 ESM 编译，dev 与 build 行为一致。
  resolve: {
    alias: {
      '@maomao/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // 同时监听 IPv4 / IPv6，确保 127.0.0.1 与 localhost 都可访问
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: serverUrl,
        changeOrigin: true,
      },
    },
  },
});
