/**
 * WHO DECIDES A QUESTION, AND AN OWNER NAMING SOMEBODY (`docs/20-COLLABORATION.md`: "one named person decides").
 *
 * THE RECORD SAYS IT. An open question answers `decider`, a person's id or `null`, and an owner hands it on with
 * `handQuestion({ id, to })`, or takes it back by leaving `to` out (`packages/record/src/methods/decider.ts`). Anybody
 * else who may decide reads "This one is Ada's to decide." from the record when they press, so this screen never
 * stops them itself: it says who decides before the press, in the same names, and the record holds the rule.
 *
 * NAMES, NEVER IDS. A decider is a person id, and nobody reads one: the name comes from the members the page reads, then
 * from the names `boot` sends. A person the reader cannot name is "Another member", which is still true.
 *
 * PURE, with relative imports, so `decider.test.ts` loads it in Node. The write is handed its way to the record, as
 * `decide-write.ts` hands in its fetch, so a test drives every answer without a socket.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../../../lib/record/boot-live.ts';
import { nameFromAddress } from '../../../lib/who.ts';

/** What this screen reads of a question: its id and who decides it, absent on a record older than the column. */
export type Decided = { id: string; decider?: string | null };

/** What this screen reads of a member: the shape `members` answers (`Member` in `@braindog/client`). */
export type Person = { person_id: string; name: string | null; email: string | null; level: string | null; suspended_at?: string | null };

/** The screen's own words, beside the only code that says them. */
export const WORDS = {
  yours: 'Yours to decide',
  theirs: (name: string) => `${name} decides this`,
  somebody: 'Another member',
  you: (name: string) => `${name} (you)`,
  nobody: 'Nobody',
  pick: 'Who decides',
  more: 'Who decides this',
  save: 'Save',
  nobodyLine: 'Anybody who may decide can answer this.',
  handed: (name: string) => `${name} decides this now.`,
  takenBack: 'Nobody is named now. Anybody who may decide can answer this.',
} as const;

/** The name a person goes by here: their name, else the name in their address (`fay.lune@` is Fay Lune), else nothing. */
export function nameOfPerson(p: Pick<Person, 'name' | 'email'>): string | null {
  const name = p.name?.trim();
  if (name) return name;
  return nameFromAddress(p.email);
}

/** A way to name a person id: the members first, then the record's own names from `boot`. */
export function namer(members: readonly Person[], names: Readonly<Record<string, string>> = {}): (id: string) => string | null {
  const known = new Map<string, string>();
  for (const [id, name] of Object.entries(names)) if (name.trim() !== '') known.set(id, name.trim());
  for (const m of members) {
    const said = nameOfPerson(m);
    if (said) known.set(m.person_id, said);
  }
  return (id) => known.get(id) ?? null;
}

/**
 * The one line that says who decides: "Yours to decide" to the decider, "Ada decides this" to everybody else, and
 * `null` when nobody is named, which draws the question as it always was.
 */
export function deciderLine(question: Decided, me: string | null, nameOf: (id: string) => string | null): string | null {
  const who = question.decider;
  if (typeof who !== 'string' || who === '') return null;
  if (me !== null && who === me) return WORDS.yours;
  return WORDS.theirs(nameOf(who) ?? WORDS.somebody);
}

/**
 * THE LINE ON SOMEBODY ELSE'S CARD on Decide's list: "Ada decides this". The reader's own say nothing, since the heading
 * "Yours to decide" over them already does, and a question naming nobody says nothing either.
 */
export const othersLine = (question: Decided, me: string | null, nameOf: (id: string) => string | null): string | null =>
  me !== null && question.decider === me ? null : deciderLine(question, me, nameOf);

/** One person an owner may name, by name. `you` is the reader. */
export type Choice = { id: string; name: string; you: boolean };

/**
 * THE MEMBERS WHO CAN DECIDE: those holding Decides on the record and its owners, by name, the reader first and the
 * rest in name order. A stopped member is left out, since they can answer nothing, and so is a member with no name to
 * say, since a picker of addresses or ids is not one a person reads.
 */
export function whoCanDecide(members: readonly Person[], me: string | null = null): Choice[] {
  const can = members.filter((m) => (m.level === 'decide' || m.level === 'owner') && !m.suspended_at);
  const named = can.flatMap((m) => {
    const name = nameOfPerson(m);
    return name ? [{ id: m.person_id, name, you: me !== null && m.person_id === me }] : [];
  });
  return named.sort((a, b) => (a.you === b.you ? a.name.localeCompare(b.name) : a.you ? -1 : 1));
}

/** What a hand answers: who decides now, or the record's own sentence. */
export type Handed = { from: 'handed'; decider: string | null } | { from: 'refused'; fix: string };

/** How the record is asked: the client's own method for it, handed in by a test or read off the client here. */
export type Send = (args: { id: string; to?: string }) => Promise<{ ok: true; value: unknown } | { ok: false; refusal: { fix: string } } | { ok: false; conflict: unknown }>;

/** The sentence for a hand the record answered as a conflict: somebody else moved the question first. */
const MOVED = 'Somebody changed this first. Open it again, then name somebody.';

/** The sentence for a client too old to carry the method, so the screen says so rather than failing quietly. */
const UNSERVED = 'Naming who decides is not in this build yet.';

/**
 * THE CLIENT'S OWN METHOD, READ OFF IT BY NAME AS A PROPERTY, as every other write on this page is a typed method. A client
 * built before the method came answers `null`, and the hand is refused in a sentence and never sent.
 */
function methodOf(base: string, io?: Fetch): Send | null {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) }) as unknown as { handQuestion?: Send };
  return typeof client.handQuestion === 'function' ? client.handQuestion : null;
}

/**
 * HAND `id` TO PERSON `to`, OR TO NOBODY WITH `null`. `to` is left out of the call for nobody, which is how the record
 * reads taking it back. On a refusal the record's own sentence comes back word for word.
 */
export async function hand(base: string, id: string, to: string | null, io?: Fetch, send?: Send): Promise<Handed> {
  const ask = send ?? methodOf(base, io);
  if (!ask) return { from: 'refused', fix: UNSERVED };
  const out = await ask({ id, ...(to !== null ? { to } : {}) });
  if (out.ok) {
    const said = out.value && typeof out.value === 'object' ? (out.value as { decider?: unknown }).decider : undefined;
    return { from: 'handed', decider: typeof said === 'string' && said !== '' ? said : said === null ? null : to };
  }
  if ('conflict' in out) return { from: 'refused', fix: MOVED };
  return { from: 'refused', fix: out.refusal.fix };
}
