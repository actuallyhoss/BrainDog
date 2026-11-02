import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/* THE PALETTE FOLLOWS `BRAINDOG_ENV`, as in `apps/web/vite.config.ts`: the layout imports
   `@braindog/skin/house.css` by name and an alpha build resolves that name to `alpha.css`. A value
   with no generated palette fails the build rather than shipping production's colours. */
const ENV = process.env.BRAINDOG_ENV ?? '';
const PALETTE = fileURLToPath(new URL(`../../packages/skin/${ENV === '' ? 'house' : ENV}.css`, import.meta.url));
if (!existsSync(PALETTE)) throw new Error(`BRAINDOG_ENV is ${JSON.stringify(ENV)}, and there is no ${PALETTE}.`);

/* THE BAR'S COLOUR FOR THE BROWSER'S OWN CHROME (`theme-color` in `+layout.svelte`): the app's `--nav`, light and dark,
   read out of the palette this build ships, so it is the generator's value and never one typed here. The palette
   writes the light block first and the dark one under `prefers-color-scheme: dark` second. */
const NAVS = [...readFileSync(PALETTE, 'utf8').matchAll(/--nav:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => m[1]);
if (NAVS.length < 2) throw new Error(`${PALETTE} names no --nav for both schemes, and the bar's theme colour reads it.`);
const SITE_NAV = { light: NAVS[0], dark: NAVS[1] };

export default defineConfig({
  plugins: [sveltekit()],
  define: { __SITE_NAV__: JSON.stringify(SITE_NAV) },
  resolve: { alias: [{ find: '@braindog/skin/house.css', replacement: PALETTE }] },
  server: { port: 5184, strictPort: true },
  preview: { port: 5184, strictPort: true },
  build: { target: 'es2022', cssMinify: 'lightningcss' },
});
