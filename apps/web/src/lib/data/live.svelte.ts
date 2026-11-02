/**
 * The record's live state for this tab: what the hairline draws, and the version a screen re-asks on.
 *
 * ONE POLL PER TAB, STARTED BY THE SHELL. The layout calls `follow` with the record it is showing, so every screen reads
 * the same two runes and none of them starts a timer of its own. `Reporting.svelte`'s 30 s re-list was the only poll in
 * the app before this, and a second per-screen poll would have been a second clock asking the same record the same
 * question.
 *
 * NEVER FOR THE SAMPLE. The sample is in the browser and nothing else writes to it, so there is nothing to ask and no
 * host to ask it of: a static host answers `/api/version` with its SPA fallback, and the hairline would go to offline
 * on the one record that cannot be offline. `follow(null)` stops the poll and puts the state back to `open`.
 *
 * `@braindog/client` IS IMPORTED WHEN THE FIRST ASK GOES OUT, not with this file. The layout is the entry chunk, and the
 * client carries the route table, which `+layout.ts` keeps out of the entry for the bundle's budget.
 */

import type { createClient } from '@braindog/client';
import { dev } from '$app/environment';
import { tick } from 'svelte';

import { endedBy, newerBuild, poller, regranted, Wait, type LiveState, type Visibility } from './live.ts';
/* THE LOCAL COPY IS ASKED FOR WHEN THE POLL HAS SOMETHING TO TELL IT, never with the shell: its reader carries the
   predicate engine, and the first paint draws nothing from it. Each of the three is fire-and-forget already. */
const localTab = () => import('./local-tab.ts');
/** The local copy wiped, through the reader that arrives after the shell. */
const wipeLocal = (): Promise<void> => localTab().then((m) => m.wipeLocal());
import { dropShell, forget, hear, hearShell, keep } from './offline.ts';
import { forgetSignedOut } from '../record/signed-out.ts';

/**
 * `state` is what the hairline draws.
 *
 * `version` IS THE MARK A SCREEN RE-ASKS ON: the record's version as the poll last heard it, or the mark of a pull
 * (`reread`), and a screen compares it for equality only (`read.svelte.ts`, `listen.svelte.ts`), so any value it has
 * not seen means "ask again".
 *
 * `from` IS WHEN THE OLDEST ANSWER ON SCREEN WAS KEPT, in milliseconds, when the service worker answered from the read
 * copy (`offline.ts`), and `null` when everything drawn came from the record. `Pull.svelte` says it as "Offline, showing what you last saw at
 * 14:02".
 */
export const live = $state<{ state: LiveState; version: number | null; from: number | null; ended: { said: string } | null; here: readonly string[]; hereAt: string }>({
  state: 'open',
  version: null,
  from: null,
  /* WHO ELSE IS ON THIS PAGE, by name, as the record heard it on this poll (`Version.here`, collab pass 2): the head bar's
     small faces. Empty when nobody is, or the host is older. */
  here: [],
  /* AND THE PAGE IT WAS HEARD FOR, so a tab that has moved on draws nobody until the next poll says who is on the new one. */
  hereAt: '',
  /* THE DOOR SAID THIS PERSON'S ACCESS ENDED, in its own sentence with the owner's name: the layout
     draws the ended screen over everything, and the copies are already gone. */
  ended: null,
});

/**
 * THE ACCESS EPOCH THE SHELL BOOTED WITH, by the layout (`followGrant`), which the poll compares with the one `version`
 * answers. `undefined` until a live shell says it, so a poll that starts first re-boots nothing.
 */
let known: number | null | undefined;
/* HOW THE TAB BOOTS AGAIN, handed in by the layout with the epoch: its own `invalidate`. Importing `$app/navigation`
   here by `import()` kept every one of its exports in the entry script (`bundle` gate). */
let again: (() => Promise<void>) | null = null;

/** The epoch the live shell booted with, or `null` for somebody no share let in, and how to boot the tab again. */
export function followGrant(epoch: number | null, boot: (() => Promise<void>) | null = null): void {
  known = epoch;
  again = boot;
}

/**
 * THE GRANT MOVED: what this person holds changed (a share kept, changed or stopped, a group joined or left), so the tab
 * boots again onto it. The boot copy goes first, so the shell, the rail and the local copy's key are the record's new
 * answer and never the old one.
 */
async function reboot(): Promise<void> {
  if (again === null) return;
  (await import('$lib/record/boot-live.ts')).forget();
  await again();
}

/**
 * THEIR ACCESS ENDED: every copy of the record this tab and the service worker keep goes, the poll stops, and the layout
 * says so in the door's own sentence. A boot refused the same way draws the same screen (`+layout.svelte`).
 */
function end(said: string): void {
  void forget().catch(() => undefined);
  void wipeLocal();
  forgetSignedOut();
  void import('$lib/record/boot-live.ts').then((m) => m.forget(), () => undefined);
  /* AND NOTHING KEPT BY THE VERSION IS HANDED TO THEM AGAIN: the reads kept for the tab go, and none is kept from now. */
  void import('@braindog/client').then((c) => c.keepReads(false), () => undefined);
  live.ended = { said };
  following?.stop();
  following = null;
}

/* ── a newer build ── */

/** The build this tab runs, the deploy's tuple (`vite.config.ts`), or `''` in a build without one. */
const OWN_BUILD = typeof __BRAINDOG_BUILD__ === 'string' ? __BRAINDOG_BUILD__ : '';
/** Where the tab keeps the last build change it reloaded for, so each one is tried once (`newerBuild`). */
const TRIED = 'braindog.build-tried';
const tried = (): string | null => {
  try {
    return localStorage.getItem(TRIED);
  } catch {
    return null;
  }
};
/** Whether anybody has pressed or typed in this tab yet: until then a reload onto the new build loses nothing. */
let touched = false;

/**
 * A NEWER BUILD IS LIVE (scope 2026-10-24 A17): heard from `version`'s `app`, or from the worker, whose kept shell was
 * not the one the network answers. Untouched, the tab reloads onto it at once, which is the next open drawing the new
 * build; touched, nothing he is doing is thrown away, and the next link he follows loads the new build whole
 * (`data-sveltekit-reload`). `drop` takes the kept shell first, when it may still be the old one.
 */
function newer(key: string, drop: boolean): void {
  try {
    localStorage.setItem(TRIED, key);
  } catch {
    /* A tab that cannot keep the key still reloads once: the build it lands on is the new one. */
  }
  void (drop ? dropShell() : Promise.resolve()).catch(() => undefined).then(() => {
    if (!touched) globalThis.location.reload();
    else document.body.setAttribute('data-sveltekit-reload', '');
  });
}

/* HEARD FROM THE FIRST MOMENT THE SHELL'S SCRIPT RUNS, not once the record is followed: the worker tells the page the
   shell moved once the network has answered behind the copy, and a message that arrives before anybody listens is lost. */
if (typeof window !== 'undefined') {
  hearShell((mark) => {
    const key = `shell>${mark}`;
    if (key !== tried()) newer(key, false);
  });
  const touch = () => (touched = true);
  window.addEventListener('pointerdown', touch, { once: true, capture: true, passive: true });
  window.addEventListener('keydown', touch, { once: true, capture: true, passive: true });
}

const timers = {
  after(fn: () => void, ms: number): () => void {
    const h = setTimeout(fn, ms);
    return () => clearTimeout(h);
  },
};

/* FOCUS IS THE WINDOW'S, heard on `focus` and `blur` and read from `document.hasFocus()`, so a tab on the other monitor
   asks at the slow interval and the one somebody is working in asks at the fast one (`live.ts`). */
const tab: Visibility = {
  hidden: () => document.visibilityState === 'hidden',
  focused: () => document.hasFocus(),
  watch(fn) {
    document.addEventListener('visibilitychange', fn);
    window.addEventListener('focus', fn);
    window.addEventListener('blur', fn);
    /* A TOUCH OR A KEY is somebody reading again, so a poll gone quiet is quick again (`live.ts`, `idle`). */
    window.addEventListener('pointerdown', fn, { passive: true });
    window.addEventListener('keydown', fn, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', fn);
      window.removeEventListener('focus', fn);
      window.removeEventListener('blur', fn);
      window.removeEventListener('pointerdown', fn);
      window.removeEventListener('keydown', fn);
    };
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
    /* THE PAGE THIS TAB IS ON RIDES WITH THE POLL, an app path and nothing else, so the record can say who else is on it. */
    const asked = typeof location === 'undefined' ? undefined : location.pathname;
    const out = await (await client).version(asked);
    if (!out.ok) {
      /* A SESSION THAT ENDED TAKES THE READ COPY WITH IT. The worker deletes it on any 401 it sees, and this covers a
         page the worker does not control yet (the first visit, before it claims the tab). */
      if ('refusal' in out && out.refusal.code === 'UNAUTHORIZED') {
        void forget().catch(() => undefined);
        void wipeLocal();
        forgetSignedOut();
      }
      /* A PERSON WHOSE ACCESS ENDED IS TOLD SO, within one poll of the share stopping: 1.5 s on a focused tab. */
      if ('refusal' in out && endedBy(out.refusal)) end(out.refusal.fix);
      /* A RATE LIMIT SAYS HOW LONG TO WAIT, and the poll waits that long without calling the tab offline. */
      if ('refusal' in out && out.refusal.code === 'RATE_LIMITED') throw new Wait(Number(out.refusal.retry_after) || 60);
      /* A BUSY RECORD IS NOT OFFLINE either: it answered, and asked for a few seconds (the Worker's 503). */
      if ('refusal' in out && out.refusal.code === 'RECORD_UNAVAILABLE') throw new Wait(Math.max(5, Number(out.refusal.retry_after) || 0));
      throw new Error('the record did not answer its version');
    }
    /* A RECORD WHOSE FORMAT MOVED UNDER THE LOCAL COPY wipes what it kept (`local.ts`). */
    const stamped = out.value;
    void localTab().then((m) => m.stampLocal(stamped));
    /* A NEWER BUILD LIVE THAN THE ONE THIS TAB RUNS takes the kept shell and moves the tab onto it. */
    const build = newerBuild(OWN_BUILD, out.value.app, tried());
    if (build !== null) newer(build, true);
    /* AND AN ACCESS EPOCH THAT MOVED BOOTS THE TAB AGAIN, once: the new shell says the epoch it booted with. */
    const heard = (out.value as { grant?: { epoch?: unknown } }).grant?.epoch;
    const epoch = typeof heard === 'number' ? heard : null;
    if (known !== undefined && regranted(known, epoch)) {
      known = epoch;
      void reboot().catch(() => undefined);
    }
    /* WHO ELSE IS HERE, replaced only when it changed, so the faces do not redraw on every poll. */
    const here = Array.isArray(out.value.here) ? out.value.here.filter((n): n is string => typeof n === 'string' && n !== '').slice(0, 8) : [];
    const at = asked ?? '';
    if (here.join('\n') !== live.here.join('\n')) live.here = here;
    if (at !== live.hereAt) live.hereAt = at;
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
  live.from = null;
  /* READS ARE KEPT BY THE VERSION ONLY WHILE IT IS FOLLOWED (`keepReads` in the client), since this poll is what tells a
     kept answer from a stale one; following another record, or none, drops what was kept. */
  const keeping = base !== null;
  void import('@braindog/client').then((c) => c.keepReads(keeping), () => undefined);
  if (base === null) return;
  /* THE READ COPY IS KEPT FOR A RECORD BEING FOLLOWED, and only then: never for the sample, which is in the browser
     already, and never over a refusal, which the layout follows as `null`. A copy of another record goes here. */
  void keep(base, dev).catch(() => undefined);
  if (!hearing) {
    hearing = true;
    hear((at) => (live.from = live.from === null ? at : Math.min(live.from, at)));
  }
  following = {
    base,
    stop: poller({
      ask: asker(base),
      timers,
      visible: tab,
      onChange: (version) => {
        /* THE LOCAL COPY ASKS THE LOG WHAT CHANGED, beside the screens asking their own questions again. */
        void localTab().then((m) => m.heardLocal(version));
        live.version = version;
      },
      onState: (state) => {
        live.state = state;
        /* BACK ONLINE WITH A COPY ON SCREEN, THE SCREEN READS AGAIN. The poll's first answer is its baseline and says no
           change, so without this a list drawn from Tuesday's copy would stay Tuesday's until somebody wrote. */
        if (state === 'open' && live.from !== null) {
          live.from = null;
          void reread();
        }
      },
    }),
  };
}

/**
 * WHO READS THROUGH THIS TAB, as a live boot named them (`readAs` in the client): the person, what their role and shares
 * reach and who the record is seen as. Every read kept by the version is kept for that reader alone, so a reader who
 * changes (a sign-in, a grant that moved, See as) is never handed an answer read for the one before.
 */
export function readingAs(me: {
  person: string;
  level: string | null;
  owner: boolean;
  lists: readonly string[] | null;
  levels?: Readonly<Record<string, string>> | undefined;
  grant?: { epoch: number } | undefined;
  lens?: string | undefined;
}, seen: string | null): void {
  const levels = me.levels ? Object.entries(me.levels).sort(([x], [y]) => x.localeCompare(y)) : null;
  const reader = JSON.stringify([me.person, me.level, me.owner, me.lists ? [...me.lists].sort() : null, levels, me.grant?.epoch ?? null, me.lens ?? null, seen]);
  void import('@braindog/client').then((c) => c.readAs(reader), () => undefined);
}

/** Whether the worker's "answered from the copy" is listened for. Once per tab: it names no record. */
let hearing = false;

/** How many pulls this tab has made, which is what makes each pull's mark one no screen has seen. */
let pulls = 0;

/**
 * Read the screen again now: what a pull on a phone does (`Pull.svelte`).
 *
 * THROUGH THE SAME MARK THE POLL MOVES, so every screen that re-asks when the record changes re-asks on a pull, with
 * no second path to keep in step. A pull's mark is a whole number and a half, and the record's version is a whole
 * number, so the two can never be equal; the poll keeps its own last version and is not moved by this, so its next
 * real change still reaches every screen.
 *
 * It resolves once the screens have started their reads, so `settled()` counts them from then on.
 */
export async function reread(): Promise<void> {
  if (following === null) return;
  /* A PULL ASKS THE RECORD ITSELF: nothing kept at this version answers it. */
  await import('@braindog/client').then((c) => c.forgetReads(), () => undefined);
  pulls += 1;
  live.version = pulls + 0.5;
  await tick();
}
