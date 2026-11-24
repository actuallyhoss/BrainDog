/**
 * `#drawers` IN THE APP (`apps/web/vite.config.ts`): no drawer in hand, each its own chunk, fetched the first time a
 * page holds its kind (`lazy.ts`).
 */
import type { Drawer, Drawers, LazyKind } from './lazy.ts';

export const held: Drawers['held'] = {};

export const fetched: Drawers['fetched'] = {
  forecast: () => import('./Forecast.svelte'),
  series: () => import('./Series.svelte'),
  lines: () => import('./Lines.svelte'),
  split: () => import('./Split.svelte'),
  bridge: () => import('./Bridge.svelte'),
  calendar: () => import('./Calendar.svelte'),
  form: () => import('./Form.svelte'),
  lanes: () => import('./Lanes.svelte'),
  gallery: () => import('./Gallery.svelte'),
  embed: () => import('./Embed.svelte'),
  inputs: () => import('./Inputs.svelte'),
  agents: () => import('./Agents.svelte'),
} satisfies Record<LazyKind, () => Promise<{ default: Drawer }>>;
