/**
 * Whether Slash reads on its own, and what a model is sent when it does (`slashReads`).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `slash.ts` takes it.
 *
 * THE CONSENT RULE, AS A PERSON READS IT. His own ask is his own act; what Slash reads in the background is on until the
 * owner says otherwise, and this is the one switch for it. The paragraph says three things in both states of the switch:
 * what is sent (the fields a job needs), to whom, and what never is (a sealed field, a key, a file's contents). It says
 * them when the switch is off too, because a person who turned it off still asks Slash things himself.
 *
 * TO WHOM IS WHAT THE HOST SAYS OF ITSELF, never a name written here: whether this host has a model at all (the page's
 * `slash`), and which of the three ways Slash is run (`slashStatus`'s `tier`). Where the host has not said, the sentence
 * points at the setting above it that does.
 */

import type { SlashClient } from './slash.ts';

/** What `slashReads` answers: whether Slash may read in the background. */
export type Reads = { on: boolean };

/** Who a job's fields go to: this host's model, the owner's provider on his key, this host's own endpoint, or nobody. */
export type Host = 'included' | 'key' | 'own' | 'unknown' | 'none';

export const words = {
  title: 'Read on its own',
  switch: 'Let Slash read on its own',
  on: 'Files what arrives and finds what to suggest.',
  off: 'Your rules do the work; a model only when you ask.',
  offNone: 'Reads only when you ask.',
  sent: 'It sends only the fields a job needs',
  to: {
    included: 'to the model BrainDog runs.',
    key: 'to your own provider, on your key.',
    own: 'to the endpoint you set up.',
    unknown: 'to the model set under Slash.',
    none: 'No model is connected, so nothing is sent.',
  },
  never: 'Never a key, a sealed field or the contents of a file.',
  saidOn: 'Slash will read on its own.',
  saidOff: 'Slash will read only when you ask.',
  unreached: 'BrainDog could not reach this record.',
} as const;

/**
 * Who the fields go to, from what the host says of itself: `here` is whether this host has a model, and `tier` is how
 * Slash is run on this record (`a` the included model, `b` the owner's key, `byo` the host's own endpoint).
 */
export const hostOf = (here: boolean, tier?: string | null): Host =>
  !here ? 'none' : tier === 'a' ? 'included' : tier === 'b' ? 'key' : tier === 'byo' ? 'own' : 'unknown';

/** The paragraph under the switch: what on or off means, what is sent, to whom, and what never is. */
export const readsSaid = (reads: Reads, host: Host): string =>
  host === 'none'
    ? `${reads.on ? words.on : words.offNone} ${words.to.none}`
    : `${reads.on ? words.on : words.off} ${words.sent} ${words.to[host]} ${words.never}`;

type Out = Awaited<ReturnType<SlashClient['call']>>;

const fixOf = (r: Exclude<Out, { ok: true }>): string => ('refusal' in r ? r.refusal.fix : 'Something changed while this was open. Try again.');

const isReads = (v: unknown): v is Reads => typeof v === 'object' && v !== null && typeof (v as Reads).on === 'boolean';

/* A HOST BUILT BEFORE THE CALL THROWS OR ANSWERS SOMETHING ELSE. Either is "not reached", so the tile is not drawn and
   nothing claims Slash reads, or does not, on a host that never said. */
async function call(client: SlashClient, args: Record<string, unknown>): Promise<{ ok: true; reads: Reads } | { ok: false; fix: string }> {
  let out: Out;
  try {
    out = await client.call<Reads>('slashReads', args);
  } catch {
    return { ok: false, fix: words.unreached };
  }
  if (!out.ok) return { ok: false, fix: fixOf(out) };
  if (!isReads(out.value)) return { ok: false, fix: words.unreached };
  return { ok: true, reads: { on: out.value.on } };
}

/** The state as it stands. Only the owner, in a browser: anyone else is refused, and the tile is not drawn for them. */
export const readReads = (client: SlashClient): Promise<{ ok: true; reads: Reads } | { ok: false; fix: string }> => call(client, {});

/** The switch: Slash reading on its own, on or off, and one sentence to say which. */
export async function setReads(client: SlashClient, on: boolean): Promise<{ ok: true; reads: Reads; said: string } | { ok: false; fix: string }> {
  const out = await call(client, { on });
  if (!out.ok) return out;
  return { ok: true, reads: out.reads, said: out.reads.on ? words.saidOn : words.saidOff };
}
