/**
 * Approving a device grant: RFC 8628's second half, and the half this app had none of.
 *
 * `19 §2` gives `/settings/agents` three things — the tokens, the connected machines, and *"the
 * code-entry control — the `verification_uri` of every device flow"*. Four documents make
 * `${origin}/settings/agents` the address a machine prints and sends a person to (`33 §10`,
 * `49 §5.9`, `26 §2.3`, `53 §5`), and the screen at that address had a list and no field. Somebody
 * who runs `braindog runner enroll`, reads six digits off their terminal and opens the URL it
 * printed arrived at something they could only look at.
 *
 * PURE, AND THEREFORE TESTABLE. Same split as `arrange.ts`: a `.svelte.ts` file uses the `$state`
 * rune, which exists only after the Svelte compiler has run, so `node --test` cannot import one. The
 * reactive part is an assignment; the arithmetic — who pays for a wrong guess, when five is reached,
 * what a match returns — is where a bug would live, and it is all here.
 *
 * A REFUSAL IS A VALUE. Every way this can fail is a `Result` a caller can render, including the two
 * the record itself would send back over the wire.
 */

import type { Device, Reach } from './schema.ts';

/** `30 §1`'s `tries INTEGER NOT NULL DEFAULT 0`, and `12 §6.1`'s five. */
export const CODE_TRIES = 5;

/** `49 §5.9` step 1: `now + 10 min`, for a pending row and for an operation grant that is approved. */
export const CODE_MINUTES = 10;

/** Six digits is a million — `12 §6.1`, and the reason the count of tries is the actual control. */
export const CODE_DIGITS = 6;

/**
 * A refusal as the record writes one: a code from `30 §6`'s closed list, where it happened, and the
 * one thing to do about it. No apology and no blame.
 */
export type Refusal = { code: string; fix: string; at?: string };

/** What an approval grants, which is what `49 §5.9` step 2.3 says the screen must have said first. */
export type Approved = { id: string; reach: Reach; label: string; subject: string | null };

/**
 * The answer, and the rows as they now stand.
 *
 * THE ROWS COME BACK EVEN WHEN THE ANSWER IS A REFUSAL, and that is the point rather than an
 * oversight: a wrong guess CHANGES THE RECORD. `49 §5.9` step 2.1 spends the try on every pending
 * row before it looks at any of them, and the fifth one denies them all. A function that returned
 * only the refusal would leave the caller drawing four rows that no longer exist in that state.
 */
export type Attempt = { rows: Device[]; result: { ok: true; value: Approved } | { ok: false; refusal: Refusal } };

const no = (code: string, fix: string, at = 'user_code'): Attempt['result'] => ({ ok: false, refusal: { code, fix, at } });

/**
 * The separators a code is printed with, gone. Everything else stays and is refused.
 *
 * `12 §3`: *"paste is never blocked on the fallback code field"*, and the thing people paste is what
 * `48 §5.2` step 3 printed at them: `Open <uri> and enter  314 159`. A field that rejects the space
 * it told you to read is a field that rejects its own output. Hyphens for the same reason, and the
 * non-breaking space a terminal or a chat client will have substituted on the way.
 *
 * IT USED TO STRIP EVERY NON-DIGIT, which made the refusal sentence beside it untrue — it says
 * *"spaces are fine; nothing else is"* and `314x159` was silently accepted as `314159`. That is not
 * a cosmetic disagreement: an accepted entry SPENDS A TRY ON EVERY WAITING ROW, so a paste that
 * dragged a word in with it cost somebody else's enrolment one of its five, which is the exact harm
 * the shape check exists to prevent. Seven digits was refused out loud and arbitrary letters were
 * swallowed.
 *
 * IT DOES NOT TRUNCATE. Seven digits is not a code with a typo whose shape you can guess; it is a
 * mistake, and `wellFormed` refuses it rather than approving whatever the first six happen to be.
 */
export const normalise = (typed: string): string => typed.replace(/[\s\u00a0\u2000-\u200b_.\u2010-\u2015-]+/gu, '');

/** Six digits and nothing else. */
export const wellFormed = (code: string): boolean => new RegExp(`^\\d{${CODE_DIGITS}}$`, 'u').test(code);

/**
 * `sha256(id ‖ ':' ‖ user_code)`'s stand-in, and the same djb2 `list()` hashes a question with.
 *
 * **This is not a security control, and a review proved exactly how much it is not.** It is djb2
 * folded to 32 bits over a domain of one million codes, so brute-forcing every six-digit string
 * takes under a second in Node — and against the fingerprint this file used to ship in `data.ts` it
 * returned a single preimage. The comment beside that row claimed the code "exists nowhere" and the
 * test named `THE SHIPPED RECORD CANNOT BE APPROVED BY ANYBODY` proved it by trying four guesses.
 * Four guesses is not a proof; the search space is small enough to enumerate.
 *
 * The salt argument was inverted too. `sha256(id ‖ code)` resists preimage because SHA-256 does, not
 * because of the salt — the salt is there so two grants showing the same six digits do not collide.
 * That property this does preserve, and it is the only one claimed now.
 *
 * WHAT THE SHIPPED SEED DOES INSTEAD is carry no fingerprint at all: the empty string, which this
 * function cannot return (its shortest output is one character), so no code matches it by
 * construction rather than by hope. `device.test.ts` asserts that, and builds its own rows with its
 * own codes for the success path.
 */
export function fingerprint(id: string, code: string): string {
  const text = `${id}:${code}`;
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = (h * 33) ^ text.charCodeAt(i);
  return (h >>> 0).toString(36);
}

/** A grant still waiting, and not one whose ten minutes ran out while nobody looked. */
const waiting = (d: Device, nowMs: number): boolean => d.state === 'pending' && Date.parse(d.at) + CODE_MINUTES * 60_000 > nowMs;

/**
 * Type a code in and see what happens — `49 §5.9` step 2, in order, because the order is load-bearing.
 *
 * 1. A malformed entry never reaches the record at all. It is not politeness: a try is spent on
 *    EVERY pending row, so sending `12` would charge a colleague's enrolment for your typo, and five
 *    typos would deny it. The wire has nothing to say about a string that cannot be a code.
 * 2. Every live pending row pays one try. Before the lookup, so a guesser cannot tell a near miss
 *    from a wrong shape by timing or by what came back.
 * 3. A match becomes `approved` — not `active`. `12 §6.1`'s "one row, two lives": the row is
 *    approved here and becomes active when the DEVICE polls and exchanges it for its token, which is
 *    a thing that happens on the other machine and may not happen at all.
 * 4. No match, and any pending row now at five, denies every pending row — `DEVICE_CODE_TRIES`, with
 *    the fix `49 §5.9` step 2.4 gives verbatim. Denied rows are kept: *"I said no to a request I did
 *    not make"* is the most important line this table can produce.
 * 5. No match and under five is a bare miss. The record answers 404 with no body, so this says the
 *    same thing and volunteers no count — a browser that displayed "two tries left" would be
 *    displaying something the API does not tell it, and the fix line covers the outcome.
 *
 * A row whose ten minutes are up is stepped to `expired` on the way past, which is how that state is
 * reached anywhere: nobody expires a grant, time does.
 */
export function approve(rows: readonly Device[], typed: string, nowMs: number): Attempt {
  const code = normalise(typed);
  if (!wellFormed(code))
    return {
      rows: [...rows],
      /* WHICH WAY IT WAS WRONG, because the three are three different mistakes and one sentence for
         all of them is a sentence that stops being read. It is also what makes a second identical
         attempt announce anything at all: a `role="status"` whose text is byte-identical to what it
         already holds is not a change, so a reader who mistypes twice hears nothing the second
         time. */
      result: no(
        'VALUE_MALFORMED',
        /\d/u.test(code) && !/^\d+$/u.test(code)
          ? `A device code is ${CODE_DIGITS} digits and a space. There is something else in this one.`
          : code.length === 0
            ? `Type the ${CODE_DIGITS} digits the machine is showing.`
            : code.length < CODE_DIGITS
              ? `That is ${code.length} digit${code.length === 1 ? '' : 's'}. A device code is ${CODE_DIGITS}.`
              : `That is ${code.length} digits. A device code is ${CODE_DIGITS}, so this is not one with an extra on the end.`,
      ),
    };

  const next = rows.map((d): Device => {
    if (d.state !== 'pending') return d;
    if (!waiting(d, nowMs)) return { ...d, state: 'expired' };
    return { ...d, tries: d.tries + 1 };
  });

  const at = next.findIndex((d) => waiting(d, nowMs) && d.codeHash === fingerprint(d.id, code));
  const hit = next[at];
  if (hit)
    return {
      rows: next.map((d, i) => (i === at ? { ...d, state: 'approved' } : d)),
      result: { ok: true, value: { id: hit.id, reach: hit.reach, label: hit.name, subject: hit.ua } },
    };

  if (next.some((d) => d.state === 'pending' && d.tries >= CODE_TRIES))
    return {
      /* `locked`, NOT `denied`. The lockout is correct and stays — a code a stranger can guess is a
         code worth rate-limiting — but it is the RECORD closing the request, and filing it under the
         state that means "a person refused this" made the screen assert a decision nobody took. */
      rows: next.map((d) => (d.state === 'pending' ? { ...d, state: 'locked' } : d)),
      result: no('DEVICE_CODE_TRIES', 'Ask the device to start again.'),
    };

  return { rows: next, result: no('FORBIDDEN', 'No machine is waiting with that code.') };
}
