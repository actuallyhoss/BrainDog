/**
 * One read, decided the same way on every screen: waiting, ready, empty, refused or offline.
 *
 * WHY THERE IS ONE. Each screen asked the record for itself and then drew its own loading, refusal, retry and empty
 * states, so the same failure looked and behaved differently from one screen to the next. The
 * difference was never a design choice; it was one small state machine written again inside every screen. This is
 * that machine once, and `read.svelte.ts` is the thin half that holds it in a rune.
 *
 * PURE, AND NODE LOADS IT. No rune, no `$lib`, no `document`, relative `.ts` imports only, so `read.test.ts` beside it
 * runs under plain `node --test` the way `live.test.ts` runs `live.ts`.
 *
 * NO CLOCK AND NO TAB ARE HANDED IN, because the one timed thing a read does is hear that the record changed, and the
 * version poll in `live.ts` already owns the clock and the tab's visibility for the whole app. This module hears the
 * version that poll produces and decides whether it asks again; it never starts a timer of its own, so a hidden tab
 * costs a read nothing more than it costs the poll.
 */

/** The five states. `ready` is a screen; the other four are what `ReadState.svelte` draws instead of one. */
export type Phase = 'waiting' | 'ready' | 'empty' | 'refused' | 'offline';

/**
 * What a client call answers: `Result` in `@braindog/ports`, which the client returns.
 *
 * DECLARED AGAIN HERE, AND ONLY AS WIDE AS A READ NEEDS. The web does not depend on `@braindog/ports`, and adding the
 * dependency for one type would move the lockfile. The ports type is assignable to this one (its refusal carries at
 * least a `code` and a `fix`), so every client method's answer is a valid `fn` without a cast.
 *
 * `detail` IS THE TRANSPORT'S OWN WORDS, when a refusal carries them apart from its sentence. The client's
 * `unreachable()` keeps the reason there and says the offline sentence in `fix`, so an offline
 * read folds `detail` under Details; folding `fix` would print that sentence twice and lose the reason.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: { code: string; fix: string; detail?: string | undefined } }
  | { ok: false; conflict: unknown };

/** What a screen draws from, at one moment. */
export type Snapshot<T> = { state: Phase; value: T | null; refusal: string | null };

/**
 * One read, as a screen holds it.
 *
 * `refusal` IS A SENTENCE, NEVER A CODE: the record's `fix` for a refusal, and the technical reason for an offline
 * read, which `ReadState` folds under Details rather than printing as the content.
 */
export type Resource<T> = {
  readonly state: Phase;
  readonly value: T | null;
  readonly refusal: string | null;
  /** Drawn from the local copy and not yet confirmed by the record (`local.ts`). Absent where a read has no copy. */
  readonly stale?: boolean;
  reread(): Promise<void>;
};

/** One question: the key it was asked for, and which asking it was. Only the latest asking may answer. */
export type Ticket = { key: string; n: number };

/**
 * The refusal codes that mean the record was not reached, rather than that it answered no.
 *
 * `UNREACHABLE` IS THE ONE, and it is the client's own (`packages/client/src/index.ts`, `unreachable`): the record
 * never produces it, because a record that answered was reached. Every other code is the record speaking, and a
 * person told "could not reach" about a refusal would go looking for a network problem that is not there.
 */
const OFFLINE = new Set(['UNREACHABLE']);

/** The waiting snapshot. A function rather than a constant, so each caller's `T` is its own. */
const waiting = <T>(): Snapshot<T> => ({ state: 'waiting', value: null, refusal: null });

/**
 * One answer, turned into what the screen draws.
 *
 * AN EMPTY ANSWER KEEPS ITS VALUE. `empty` is the screen's own judgement of an answer it did get (a month with no
 * runs still has a month), so a screen can draw the frame around its empty state from the value.
 */
export function settle<T>(got: Result<T>, empty?: (value: T) => boolean): Snapshot<T> {
  if (got.ok) return { state: empty?.(got.value) ? 'empty' : 'ready', value: got.value, refusal: null };
  /* A CONFLICT ON A READ CANNOT HAPPEN, since only a write compares versions. It is still a way the record said no,
     so it is drawn as a refusal without a sentence, and `ReadState` supplies its own. */
  if (!('refusal' in got)) return { state: 'refused', value: null, refusal: null };
  const { code, fix, detail } = got.refusal;
  if (OFFLINE.has(code)) return { state: 'offline', value: null, refusal: detail ?? fix };
  return { state: 'refused', value: null, refusal: fix };
}

/** The machine one read runs on. */
export type Reader<T> = {
  /** What the screen draws now. */
  now(): Snapshot<T>;
  /** Ask for a key, or for nothing (`null`). The ticket is what the answer is handed back with; `null` asks nothing. */
  ask(key: string | null, quiet?: boolean): Ticket | null;
  /** An answer came back. `false` when it was dropped, because a newer question was asked since. */
  answer(ticket: Ticket, got: Result<T>): boolean;
  /** The call threw instead of answering. `false` when it was dropped. */
  failed(ticket: Ticket, why: string): boolean;
  /**
   * A local copy landed while `key` is asked and nothing is drawn: draw it, and let the call out fail quietly over it.
   * `false` when something is drawn already, the record's answer included, or the screen asks something else now.
   */
  fill(key: string, value: T): boolean;
  /** The record's version, as the poll last heard it. `true` when it moved and there is a question to ask again. */
  heard(version: number | null): boolean;
};

/**
 * A new read.
 *
 * `version` IS WHAT THE POLL HAD HEARD WHEN THE SCREEN OPENED, and it is the baseline, not a change: the screen is
 * about to ask anyway, and treating the version it opened on as news would ask the same question twice.
 */
export function reader<T>(empty?: (value: T) => boolean, version: number | null = null): Reader<T> {
  let snap: Snapshot<T> = waiting<T>();
  let asked: Ticket | null = null;
  let key: string | null = null;
  let n = 0;
  let seen = version;
  /* THE TICKET OF A QUIET ASK: the record moved and the screen is asking again on its own, with an answer on screen. */
  let quietly: number | null = null;

  /**
   * A QUIET ASK THAT FAILS KEEPS THE ANSWER ON SCREEN. The poll asks every 1.5 s while somebody is looking, and each
   * change it hears asks every read on screen again; one of those failing for a moment (a dropped request, a restart)
   * turned a drawn list into the offline screen under the reader, over rows that were all still right. The hairline
   * says a failed poll, and the next change asks again. Retry and a screen's own `reread` are not quiet, so a failure
   * the person asked about is still shown.
   */
  const kept = (ticket: Ticket): boolean => quietly === ticket.n && (snap.state === 'ready' || snap.state === 'empty');

  /** Whether this ticket is still the question on screen. Anything older is an answer for a key the screen left. */
  const current = (ticket: Ticket): boolean => asked !== null && asked.n === ticket.n;

  return {
    now: () => snap,
    ask(next, quiet = false) {
      /* A DIFFERENT QUESTION WIPES THE OLD ANSWER. A row of one record under the address of another is worse than a
         moment of waiting, so a new key starts from nothing. The same key asked again (Retry, or the record moving)
         keeps drawing what it has until the new answer lands, so a list does not blink every fifteen seconds; only a
         failure goes back to waiting, because the person pressed Retry and needs to see it was heard. */
      if (next !== key || snap.state === 'refused' || snap.state === 'offline') snap = waiting<T>();
      key = next;
      if (next === null) {
        asked = null;
        return null;
      }
      n += 1;
      asked = { key: next, n };
      quietly = quiet ? n : null;
      return asked;
    },
    answer(ticket, got) {
      if (!current(ticket)) return false;
      if (!got.ok && kept(ticket)) return true;
      snap = settle(got, empty);
      return true;
    },
    failed(ticket, why) {
      if (!current(ticket)) return false;
      if (kept(ticket)) return true;
      /* A THROW IS DRAWN AS OFFLINE, AND THE REASON IS KEPT. The client never throws (a dead socket is its
         `UNREACHABLE`), so a throw here is a screen's own `fetch` failing, which is the network. The sentence the
         person reads is the offline one; what actually threw sits under Details, so nobody is misled about which it was. */
      snap = { state: 'offline', value: null, refusal: why };
      return true;
    },
    fill(at, value) {
      /* ONLY OVER WAITING, so a copy never replaces what the record said, nor a refusal it drew. */
      if (asked === null || asked.key !== at || snap.state !== 'waiting') return false;
      snap = settle<T>({ ok: true, value }, empty);
      /* The call out is now asking behind a drawn answer: its failure keeps the copy, as a quiet ask's does. */
      quietly = asked.n;
      return true;
    },
    heard(next) {
      /* EQUALITY, NEVER ORDERING, for `live.ts`'s reason: a member's version is a hash and can come back smaller. */
      if (next === null || next === seen) return false;
      seen = next;
      return key !== null;
    },
  };
}
