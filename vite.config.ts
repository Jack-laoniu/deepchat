/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// --mode widget：打成单个 HTML，作为 ChatGPT Apps / Claude MCP Apps 的内嵌界面
export default defineConfig(({ mode }) => ({
  plugins: mode === 'widget' ? [react(), viteSingleFile()] : [react()],
  build: { outDir: mode === 'widget' ? 'dist-widget' : 'dist' },
  test: { include: ['src/**/*.test.ts'] },
}));
