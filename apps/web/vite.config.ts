import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
  build: { target: 'es2022', cssMinify: 'lightningcss' },
});
