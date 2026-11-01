import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'node:path';

const r = (p: string) => resolve(import.meta.dirname, p);

/** 产物打成传统脚本，不放 type="module"。
 *  扩展页能加载 module，但「直接双击 dist/newtab.html 预览」时 file:// 下的 module
 *  会被 CORS 拦死 —— 老版本双击就能预览，这条不能丢。 */
function classicScript() {
  return {
    name: 'bd-classic-script',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/<link rel="stylesheet" crossorigin/g, '<link rel="stylesheet"');
    },
  };
}

export default defineConfig({
  // 源码在 app/，构建产物直接丢到仓库根的 dist/ —— 那个目录就是「加载已解压的扩展程序」要选的目录
  root: r('app'),
  base: './', // chrome-extension:// 下必须是相对路径
  publicDir: r('app/public'),
  resolve: {
    alias: { '@': r('app/src') },
  },
  plugins: [react(), classicScript()],
  // 不用 postcss.config.js：Vite 的根目录是 app/，配置文件的查找路径容易踩空，
  // 这里把插件写死，tailwind.config.ts 用绝对路径指回去。
  css: {
    postcss: {
      plugins: [tailwindcss(r('tailwind.config.ts')), autoprefixer()],
    },
  },
  build: {
    outDir: r('dist'),
    emptyOutDir: true,
    target: 'chrome110',
    sourcemap: true,
    // iife 单文件里用不到 modulepreload 的 polyfill，关掉可少一段 import.meta 警告
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/newtab.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
      input: { newtab: r('app/newtab.html') },
    },
  },
  server: { port: 5173, strictPort: true },
});
