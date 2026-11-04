import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/* THE PALETTE FOLLOWS `BRAINDOG_ENV`, as in `apps/web/vite.config.ts`: the layout imports
   `@braindog/skin/house.css` by name and an alpha build resolves that name to `alpha.css`. A value
   with no generated palette fails the build rather than shipping production's colours. */
const ENV = process.env.BRAINDOG_ENV ?? '';
const PALETTE = fileURLToPath(new URL(`../../packages/skin/${ENV === '' ? 'house' : ENV}.css`, import.meta.url));
if (!existsSync(PALETTE)) throw new Error(`BRAINDOG_ENV is ${JSON.stringify(ENV)}, and there is no ${PALETTE}.`);

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { alias: [{ find: '@braindog/skin/house.css', replacement: PALETTE }] },
  server: { port: 5184, strictPort: true },
  preview: { port: 5184, strictPort: true },
  /* `:dir(rtl)` stays `:dir(rtl)`: see `apps/web/vite.config.ts`. */
  css: { lightningcss: { exclude: 4 } },
  build: { target: 'es2022', cssMinify: 'lightningcss' },
});
