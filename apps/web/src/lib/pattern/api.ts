/**
 * The pattern builder's calls to the record: the samples out of the inbox, the dry run, the ways to find a selection
 * again, and the save (`loop/finish/platform.md` §4.0 T).
 *
 * EVERY ANSWER IS A VALUE, NEVER A THROW. A call that could not reach the record answers `{ ok: false }` with the
 * sentence the screen says, so the builder draws a refusal where it would have drawn the answer.
 *
 * AN OWNER'S SAVE INSTALLS, ANYBODY ELSE'S SUGGESTS. The owner's rule goes in at `proposed`, so what it reads waits on
 * Decide as rowsets until she trusts it; a colleague's is filed as a `pattern` proposal for the owner to answer.
 */

import { createClient } from '@braindog/client';

import { declarationOf, type Draft, type Json } from './draft.ts';

/** One sample as the builder draws it: an arrival by its id, or a pasted message keyed `paste:<n>`. */
export type Sample = { key: string; channel: string | null; from: string; subject: string; body: string };

/** One field of one sample, read. */
export type Cell = { ok: boolean; value: Json | null; raw: string | null };

/** The dry run, as `tryPattern` answers it. */
export type Tried = {
  claims: boolean[];
  fields: { field: string; from: 'extract' | 'map'; how: Json; cells: Cell[] }[];
  waited: { accepted: number; of: number } | null;
};

/** One way to find a selection again, as `anchorsFor` answers it. */
export type Anchor = { how: Json; hits: number; of: number; value: Json | null };

export type Answer<T> = { ok: true; value: T } | { ok: false; fix: string };

/** The most pages of the inbox walked to find the samples, a page being the most the inbox answers at once. */
const PAGES_MOST = 5;
const PAGE = 200;

const UNREACHED = 'BrainDog could not reach this record.';

const fixOf = (out: { ok: false } & ({ refusal: { fix: string } } | { conflict: unknown })): string =>
  'refusal' in out ? out.refusal.fix : 'The record changed while this was being saved. Try again.';

/**
 * The samples by id, out of the inbox in every state, newest first until all are found or the walk's ceiling is met.
 *
 * EVERY STATE, because a sample a proposal names may since have been filed or skipped, and it is still the message the
 * rule was drawn from. One the walk does not find is left out, and `missing` says how many.
 */
export async function readSamples(base: string, ids: readonly string[]): Promise<Answer<{ samples: Sample[]; missing: number }>> {
  const wanted = new Set(ids);
  const found = new Map<string, Sample>();
  try {
    const client = createClient({ base });
    let cursor: number | null = null;
    for (let page = 0; page < PAGES_MOST && found.size < wanted.size; page += 1) {
      const out = await client.inbox({ state: 'all', limit: PAGE, ...(cursor === null ? {} : { cursor }) });
      if (!out.ok) return { ok: false, fix: fixOf(out) };
      for (const a of out.value.arrivals)
        if (wanted.has(a.id)) found.set(a.id, { key: a.id, channel: a.channel, from: a.from, subject: a.subject, body: a.body ?? '' });
      cursor = out.value.cursor;
      if (cursor === null) break;
    }
  } catch {
    return { ok: false, fix: UNREACHED };
  }
  const samples = ids.flatMap((id) => {
    const s = found.get(id);
    return s ? [s] : [];
  });
  return { ok: true, value: { samples, missing: ids.length - samples.length } };
}

/** The arrivals by id and the pasted texts, as both methods take them. */
function asked(samples: readonly Sample[]): { samples: string[]; pasted: string[] } {
  return {
    samples: samples.filter((s) => !s.key.startsWith('paste:')).map((s) => s.key),
    pasted: samples.filter((s) => s.key.startsWith('paste:')).map((s) => s.body),
  };
}

/**
 * The key a sample is sent under: an arrival by its id, a pasted one by its place among the pasted, since the record
 * numbers them in the order they are sent.
 */
export function sentAs(samples: readonly Sample[], key: string): string {
  if (!key.startsWith('paste:')) return key;
  const pasted = samples.filter((s) => s.key.startsWith('paste:'));
  return `paste:${pasted.findIndex((s) => s.key === key)}`;
}

export async function tryPattern(base: string, draft: Draft, samples: readonly Sample[]): Promise<Answer<Tried>> {
  try {
    const out = await createClient({ base }).call<Tried>('tryPattern', { ingest: declarationOf(draft).body, ...asked(samples) });
    return out.ok ? { ok: true, value: out.value } : { ok: false, fix: fixOf(out) };
  } catch {
    return { ok: false, fix: UNREACHED };
  }
}

export async function anchorsFor(
  base: string,
  samples: readonly Sample[],
  pick: { sample: string; field: string; start: number; end: number; type?: string | undefined },
): Promise<Answer<Anchor[]>> {
  try {
    const out = await createClient({ base }).call<Anchor[]>('anchorsFor', {
      sample: sentAs(samples, pick.sample),
      field: pick.field,
      start: pick.start,
      end: pick.end,
      ...(pick.type === undefined ? {} : { type: pick.type }),
      ...asked(samples),
    });
    return out.ok ? { ok: true, value: out.value } : { ok: false, fix: fixOf(out) };
  } catch {
    return { ok: false, fix: UNREACHED };
  }
}

/** The owner's save: the rule installed at `confidence`, `proposed` first and `exact` when she trusts it. */
export async function install(base: string, draft: Draft, confidence: Draft['confidence']): Promise<Answer<null>> {
  try {
    const out = await createClient({ base }).call('setDeclaration', { body: declarationOf(draft, confidence) });
    return out.ok ? { ok: true, value: null } : { ok: false, fix: fixOf(out) };
  } catch {
    return { ok: false, fix: UNREACHED };
  }
}

/** Anybody else's save: a `pattern` proposal carrying the rule and the arrivals it was made from. */
export async function suggest(base: string, draft: Draft, samples: readonly Sample[], question: string): Promise<Answer<string | null>> {
  try {
    const out = await createClient({ base }).call<{ id?: unknown }>('propose', {
      question,
      body_kind: 'pattern',
      body: { ingest: declarationOf(draft, 'proposed'), samples: asked(samples).samples },
    });
    if (!out.ok) return { ok: false, fix: fixOf(out) };
    return { ok: true, value: typeof out.value.id === 'string' ? out.value.id : null };
  } catch {
    return { ok: false, fix: UNREACHED };
  }
}
