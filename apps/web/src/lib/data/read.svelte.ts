/**
 * `read(key, fn)`: the one way a screen asks the record for something.
 *
 * THE THIN HALF. `read.ts` decides every state; this file only holds the answer in a rune, brackets each call with
 * `opened()`/`closed()` so the readiness contract never measures a half-drawn screen, and asks again
 * when the shell's version poll (`live.svelte.ts`) hears the record move. A screen draws `ready` itself and hands the
 * other four states to `ReadState.svelte`.
 *
 * CALL IT WHILE A COMPONENT IS BEING SET UP, the way a rune is: it owns its effects, and an effect outside a
 * component has nothing to be torn down with. Svelte refuses that at run time (`effect_orphan`) rather than leaking.
 * A screen calls it in its `<script>`, never inside a handler or an effect.
 *
 * THE CLIENT STAYS ROUTE-SPLIT. `fn` is the screen's own call, so whatever it imports stays in that route's chunk and
 * nothing here pulls `@braindog/client` into the entry (`lib/data/record.ts` says why that matters).
 */

import { untrack } from 'svelte';

import { closed, drew, opened, undrew } from '../ui/screen.svelte.ts';
import { keep, keptAnswer } from './kept.ts';
import { live } from './live.svelte.ts';
import { holdCopyMark } from './copy-mark.svelte.ts';
import { keepLocal, localTicket, nearLocal, settledLocal } from './local-tab.ts';
import type { Near, Spot } from './local.ts';
import { painted } from './timing.ts';
import { reader, type Resource, type Result, type Snapshot } from './read.ts';

export type { Phase, Resource, Result } from './read.ts';

/**
 * A read's local copy (`local.ts`). `name` defaults to `kept`; `lists` are the lists the answer was read from; `spots`
 * where its rows are, so a change is patched in rather than dropping it; `always` keeps it never current, for an answer
 * holding reads no line names; `shrink` is what is stored of it, where part of an answer must never be drawn old.
 * `recheck`: asked once quietly on open even when the copy is current. `follow`: when the record moves, the copy's
 * patched answer is drawn instead of asking, if it is still current, `follow` putting back what `shrink` left out.
 */
export type LocalRead<T> = {
  name?: string;
  base: () => string;
  lists: (value: T) => readonly string[];
  spots?: (value: T) => readonly Spot[];
  always?: boolean;
  shrink?: (value: T) => T;
  recheck?: boolean;
  follow?: (shown: T | null, kept: T) => T;
};

/**
 * Read `fn` for the key `key` answers, and again whenever that key changes or the record does.
 *
 * `key` NAMES THE QUESTION, not the answer: a screen passes what its call depends on (a list id, a slug, the record's
 * address), and `null` while it has nothing to ask yet. Two keys that are the same string are the same question, so a
 * key that is recomputed to an equal value asks nothing.
 */
export function read<T>(
  key: () => string | null,
  fn: () => Promise<Result<T>>,
  opts: { empty?: (value: T) => boolean; kept?: string; local?: LocalRead<T> } = {},
): Resource<T> {
  const m = reader<T>(opts.empty, untrack(() => live.version));
  /* RAW, because an answer is drawn and never edited in place: a deep proxy over every row of a list would cost a
     walk of the whole answer on each read and change the identity of every object in it. */
  let now = $state.raw<Snapshot<T>>(m.now());
  /* Drawn from the local copy, and the record has not answered since. */
  let stale = $state(false);
  const asking = $derived(key());
  /* The name the local copy keeps this read's answers under. */
  const localName = opts.local ? (opts.local.name ?? opts.kept) : undefined;
  /* What the dev timing hook calls this screen (`timing.ts`). */
  const screen = localName ?? opts.kept ?? 'read';

  /** `opened()` tokens for the calls still out, by ticket, so a screen that goes away can close what it opened. */
  const out = new Map<number, number>();
  let gone = false;

  async function ask(k: string | null, quiet = false): Promise<void> {
    /* A KEPT ANSWER IS DRAWN AT ONCE (`kept.ts`): at this version nothing is asked, at another it is asked quietly. */
    const version = untrack(() => live.version);
    /* A NEW QUESTION, or the same one asked out loud, starts unmarked: only drawing it from the copy marks it. */
    if (!quiet) stale = false;
    const was = opts.kept !== undefined && k !== null && !quiet ? keptAnswer<T>(opts.kept, k, version) : null;
    if (was !== null) {
      const drawn = m.ask(k, false);
      if (drawn !== null) m.answer(drawn, was.got);
      now = m.now();
      painted(screen, 'memory');
      if (was.fresh) return;
      quiet = true;
    } else if (opts.local !== undefined && localName !== undefined && k !== null && !quiet) {
      /* NOTHING IN MEMORY: THE LOCAL COPY, drawn at once. Current, nothing is asked; else it is asked quietly behind it. */
      /* A COPY LATER THAN THE WAIT fills the screen if the record has still not answered (`fill`), and nothing else. */
      const late = (got: Near<T>) => {
        if (gone || untrack(() => asking) !== k || !m.fill(k, got.value)) return;
        now = m.now();
        stale = true;
        painted(screen, 'copy');
      };
      const near = await nearLocal<T>(localName, k, opts.local.base(), late);
      if (gone || untrack(() => asking) !== k) return;
      if (near !== null) {
        const drawn = m.ask(k, false);
        if (drawn !== null) m.answer(drawn, { ok: true, value: near.value });
        now = m.now();
        painted(screen, 'copy');
        stale = !near.current;
        if (near.current && opts.local.recheck !== true) {
          if (opts.kept !== undefined) keep(opts.kept, k, version, { ok: true, value: near.value });
          return;
        }
        quiet = true;
      }
    }
    const mark = opts.local !== undefined ? localTicket() : 0;
    const ticket = m.ask(k, quiet);
    now = m.now();
    if (ticket === null || gone) return;
    const at = opened();
    out.set(ticket.n, at);
    let took: boolean;
    try {
      const got = await fn();
      took = m.answer(ticket, got);
      if (took && opts.kept !== undefined && k !== null) keep(opts.kept, k, version, got);
      if (took && got.ok) {
        stale = false;
        painted(screen, 'network');
        const l = opts.local;
        if (l !== undefined && localName !== undefined && k !== null)
          keepLocal(localName, k, l.lists(got.value), l.shrink ? l.shrink(got.value) : got.value, mark, {}, { ...(l.spots ? { spots: l.spots(got.value) } : {}), ...(l.always ? { always: true } : {}) });
      }
    } catch (e) {
      took = m.failed(ticket, e instanceof Error ? e.message : String(e));
    }
    /* A CALL IS CLOSED ONCE, by whoever gets there first: here, or the teardown below if the screen went. */
    if (!out.delete(ticket.n)) return;
    const said = m.now();
    if (took) now = said;
    /* ONLY THE ANSWER ON SCREEN CAN REFUSE THE SCREEN. An answer for a key the screen already left counts for
       nothing, so it closes as fine: a stale refusal marking the new question's screen `refused` is the exact
       cross-talk `screen.svelte.ts`'s epoch exists to stop between routes. */
    closed(!took || (said.state !== 'refused' && said.state !== 'offline'), at);
  }

  $effect(() => {
    const k = asking;
    untrack(() => void ask(k));
  });

  /* THE QUIET MARK OVER THE WORK (`copy-mark.svelte.ts`), up while this answer is the copy's and the record is asked. */
  $effect(() => {
    if (!stale) return;
    return untrack(() => holdCopyMark());
  });

  /* THE RECORD MOVED. `live.version` changes only when the poll hears a different version from the last one, so this
     asks the same question again and the screen keeps drawing its answer until the new one lands. */
  $effect(() => {
    const v = live.version;
    untrack(() => {
      if (m.heard(v)) void (opts.local?.follow ? follow(asking) : ask(asking, true));
    });
  });

  /**
   * THE RECORD MOVED AND THE COPY FOLLOWS IT: once the copy has placed what the log says (`settledLocal`), a current
   * answer is drawn from it and nothing is asked. A dropped or stale one, or a call already out, asks quietly as before.
   */
  async function follow(k: string | null): Promise<void> {
    const l = opts.local!;
    if (k === null || localName === undefined || out.size > 0) return ask(k, true);
    await settledLocal();
    if (gone || untrack(() => asking) !== k) return;
    const near = await nearLocal<T>(localName, k, l.base());
    if (gone || untrack(() => asking) !== k) return;
    if (near === null || !near.current || out.size > 0) return ask(k, true);
    const ticket = m.ask(k, true);
    if (ticket !== null) m.answer(ticket, { ok: true, value: l.follow!(untrack(() => now.value), near.value) });
    now = m.now();
  }

  /**
   * AN EMPTY ANSWER SETTLES THE SCREEN `empty` WHATEVER THE SCREEN DRAWS.
   *
   * `Empty` claims it too when it mounts, and the two are counts, not a latch, so both together are still one
   * `empty`. This one is here for the screen that draws its own frame around nothing, which would otherwise settle
   * `ready` over a blank list. `untrack` for `Empty.svelte`'s reason: `drew` reads and writes the same rune, and an
   * effect that depends on what it writes reruns until Svelte gives up.
   */
  $effect(() => {
    if (now.state !== 'empty') return;
    untrack(() => drew('empty'));
    return () => untrack(() => undrew('empty'));
  });

  /* A SCREEN THAT GOES WITH A CALL STILL OUT CLOSES IT. Without this a component unmounted mid-read (a tab switched
     inside one route) leaves `pending` above zero, and the route never settles; a navigation is covered by the
     epoch in `screen.svelte.ts` already, and closing against an old epoch is a no-op there. */
  $effect(() => () => {
    gone = true;
    for (const at of out.values()) closed(true, at);
    out.clear();
  });

  return {
    get state() {
      return now.state;
    },
    get value() {
      return now.value;
    },
    get refusal() {
      return now.refusal;
    },
    get stale() {
      return stale;
    },
    reread: () => ask(untrack(() => asking)),
  };
}
