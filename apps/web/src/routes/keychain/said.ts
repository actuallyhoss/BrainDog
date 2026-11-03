/**
 * WHAT THE RECORD SAID TO EACH OF `/keychain`'S READS, and what the screen is allowed to draw from it.
 *
 * THIS EXISTS BECAUSE THE SCREEN THREW THREE REFUSALS AWAY. Driven against a
 * freshly provisioned self-host, `/keychain` fired `list?register=things` and `list?register=credentials`,
 * took `422 REGISTER_UNKNOWN` for both, and drew "No keys yet." with a working `Add a key` button over
 * a register the record does not hold: 44 words, one control, and neither sentence on the screen. A
 * colleague invited at `read` got the other half of it, `403 LEVEL_REQUIRED` on `listDevices` drawn as
 * the whole page, 19 words and one button, while the rail said `Keys 2` to that same person and
 * `/r/credentials` drew both rows to them.
 *
 * AND THE SECOND OF THOSE IS A DECISION, not a bug with a line number. The registers index what a key
 * OPENS and never the key itself, and a credential never goes in the record, so reading the index is
 * not reading a secret: `/r/credentials` is right to draw it to a reader, and the Keychain screen is
 * wrong to have hidden it behind the one refusal that was about the machines. The ACTS are another
 * matter and stay where they are.
 *
 * `listDevices` ANSWERING IS THE TEST FOR THE ACTS. `listDevices` is ADMIN and `putKey`, `openKey` and
 * `revokeGrant` are KEYCHAIN, and `packages/record/src/index.ts:3772` says of the pair that `keychain(ctx)`
 * "is the SAME PREDICATE as the `admin(ctx)` two lines above": both refuse every token, then anybody
 * below owner. The Keychain gate asks for one thing more, a sign-in under fifteen minutes old, and that
 * is a sentence the record sends when it happens rather than something this screen can guess.
 *
 * PURE, SO `node --test` CAN IMPORT IT, the reason `lib/record/device.ts` gives. The words are here
 * with the decisions that need them, and they load with this route the way `record/keychain.ts`'s do.
 */

/** A refusal as the client hands one back, and only the keys read here. */
export type Refusal = { code: string; fix: string };

/** The client's three-armed result, whatever the call was. */
export type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/**
 * One read's answer, as the screen has to treat it: it came back, the record holds no such list, or
 * the record said no. The record's sentence travels with the last two, because it is the answer.
 */
export type Said = { kind: 'held' } | { kind: 'absent'; fix: string } | { kind: 'refused'; fix: string };

export const words = {
  /** The Keys section over a record with no such register. */
  noList: 'No keys yet',
  /** What to do about it, after the record's own sentence. A record grows a Keys register when Agents goes in. */
  /* WHAT WILL BE HERE, NOT THE RECORD'S OWN REFUSAL (empty states, 2 Nov): a new record read "There is no Keys list yet."
     over "There is no register called keys.", two lines about a list and none about keys. */
  noListHow: 'The keys you hand your agents are kept here, sealed. They come with the Agents plugin.',
  browse: 'Browse plugins',
  /** The Keys section when the record refused the read rather than lacking the list. */
  notYours: 'Your keys could not be listed here.',
  /** The machines half, when the record refused to list them. */
  machinesNotYours: 'Only the owner sees the machines that may open keys.',
  /* IN PLAIN WORDS WHERE THE RECORD'S OWN WERE ITS INSIDES: "listDevices, in ADMIN, was
     not sent" and "a token cannot reach the vault" were drawn as they came. Each says what to do instead. */
  keysHow: 'Sign in again, then open the Keychain.',
  machinesHow: 'Sign in as the owner to see them and approve a new one.',
  countsHow: 'How often each key was opened shows once you sign in again.',
  actHow: 'Only the owner, signed in, can change keys here.',
  /**
   * A COUNT NOBODY GAVE US IS NOT DRAWN AS ZERO. `listGrants` is KEYCHAIN, so a reader is refused it, and
   * `keysOf` then has no grant to join a row to: "never opened" would be this screen's guess printed
   * as the record's fact.
   *
   * AND THE SCREEN NO LONGER GUESSES WHY EITHER. This said "how often it was opened is not yours to
   * see", which is FALSE FOR THE OWNER and was drawn to them often: `listGrants` is the Keychain gate,
   * owner plus a sign-in under fifteen minutes old, and `authed_at` is set at sign-in and never
   * refreshed. So an owner who signed in an hour ago opened this screen, got `listDevices` (admin, no
   * freshness) and a refused `listGrants`, and every sealed row told the record's owner the count was
   * not theirs. It is theirs; they have to prove a fresh sign-in. `countSaid` hands on whatever the
   * record said instead, which for that case is "Sign in again to open the Keychain."
   */
  /** A three-armed result whose third arm reached a read. A conflict carries no sentence of its own. */
  noAnswer: 'The record answered something this screen could not read. Try again.',
} as const;

/**
 * WHETHER A SENTENCE SPEAKS THE RECORD'S INSIDES rather than to a person: a method's name (`listDevices`), a group or
 * code in capitals (`ADMIN`, `READ+`), or a token, which he never holds in the app.
 */
const INSIDES = /\b[a-z]+[A-Z][A-Za-z]*\b|\b[A-Z]{3,}\+?(?![a-z])|\btokens?\b/u;

/** The record's own sentence where it is plain, else `how`: what to do, in this screen's words. */
export const plainOr = (fix: string, how: string): string => (fix.trim() === '' || INSIDES.test(fix) ? how : fix);

/** The one refusal code that means the record holds no such list, rather than refusing the reader. */
const ABSENT = 'REGISTER_UNKNOWN';

/** What one read came back with. A conflict cannot reach a read, and is read as a refusal rather than drawn blank. */
export function saidOf(out: Wire<unknown>): Said {
  if (out.ok) return { kind: 'held' };
  if (!('refusal' in out)) return { kind: 'refused', fix: words.noAnswer };
  return out.refusal.code === ABSENT ? { kind: 'absent', fix: out.refusal.fix } : { kind: 'refused', fix: out.refusal.fix };
}

/** What the sealed line says where no count came back: the record's own sentence, never this screen's guess at it. */
export const countSaid = (counted: Said): string => (counted.kind === 'held' ? '' : plainOr(counted.fix, words.countsHow));

/** What a section draws instead of its rows, or `null` when the record answered and the rows speak for themselves. */
export type Tell = { kind: 'no-data-yet' | 'no-permission'; title: string; body: string };

/**
 * The Keys section's own sentence.
 *
 * A LIST THAT IS NOT THERE AND A LIST THAT IS NOT YOURS ARE TWO DIFFERENT STATES, and "No keys yet."
 * was drawn for both. The first is a record that has not grown a Keys register, which is a thing a
 * person can change in one screen, so it says which screen; the second is the record declining, and
 * the record's own sentence already names the remedy.
 */
export function tellOf(said: Said): Tell | null {
  if (said.kind === 'held') return null;
  return said.kind === 'absent'
    ? { kind: 'no-data-yet', title: words.noList, body: words.noListHow }
    : { kind: 'no-permission', title: words.notYours, body: plainOr(said.fix, words.keysHow) };
}

/** The machines half's own sentence, which is the record's, or `null` when it answered. */
export function machinesTellOf(said: Said): Tell | null {
  if (said.kind === 'held') return null;
  return { kind: 'no-permission', title: words.machinesNotYours, body: plainOr(said.fix, words.machinesHow) };
}

/**
 * Whether the acts on this screen belong to whoever is reading it: adding a key, replacing one,
 * revealing one, taking one out of service, and approving a machine.
 */
export const mayAct = (devices: Said): boolean => devices.kind === 'held';
