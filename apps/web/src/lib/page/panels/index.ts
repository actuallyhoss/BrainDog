/**
 * The host panels, one loader each, by the name a section gives it (`panel-of.ts`, the kernel's `PANEL_TABLE`).
 *
 * A PANEL IS AN EXISTING SCREEN PART, MOUNTED AND NOT REWRITTEN (PGS-A17). The five about a row are the page's own
 * (`Actions`, `Reporting`, `RunPanel`, `Seen`, `Job`); the ones about the record are the look editor of Appearance, the Slash
 * model form of Agents, the ladder of trust under Agents (`TrustRows`), whether Slash reads on its own (`SlashReads`),
 * the reader's own agent keys (`MyTokens`, which reads `ownTokens` and so lists the reader's keys and nobody else's) and
 * one button over the new scheduled action sheet (`NewActionPanel`). Each is handed whether the reader owns the record;
 * the ones that take no prop guard themselves, drawing nothing where the record refuses. So a screen can become a
 * declared page without its hard part being written again.
 *
 * EVERY LOADER IS AN `import()`, and nothing imports this file at the top of one the shell loads: `BlockSlot.svelte`
 * reaches it by `import()` too, so no panel, and none of its styles, is in the entry chunk.
 */

import type { Component } from 'svelte';
import { PANEL_WHO, type Panel } from './panel-of.ts';

/* `any` BECAUSE EACH PANEL TAKES ITS OWN PROPS; `BlockSlot.svelte` hands each the ones it was written for. */
type Loaded = { default: Component<any> };

export const PANEL_LOADERS: Readonly<Record<Panel, () => Promise<Loaded>>> = {
  actions: () => import('./Actions.svelte'),
  reporting: () => import('./Reporting.svelte'),
  run: () => import('./RunPanel.svelte'),
  seen: () => import('./Seen.svelte'),
  job: () => import('./Job.svelte'),
  'look-editor': () => import('$lib/theme/LookEditor.svelte'),
  'slash-model': () => import('$lib/ui/SlashModel.svelte'),
  trust: () => import('$lib/ui/TrustRows.svelte'),
  'slash-reads': () => import('$lib/ui/SlashReads.svelte'),
  'my-keys': () => import('../../../routes/settings/[area]/areas/MyTokens.svelte'),
  'new-action': () => import('./NewActionPanel.svelte'),
};

/** What `panel` is about: the row the page is drawn for, or nothing, so it stands on any page. */
export function panelNeeds(panel: Panel): 'row' | 'none' {
  return PANEL_WHO[panel].needs;
}
