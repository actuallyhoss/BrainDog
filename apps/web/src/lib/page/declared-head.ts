/**
 * A DECLARED PAGE'S HEAD, AS THE READ SENDS IT: a kicker over the title, a count beside it, a state in words,
 * the page's one primary button, a search and a way back. The kernel checks and resolves it (`packages/kernel/src/
 * page-head.ts` `resolveHead`) and the page read answers it as `head`, beside the blocks, so it reaches the app on the
 * page's answer (`page-live.ts` keeps every key it does not read).
 *
 * NARROWED HERE, NOT TRUSTED. A record on another build may send no head, or one this build cannot read: a head that
 * is not a map is no head, a part that is not the shape the kernel answers is left out, and a head with no part left is
 * `null`, so the page draws exactly as it did before heads.
 *
 * PURE, reached only by `PageView.svelte`, which is its own chunk: nothing here loads with the shell.
 */

import type { Action } from 'braindog-render';

/** The three tones a state is in. A host draws each with a mark and its words, never colour alone. */
export type HeadTone = 'good' | 'warn' | 'bad';

/** A head as this build draws it. Every part is optional; a head always has at least one. */
export type DeclaredHead = {
  kicker?: string;
  count?: { value: number; said: string };
  state?: { tone: HeadTone; words: string };
  action?: Action;
  search?: { param: string };
  /** What the search found across the page's lists, when a word narrowed it (`searched` on the kernel's head). */
  searched?: { word: string; found: number };
  back?: { href: string; label: string };
  byline?: true;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Words a person reads: a non-empty line with no break. */
const words = (v: unknown, most = 200): string | null => {
  const said = typeof v === 'string' ? v.trim() : '';
  return said && said.length <= most && !/[\n\r]/u.test(said) ? said : null;
};
const TONES: ReadonlySet<string> = new Set(['good', 'warn', 'bad']);
const PARAM = /^[a-z][a-z0-9_]{0,31}$/u;
/** A way back stays inside the app: one path from the root, never another site's address. */
const LOCAL = /^\/(?!\/)[^\s\\]*$/u;

/** The one primary button, narrowed to what `act` reads: a verb, its words, and the facts the record said of it. */
function actionOf(v: unknown): Action | null {
  if (!isRecord(v) || typeof v.verb !== 'string' || v.verb === '') return null;
  const label = words(v.label, 40);
  if (!label) return null;
  const out: Action & { undo?: boolean } = { verb: v.verb, label };
  if (isRecord(v.args)) out.args = v.args;
  const confirm = words(v.confirm, 140);
  if (confirm) out.confirm = confirm;
  for (const flag of ['again', 'once', 'look_first', 'hard', 'undo'] as const) if (typeof v[flag] === 'boolean') out[flag] = v[flag];
  return out;
}

/**
 * The head a page's answer carries, or `null` where it carries none this build can draw. `answer` is the page as the
 * read answered it, which holds `head` beside its title.
 */
export function headOf(answer: unknown): DeclaredHead | null {
  const h = isRecord(answer) ? answer.head : undefined;
  if (!isRecord(h)) return null;
  const out: DeclaredHead = {};
  const kicker = words(h.kicker, 60);
  if (kicker) out.kicker = kicker;
  if (isRecord(h.count) && typeof h.count.value === 'number' && Number.isFinite(h.count.value)) {
    out.count = { value: h.count.value, said: words(h.count.said, 40) ?? String(h.count.value) };
  }
  if (isRecord(h.state) && typeof h.state.tone === 'string' && TONES.has(h.state.tone)) {
    const said = words(h.state.words, 80);
    if (said) out.state = { tone: h.state.tone as HeadTone, words: said };
  }
  const action = actionOf(h.action);
  if (action) out.action = action;
  if (isRecord(h.search) && typeof h.search.param === 'string' && PARAM.test(h.search.param)) out.search = { param: h.search.param };
  if (isRecord(h.searched) && typeof h.searched.word === 'string' && Number.isInteger(h.searched.found) && (h.searched.found as number) >= 0)
    out.searched = { word: h.searched.word, found: h.searched.found as number };
  if (isRecord(h.back) && typeof h.back.href === 'string' && LOCAL.test(h.back.href)) {
    const label = words(h.back.label, 80);
    if (label) out.back = { href: h.back.href, label };
  }
  if (h.byline === true) out.byline = true;
  return Object.keys(out).length ? out : null;
}

/** The head's own words: the search field's name, and each tone's mark said for a reader who cannot see it. */
export const HEAD_WORDS = {
  search: 'Search this page',
  found: (n: number): string => `${String(n)} found`,
  tone: { good: 'On track', warn: 'Worth a look', bad: 'Needs you' } satisfies Record<HeadTone, string>,
} as const;

/** The address with `param` set to what was typed, or taken off when it is empty, keeping every other choice in it. */
export function searchQuery(params: URLSearchParams, param: string, typed: string): string {
  const next = new URLSearchParams(params);
  const said = typed.trim();
  if (said) next.set(param, said);
  else next.delete(param);
  return next.toString();
}
