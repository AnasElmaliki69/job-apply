import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: 1420, strictPort: true,
    // Tauri watches/rebuilds Rust itself. Vite must not watch locked build executables.
    watch: { ignored: ['**/src-tauri/**'] },
    fs: {
      // Share Board validation in development without serving the whole repository.
      allow: ['.', '../../src/lib', '../../node_modules'].map(path => fileURLToPath(new URL(path, import.meta.url))),
      deny: ['.env', '.env.*', '**/.git/**', '**/private/**', '*.{crt,pem}'],
    },
  },
});
