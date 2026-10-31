/**
 * The lists a page's refs point at, walked from the page's early answer (`app.html`, `/p/<slug>`) as soon as the frame's
 * code runs, and not once the page's own reader has loaded (speed-g SG2, 31 Oct).
 *
 * WHY. Work's answer was in the tab at 1.5 s on a cold phone over Slow 4G, and its reader's code at 7.3 s: only then did
 * the reader learn which lists its blocks' refs point at (people, things, tracks, tasks) and walk them, and the page drew
 * a round trip later, at 8.1 s. The walks need nothing but the answer and the lists' declarations, both asked beside
 * `boot`, so they are asked here, from the frame's first load, and the reader finds them in the tab's walk
 * (`ref-rows.ts`), which hands one walk to whoever asks while it is out or still true.
 *
 * A LOOK ONLY: the answer is read from a copy (`clone`) and stays for the reader to take (`earlyPage` in `page-live.ts`).
 * A guess that turns out wrong walks a list the page did not need, which the tab keeps for the next screen. Asked AHEAD
 * (`createClient({ ahead: true })`), so the frame's rest does not wait for these walks.
 *
 * PURE ENOUGH FOR NODE: no rune, no `$lib`.
 */

import { createClient } from '@braindog/client';

import { rowsOf } from '../data/ref-rows.ts';

/** A drawn block as this reads one. */
type Answered = { kind?: unknown; source?: unknown; register?: unknown; refusals?: unknown };

/** A list's field as its declaration says it. */
type Field = { type?: unknown; of?: unknown; to?: unknown };

/** The list a block's rows belong to, as the page's reader names it (`registerOf` in `page-live.ts`). */
export function blockList(b: Answered): string | null {
  if (Array.isArray(b.refusals) && b.refusals.length > 0) return null;
  if (b.source === 'sessions.live' || b.source === 'sessions.working') return 'session';
  if (b.kind === 'inputs') return typeof b.register === 'string' && b.register !== '' ? b.register : null;
  return typeof b.source === 'string' && b.source.startsWith('register.') ? b.source.slice('register.'.length) : null;
}

/** The lists a declaration's refs point at, in declared order, each once (`targetsOf` in `remote.ts`). */
export function refTargets(fields: unknown): string[] {
  const out: string[] = [];
  for (const f of Array.isArray(fields) ? (fields as Field[]) : []) {
    const to = typeof f?.to === 'string' && f.to !== '' && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref')) ? f.to : undefined;
    if (to !== undefined && !out.includes(to)) out.push(to);
  }
  return out;
}

/** The lists `blocks` draw, each once, in the page's order. */
export function pageLists(blocks: unknown): string[] {
  const out: string[] = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const list = b !== null && typeof b === 'object' ? blockList(b as Answered) : null;
    if (list !== null && !out.includes(list)) out.push(list);
  }
  return out;
}

/**
 * Walk the lists the early page answer's refs point at, on the record at `base`. Only for the answer asked at this
 * record's address, and only once: a second call finds nothing held, or the reader has taken it.
 */
export function askPageWalks(base: string): void {
  const held = (globalThis as { __bdPage?: { url?: unknown; at?: unknown } | undefined }).__bdPage;
  if (!held || typeof held.url !== 'string' || !held.url.startsWith(`${base}/api/page?`) || !(held.at instanceof Promise)) return;
  void (held.at as Promise<Response>)
    .then(async (res) => {
      if (!res?.ok || typeof res.clone !== 'function' || res.bodyUsed) return;
      const said = (await res.clone().json()) as { ok?: unknown; value?: { blocks?: unknown } } | null;
      if (said?.ok !== true) return;
      const lists = pageLists(said.value?.blocks);
      if (lists.length === 0) return;
      const client = createClient({ base, ahead: true });
      const declared = await Promise.all(lists.map((list) => client.schema(list).catch(() => null)));
      const targets: string[] = [];
      for (const got of declared) {
        if (got === null || !got.ok) continue;
        for (const to of refTargets((got.value as { fields?: unknown } | null)?.fields)) if (!targets.includes(to)) targets.push(to);
      }
      for (const to of targets) void rowsOf(client, base, to).catch(() => null);
    })
    .catch(() => undefined);
}
