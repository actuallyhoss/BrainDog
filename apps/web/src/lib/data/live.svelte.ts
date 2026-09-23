/**
 * The record's live state for this tab: what the hairline draws, and the version a screen re-asks on.
 *
 * ONE POLL PER TAB, STARTED BY THE SHELL. The layout calls `follow` with the record it is showing, so every screen reads
 * the same two runes and none of them starts a timer of its own. `Reporting.svelte`'s 30 s re-list was the only poll in
 * the app before this, and a second per-screen poll would have been a second clock asking the same record the same
 * question (`loop/research-living-in-it.md` §1.1).
 *
 * NEVER FOR THE SAMPLE. The sample is in the browser and nothing else writes to it, so there is nothing to ask and no
 * host to ask it of: a static host answers `/api/version` with its SPA fallback, and the hairline would go to offline
 * on the one record that cannot be offline. `follow(null)` stops the poll and puts the state back to `open`.
 *
 * `@braindog/client` IS IMPORTED WHEN THE FIRST ASK GOES OUT, not with this file. The layout is the entry chunk, and the
 * client carries the route table, which `+layout.ts` keeps out of the entry for the bundle's budget.
 */

import type { createClient } from '@braindog/client';

import { poller, type LiveState, type Visibility } from './live.ts';

export const live = $state<{ state: LiveState; version: number | null }>({ state: 'open', version: null });

const timers = {
  every(fn: () => void, ms: number): () => void {
    const h = setInterval(fn, ms);
    return () => clearInterval(h);
  },
};

const tab: Visibility = {
  hidden: () => document.visibilityState === 'hidden',
  watch(fn) {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
};

/**
 * The version, or a rejection.
 *
 * ANY REFUSAL IS A FAILED POLL, not only `UNREACHABLE`. A signed-out session answers `UNAUTHORIZED` from a host that is
 * plainly up, and the hairline going to offline is still the truth about this tab: no write it sends will land either,
 * and `50 §2.4` sets offline after "a failed write or failed poll". What it never reads is `navigator.onLine`.
 */
function asker(base: string): () => Promise<number> {
  let client: Promise<ReturnType<typeof createClient>> | null = null;
  return async () => {
    client ??= import('@braindog/client').then(({ createClient }) => createClient({ base }));
    const out = await (await client).version();
    if (!out.ok) throw new Error('the record did not answer its version');
    return out.value.version;
  };
}

let following: { base: string; stop: () => void } | null = null;

/** Poll this record, or none. Calling it again with the same base is a no-op, so the layout may call it on every navigation. */
export function follow(base: string | null): void {
  if (following?.base === base) return;
  following?.stop();
  following = null;
  /* A DIFFERENT RECORD IS A DIFFERENT BASELINE. Its version is not comparable with the last record's, so the screen is
     told nothing until the new poll has heard twice. */
  live.state = 'open';
  live.version = null;
  if (base === null) return;
  following = {
    base,
    stop: poller({
      ask: asker(base),
      timers,
      visible: tab,
      onChange: (version) => (live.version = version),
      onState: (state) => (live.state = state),
    }),
  };
}
