/**
 * Turning an add-on off and on, for `/packs` (`loop/research-modular.md` §4 step 6).
 *
 * ONE SHAPE FOR BOTH RECORDS. The screen reads a `Source`: the record over HTTP when there is one,
 * and the sample below when there is not. The sample answers the way the record does, refusals
 * included, so the screen has one code path for each state it draws.
 *
 * PURE, AND THEREFORE TESTABLE, for the reason `device.ts` gives: `node --test` cannot import a
 * `.svelte.ts` file, so the state and the reading of a refusal live here and the screen only assigns.
 */

import { PACKS } from './data.ts';

/** A refusal as the record writes one, with only the keys this screen reads. */
export type Refusal = { code: string; fix: string; at?: string | undefined; allowed?: readonly string[] | undefined };

export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** One pack, on or off, as `packs` answers. `version` is `null` for a pack the seed owns by its bodies. */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/** What `disablePack` and `enablePack` answer. */
export type PackToggle = { id: string; state: 'enabled' | 'disabled'; changed: boolean; packs: string[]; declarations: string[]; said: string };

export type Source = {
  /** True while this tab is drawing the sample. */
  sample: boolean;
  packs(): Promise<Answer<PackState[]>>;
  disable(id: string, alsoDisable?: readonly string[]): Promise<Answer<PackToggle>>;
  enable(id: string): Promise<Answer<PackToggle>>;
};

/** What a refused switch draws, and what its one button would send. */
export type Blocked =
  | { kind: 'required'; id: string; also: string[] }
  | { kind: 'scopes'; id: string; registers: string[] }
  | { kind: 'off'; id: string; pack: string }
  | { kind: 'other'; id: string; fix: string };

/**
 * A refusal, read as what the screen offers next.
 *
 * `PACK_REQUIRED` KEEPS WHAT WAS ALREADY ASKED. A cascade can surface a second layer of dependents,
 * and a second press that sent only the new ones would drop the first.
 */
export function blocked(id: string, refusal: Refusal, asked: readonly string[] = []): Blocked {
  switch (refusal.code) {
    case 'PACK_REQUIRED':
      return { kind: 'required', id, also: [...new Set([...asked, ...(refusal.allowed ?? [])])] };
    case 'SCOPES_IN_USE': {
      /* THE FIELDS ARE NAMED `register.<id>.<field>`, in `at` for the first and in the sentence for all. */
      const named = [...`${refusal.at ?? ''} ${refusal.fix}`.matchAll(/register\.([a-z][a-z0-9_]*)\.[a-z]/g)].map((m) => m[1] ?? '');
      return { kind: 'scopes', id, registers: [...new Set(named)].filter(Boolean) };
    }
    case 'PACK_DISABLED':
      return { kind: 'off', id, pack: refusal.allowed?.[0] ?? id };
    default:
      return { kind: 'other', id, fix: refusal.fix };
  }
}

/* ── the record ─────────────────────────────────────────────────────────── */

type Wire<T> = { ok: true; value: T } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };

/** The three client methods this screen calls, so a test can hand in something that is not a socket. */
export type Caller = {
  packs(): Promise<Wire<PackState[]>>;
  disablePack(args: { id: string; alsoDisable?: string[] }): Promise<Wire<PackToggle>>;
  enablePack(args: { id: string }): Promise<Wire<PackToggle>>;
};

/** The client's three arms as two. None of these calls sends a version, so a conflict is only a race. */
const said = <T>(r: Wire<T>): Answer<T> =>
  r.ok
    ? r
    : 'refusal' in r
      ? { ok: false, refusal: r.refusal }
      : { ok: false, refusal: { code: 'VERSION_STALE', fix: 'The record changed while this was sent. Try again.' } };

export function live(client: Caller): Source {
  return {
    sample: false,
    packs: async () => said(await client.packs()),
    disable: async (id, alsoDisable = []) =>
      said(await client.disablePack(alsoDisable.length > 0 ? { id, alsoDisable: [...alsoDisable] } : { id })),
    enable: async (id) => said(await client.enablePack({ id })),
  };
}

/** The two answers that mean there is no record here, the same two `data/record.ts` falls back on. */
const SAMPLE_WHEN: ReadonlySet<string> = new Set(['UNREACHABLE', 'UNAUTHORIZED']);

/** Which source this screen reads, decided by its first `packs` call. A record that says no is drawn as saying no. */
export async function choose(client: Caller): Promise<{ source: Source; first: Answer<PackState[]> }> {
  const first = said(await client.packs());
  if (first.ok || !SAMPLE_WHEN.has(first.refusal.code)) return { source: live(client), first };
  const source = sample();
  return { source, first: await source.packs() };
}

/* ── the sample ─────────────────────────────────────────────────────────── */

/**
 * Which sample packs lean on which, as the seed's do: every first-party list points at a project, so
 * Portfolio is the one that cannot go off alone.
 */
export const LEANS_ON: Readonly<Record<string, readonly string[]>> = {
  estate: ['portfolio'],
  'money-core': ['portfolio'],
  people: ['portfolio'],
  work: ['portfolio'],
};

const refuse = (code: string, fix: string, extra: Omit<Refusal, 'code' | 'fix'> = {}): Answer<never> => ({
  ok: false,
  refusal: { code, fix, ...extra },
});

const unchanged = (id: string, state: PackToggle['state']): Answer<PackToggle> => ({
  ok: true,
  value: { id, state, changed: false, packs: [], declarations: [], said: `${id} is already ${state}, so nothing changed.` },
});

/** The installed sample packs, in memory for this tab. Nothing is written anywhere, and every row stays. */
export function sample(at: () => string = () => new Date().toISOString()): Source {
  const installed = PACKS.filter((p) => p.installed);
  const off = new Map<string, string>();
  const known = (id: string) => installed.find((p) => p.id === id);
  const declarations = (ids: readonly string[]) => ids.flatMap((id) => (known(id)?.registers ?? []).map((r) => `register.${r}`));
  const unknown = (id: string, where: string) => refuse('DECLARATION_UNKNOWN', `${id} is not a pack this record has installed.`, { at: where });

  return {
    sample: true,
    packs: async () => ({
      ok: true,
      value: installed.map((p) => ({ id: p.id, version: p.version, disabled_at: off.get(p.id) ?? null, registers: [...p.registers] })),
    }),

    disable: async (id, alsoDisable = []) => {
      for (const p of [id, ...alsoDisable]) if (!known(p)) return unknown(p, p === id ? 'pack' : 'alsoDisable');
      if (off.has(id)) return unchanged(id, 'disabled');
      const turning = [...new Set([id, ...alsoDisable])].filter((p) => !off.has(p));
      const dependents = installed
        .filter((p) => !off.has(p.id) && !turning.includes(p.id) && (LEANS_ON[p.id] ?? []).some((d) => turning.includes(d)))
        .map((p) => p.id)
        .sort();
      if (dependents.length > 0)
        return refuse('PACK_REQUIRED', `${id} is required by ${dependents.join(', ')}, still on.`, { at: 'alsoDisable', allowed: dependents });
      const when = at();
      for (const p of turning) off.set(p, when);
      return {
        ok: true,
        value: { id, state: 'disabled', changed: true, packs: turning, declarations: declarations(turning), said: `Disabled ${turning.join(', ')}.` },
      };
    },

    enable: async (id) => {
      if (!known(id)) return unknown(id, 'pack');
      if (!off.has(id)) return unchanged(id, 'enabled');
      const still = (LEANS_ON[id] ?? []).find((d) => off.has(d));
      if (still !== undefined) {
        const register = known(still)?.registers[0] ?? still;
        return refuse('PACK_DISABLED', `${register} belongs to ${still}, which is turned off. Enable ${still} first.`, { at: 'pack', allowed: [still] });
      }
      off.delete(id);
      return { ok: true, value: { id, state: 'enabled', changed: true, packs: [id], declarations: declarations([id]), said: `Enabled ${id}.` } };
    },
  };
}
