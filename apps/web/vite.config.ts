import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * WHICH RECORD THIS BUILD SHOWS — `BRAINDOG_VARIANT`, and it exists because three separate findings
 * pointed at the same missing thing.
 *
 * The app renders one seed, so every screen that BRANCHES on a fact about the record has a half no
 * gate can reach: `/search`'s disclosure for a group with no door needs eleven decisions and the seed
 * has four; the two designed empty states on `/settings/agents` need a record with no machines and
 * no keys; and every Cloud sentence needs a record that is not self-hosted. The last of those shipped
 * eight sentences that drew nowhere, and `dead-copy` counted them as rendered because it greps
 * source.
 *
 * A BUILD FLAG RATHER THAN A RUNTIME SWITCH. A `?variant=` parameter would be a product surface
 * nobody asked for, and a `window.__seed` hook would be a dev door shipping to production. `define`
 * substitutes a literal at build time, so the shipped bundle contains one record and the constant
 * folds away — there is nothing to reach at run time because there is nothing there.
 *
 * `''` is the shipped record. Every other value is a variant, and `data.ts` is the only file that
 * reads it.
 *
 * WHERE THE BUILD GOES IS `svelte.config.js`'S, not this file's. `build.outDir` is in SvelteKit's
 * enforced config, so setting it here did nothing except print *"the following Vite config options
 * will be overridden by SvelteKit"* on every build — four times, once per record.
 */
const VARIANT = process.env.BRAINDOG_VARIANT ?? '';

export default defineConfig({
  plugins: [sveltekit()],
  define: { __BRAINDOG_VARIANT__: JSON.stringify(VARIANT) },
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
  build: { target: 'es2022', cssMinify: 'lightningcss' },
});
