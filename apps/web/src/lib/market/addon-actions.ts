/**
 * What the add-ons that are on let a person start from the app: entries in the command bar and actions in a row's menu
 * (`addonActions` and `addonTool` in the record, `methods/addon-tools.ts`). Read once and kept for half a minute, since
 * the palette and every row menu ask, and what an add-on gives changes only when one is installed or turned off.
 */
import { createClient } from '@braindog/client';

import { apiBase } from '$lib/at.ts';

export type AddonAsk = { id: string; label: string; type: 'text' | 'integer' | 'day' };
export type AddonCommand = { addon: string; addon_title: string; id: string; title: string; opens?: string; asks?: AddonAsk[] };
export type AddonRowAction = { addon: string; addon_title: string; list: string; list_name: string; title: string; script: string };
export type AddonActions = { commands: AddonCommand[]; row_actions: AddonRowAction[] };

const NONE: AddonActions = { commands: [], row_actions: [] };
const KEPT_MS = 30_000;
let kept: { at: number; value: AddonActions } | null = null;
let client: ReturnType<typeof createClient> | null = null;
const clientOf = (): ReturnType<typeof createClient> => (client ??= createClient({ base: apiBase() }));

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What the add-ons that are on give. Nothing, quietly, when the record cannot say. */
export async function addonActions(): Promise<AddonActions> {
  const now = Date.now();
  if (kept !== null && now - kept.at < KEPT_MS) return kept.value;
  try {
    const out = await clientOf().call<unknown>('addonActions', {});
    const v = out.ok && isMap(out.value) ? out.value : null;
    const value: AddonActions = v === null ? NONE : { commands: Array.isArray(v.commands) ? (v.commands as AddonCommand[]) : [], row_actions: Array.isArray(v.row_actions) ? (v.row_actions as AddonRowAction[]) : [] };
    kept = { at: now, value };
    return value;
  } catch {
    return NONE;
  }
}

/** Forget what was read, after an add-on is installed, turned on or off, or removed. */
export const forgetAddonActions = (): void => {
  kept = null;
};

/** What starting one answered, in the words a toast says. */
export type AddonRan = { ok: true; say: string; opens?: string } | { ok: false; say: string };

/** Start a command, with what it asked, or a row action on one row. */
export async function runAddon(args: { addon: string; command: string; values?: Record<string, unknown> } | { addon: string; action: string; row: string }): Promise<AddonRan> {
  try {
    const out = await clientOf().call<unknown>('addonTool', args as Record<string, unknown>);
    if (!out.ok) return { ok: false, say: 'refusal' in out ? out.refusal.fix : 'It did not run.' };
    const v = isMap(out.value) ? out.value : {};
    const answer = typeof v.answer === 'string' ? v.answer : null;
    return { ok: true, say: answer ?? (typeof v.say === 'string' ? v.say : 'Done.'), ...(typeof v.opens === 'string' ? { opens: v.opens } : {}) };
  } catch {
    return { ok: false, say: 'It did not run. Try again.' };
  }
}

/** One add-on command as the command bar draws it: where it goes, what it runs, or the sentence it still needs. */
export type AddonCommandRow = {
  id: string;
  title: string;
  detail: string;
  /** A page it opens, as the app's address. */
  href: string | null;
  /** What pressing it starts, when it has all it asks. */
  start?: { addon: string; command: string; values: Record<string, string | number> };
  /** The sentence written into the box when it still needs an answer: its title and a colon. */
  fill?: string;
};

/**
 * The add-on commands a line in the command bar reaches, as rows. A command matches when every word typed starts a word
 * of its title or its add-on's name. One that asks is answered on the same line after a colon, "Add a film: Dune", and
 * several answers are split by commas in the order it asks them; with nothing after the colon yet, pressing it writes
 * the sentence into the box.
 */
export function addonCommandRows(commands: readonly AddonCommand[], line: string): AddonCommandRow[] {
  const typed = line.trim();
  if (typed === '') return [];
  const colon = typed.indexOf(':');
  const head = (colon < 0 ? typed : typed.slice(0, colon)).toLowerCase();
  const answer = colon < 0 ? null : typed.slice(colon + 1).trim();
  const words = head.split(/\s+/u).filter((w) => w !== '');
  const out: AddonCommandRow[] = [];
  for (const c of commands) {
    const said = `${c.title} ${c.addon_title}`.toLowerCase().split(/[^a-z0-9]+/u);
    const matches = colon >= 0 ? c.title.toLowerCase() === head.trim() : words.every((w) => said.some((s) => s.startsWith(w)));
    if (!matches) continue;
    const base = { id: `addon-${c.addon}-${c.id}`, detail: c.addon_title };
    if (c.opens !== undefined) {
      out.push({ ...base, title: c.title, href: `/p/${c.opens.replace(/^page\./u, '')}` });
      continue;
    }
    const asks = c.asks ?? [];
    if (asks.length === 0) {
      out.push({ ...base, title: c.title, href: null, start: { addon: c.addon, command: c.id, values: {} } });
      continue;
    }
    const parts = answer === null || answer === '' ? [] : asks.length === 1 ? [answer] : answer.split(',').map((p) => p.trim());
    if (parts.length < asks.length || parts.some((p) => p === '')) {
      out.push({ ...base, title: `${c.title}: ${asks.map((a) => a.label).join(', ')}`, href: null, fill: `${c.title}: ` });
      continue;
    }
    const values: Record<string, string | number> = {};
    asks.forEach((a, i) => {
      const v = parts[i]!;
      values[a.id] = a.type === 'integer' && /^-?\d+$/u.test(v) ? Number(v) : v;
    });
    out.push({ ...base, title: `${c.title}: ${parts.join(', ')}`, href: null, start: { addon: c.addon, command: c.id, values } });
  }
  return out;
}
