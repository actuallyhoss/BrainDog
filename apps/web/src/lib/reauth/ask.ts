/**
 * "Confirm it's you", asked in place: the one step-up the whole app shares (his ask of 1 Nov: "make it so when it needs
 * auth it prompts it in a modal, which automatically continues the action directly after re-authenticating").
 *
 * WHAT ASKS. A call the record refused because the sign-in is older than the change wants (`NEEDS_BROWSER_SESSION` at
 * `proof`, or the Share sheet's `confirm`) is caught where every record call passes, `@braindog/client`'s `call`, which
 * hands it to `StepUp.svelte`'s hook. The hook asks here; `Reauth.svelte` draws the ask; once the session is fresh the
 * client sends the same call once more, so the screen that pressed sees it work as if it had the first time. A token,
 * a press in a chat or an order refused at `principal` never asks: no sign-in changes those.
 *
 * ONE ASK AT A TIME. Three reads refused together share one modal and are all sent again when it passes.
 *
 * A READ ASKS ONLY RIGHT AFTER A PRESS. A screen that reads the keychain by itself, on a timer or on arrival long after
 * the click that opened it, gets its refusal back as before, so nothing pops up over a page nobody touched.
 *
 * NO CLIENT IMPORT AND NO RUNE HERE, so `lib/record/keychain.ts` and `lib/auth.ts` can ask too without pulling the client
 * in.
 */

/** What the modal is asked: the purpose line, and whether a press asked it (a write) or a read. */
export type Ask = { why: string | null; writes: boolean };

/** Who draws the ask (`StepUp.svelte`): told the ask on screen now, or `null` once it is answered. A plain callback and no
    rune, so a `node --test` of `keychain.ts` or `auth.ts` can load this file. */
let shown: (ask: Ask | null) => void = () => undefined;

/** Put in the drawer of the ask. */
export function onAsk(fn: (ask: Ask | null) => void): void {
  shown = fn;
}

/** Whether the app's frame put the modal in (`StepUp.svelte`); outside it (sign-in, sign-up) nothing is asked here. */
let ready = false;
let pending: Promise<boolean> | null = null;
let answer: ((proved: boolean) => void) | null = null;
/** When the last ask was cancelled, so a refusal landing just after is not asked again. */
let cancelledAt = 0;
/** When the person last pressed or typed, so a read asks only on the heels of a press. */
let pressedAt = 0;

/** How long after a press a read may still ask: a page opened by a click reads within this. */
const PRESS_MS = 4_000;
/** How long after a Cancel nothing asks again, for the refused calls still landing from the same press. */
const CANCEL_QUIET_MS = 2_000;

/** The plain line a screen shows where it said "Sign in again", once the person chose not to. */
export const NOT_CONFIRMED = {
  write: 'Nothing changed. You can try again any time.',
  read: "Hidden until you confirm it's you.",
} as const;

/** Said by `StepUp.svelte` as it mounts and goes. */
export function readyHere(on: boolean): void {
  ready = on;
  if (!on && answer) answer(false);
}

/** Whether a press happened a moment ago (`PRESS_MS`). */
export const pressedNow = (): boolean => Date.now() - pressedAt < PRESS_MS;

/** Note a press, from the window's own pointer and key events (`StepUp.svelte`). */
export function pressed(): void {
  pressedAt = Date.now();
}

/** Whether the modal can be asked here. */
export const canAsk = (): boolean => ready;

/**
 * Ask for a fresh sign-in, and answer whether it came. Asked again while open, it answers the same ask. Where no modal
 * is mounted this answers false at once.
 */
export function askProof(why: string | null, writes = true): Promise<boolean> {
  if (!ready) return Promise.resolve(false);
  if (pending) return pending;
  pending = new Promise<boolean>((resolve) => {
    answer = (proved: boolean) => {
      shown(null);
      pending = null;
      answer = null;
      if (!proved) cancelledAt = Date.now();
      resolve(proved);
    };
    shown({ why, writes });
  });
  return pending;
}

/** The modal's own answer: proved, or cancelled. */
export function answered(proved: boolean): void {
  answer?.(proved);
}

/**
 * What the modal says the sign-in is for, out of the record's own sentence: "Sign in again to let agents do everything
 * without asking." is "To let agents do everything without asking." A sentence of another shape says nothing more.
 */
export function purposeOf(refusal: { fix?: string | undefined; at?: string | undefined } | null): string | null {
  if (refusal?.at === 'confirm') return 'To share this.';
  const fix = refusal?.fix ?? '';
  const to = /^Sign in again (to [^.]+?)(?:\.|,| It has been)/u.exec(fix)?.[1];
  return to ? `T${to.slice(1)}.` : null;
}

/** A refusal a fresh sign-in answers (`wantsProof` in `@braindog/client`, written again so this file imports nothing). */
export const isProof = (refusal: { code?: unknown; at?: unknown } | null | undefined): boolean =>
  refusal != null && refusal.code === 'NEEDS_BROWSER_SESSION' && (refusal.at === 'proof' || refusal.at === 'confirm');

/**
 * Whether to ask for this refusal, and the answer the caller hands back: `proved`, or not, with the plain line to show
 * instead (`fix`), or no line when nothing was asked and the refusal stays as it came.
 */
export async function stepUp(refusal: { fix?: string | undefined; at?: string | undefined }, writes: boolean): Promise<{ proved: true } | { proved: false; fix?: string }> {
  if (!ready || (!writes && !pressedNow())) return { proved: false };
  const line = writes ? NOT_CONFIRMED.write : NOT_CONFIRMED.read;
  if (pending === null && Date.now() - cancelledAt < CANCEL_QUIET_MS) return { proved: false, fix: line };
  return (await askProof(purposeOf(refusal), writes)) ? { proved: true } : { proved: false, fix: line };
}

/**
 * For a door the client does not carry (a host route the app fetches itself): send, and on a stale-proof refusal ask
 * and send once more. `refusalOf` reads the refusal out of what `send` answered, or `null` when there is none.
 */
export async function proving<T>(send: () => Promise<T>, refusalOf: (out: T) => { code?: unknown; at?: unknown; fix?: unknown } | null | undefined): Promise<T> {
  const out = await send();
  const refusal = refusalOf(out);
  if (!isProof(refusal)) return out;
  const said = await stepUp({ fix: typeof refusal?.fix === 'string' ? refusal.fix : undefined, at: typeof refusal?.at === 'string' ? refusal.at : undefined }, true);
  return said.proved ? send() : out;
}

/**
 * `proving` for a door the app fetches itself and reads as a `Response`: a stale-proof refusal in its JSON is asked for
 * and the request sent once more; the caller reads whichever response came last, as it read the first.
 */
export async function provingFetch(send: () => Promise<Response>): Promise<Response> {
  const res = await send();
  if (res.ok || !ready) return res;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const refusal = (body as { refusal?: { code?: unknown; at?: unknown; fix?: unknown } } | null)?.refusal;
  if (!isProof(refusal)) return res;
  const said = await stepUp({ fix: typeof refusal?.fix === 'string' ? refusal.fix : undefined, at: typeof refusal?.at === 'string' ? refusal.at : undefined }, true);
  return said.proved ? send() : res;
}
