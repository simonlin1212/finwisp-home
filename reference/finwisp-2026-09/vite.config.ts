import { defineConfig } from 'vite';

export default defineConfig({
  server: { host: '127.0.0.1', port: 1420, strictPort: true, allowedHosts: ['127.0.0.1'],
    proxy: { '/api': { target: 'http://127.0.0.1:1421', changeOrigin: false } },
    watch: { ignored: ['**/src-tauri/**', '**/.local/**', '**/dist-host/**'] }, fs: {
    strict: true, allow: [process.cwd()],
    deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**', '**/.local/**', '**/*.sqlite*'],
  } },
  clearScreen: false,
});
