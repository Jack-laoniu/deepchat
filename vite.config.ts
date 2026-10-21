/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 三种产物：
//   默认         → dist/         独立网页
//   --mode widget → dist-widget/  单文件 HTML，作为 ChatGPT Apps / MCP Apps 的内嵌界面
//   --mode server → dist-server/  MCP 服务器（Node），内嵌上面的单文件 HTML
export default defineConfig(({ mode }) => {
  if (mode === 'server') {
    return {
      // 依赖全部打进一个文件：服务器上只需要 Node，不用 npm install
      ssr: { noExternal: true },
      build: {
        ssr: 'server/index.ts',
        outDir: 'dist-server',
        target: 'node20',
        rollupOptions: { output: { entryFileNames: 'index.js' } },
      },
    };
  }
  return {
    plugins: mode === 'widget' ? [react(), viteSingleFile()] : [react()],
    build: { outDir: mode === 'widget' ? 'dist-widget' : 'dist' },
    test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  };
});
