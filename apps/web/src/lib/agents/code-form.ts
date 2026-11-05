/**
 * THE SIX-DIGIT FIELD'S RULES, pure, for `CodeForm.svelte`, which Settings, Agents draws and Home's connect sheet draws
 * under the `braindog setup` line. Moved out of `Agents.svelte` unchanged in what it says.
 *
 * THE DIGITS RULE IS `device.ts`'s (`codeOf`) and the answer's sentence is `keychain.ts`'s (`answerLine`), the ones `/keychain`
 * sends through too, so the three places cannot drift apart. Paste is never blocked and the field has no `maxlength`:
 * the CLI prints the code in two groups, read here as one code, and seven digits is refused out loud rather than
 * trimmed to a different code, since trimming would approve whichever machine the first six happen to match.
 *
 * NOTHING HERE IMPORTS THE CLIENT: an approval is handed the one method it calls (`Approver`), so a test hands a fake.
 */
import type { Answer } from '../record/device.ts';
import { CODE_DIGITS } from '../record/device.ts';
import { answerLine, approve, type Approver } from '../record/keychain.ts';

/** What the empty field shows: six noughts, which say how many digits belong in it without a word. */
export const CODE_PLACEHOLDER = '0'.repeat(CODE_DIGITS);

/**
 * One send, as the form calls it: the typed text in, what came back out. Nothing malformed is sent. With no handle it looks
 * at what is asking and lets nothing in; with the handle that look answered, it is the press of Approve.
 */
export type Approve = (typed: string, handle?: string) => Promise<Answer>;

/** The approval over one client, or over none, which answers "sign in again" (`keychain.ts` `approve`). */
export const approverOf = (client: Approver | null): Approve => (typed, handle) => approve(typed, client, handle);

/** What the field holds and what the last press answered. */
export type CodeState = { typed: string; answer: Answer | null };

/** A new keystroke clears the last answer, so the field is never marked wrong for a value it no longer holds. */
export const retyped = (value: string): CodeState => ({ typed: value, answer: null });

/**
 * One send, a look or a press of Approve: what the field holds after it, and whether the connected list changed.
 *
 * THE CODE STAYS IN THE FIELD ON A REFUSAL: six digits with one wrong is a thing to correct. An approval empties it.
 */
export async function sent(typed: string, send: Approve, handle?: string): Promise<CodeState & { changed: boolean }> {
  const answer = await send(typed, handle);
  const changed = answer.kind === 'approved';
  return { typed: changed ? '' : typed, answer, changed };
}

/**
 * What is drawn under the field: the sentence and its tone, whether the field is marked wrong, and whether the Sign in
 * again button is offered. `null` before the first press.
 *
 * `signin` IS THE ONE REFUSAL WITH A WAY FORWARD HERE: a sign-in older than fifteen minutes cannot approve, and signing
 * in again, with the code still typed, is the fix (`keychain.ts` `reprove`).
 */
export type Said = { tone: 'good' | 'bad'; line: string; invalid: boolean; signIn: boolean };

export function saidOf(answer: Answer | null): Said | null {
  const said = answerLine(answer);
  if (said === null || answer === null) return null;
  return { ...said, invalid: said.tone === 'bad', signIn: answer.kind === 'signin' };
}
