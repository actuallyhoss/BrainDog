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

import { exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { callsOutOf, type CallOut } from './actions.ts';
import { PACKS, PACK_SETTINGS } from './data.ts';
import { planOf, type Plan } from './vault.ts';

/** A refusal as the record writes one, with only the keys this screen reads. */
export type Refusal = { code: string; fix: string; at?: string | undefined; allowed?: readonly string[] | undefined };

export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** One pack, on or off, as `packs` answers. `version` is `null` for a pack the seed owns by its bodies. */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/** What `disablePack` and `enablePack` answer. */
export type PackToggle = { id: string; state: 'enabled' | 'disabled'; changed: boolean; packs: string[]; declarations: string[]; said: string };

/** The seven types a setting may take (`loop/research-modular.md` §1.3). */
export type ConfigType = 'text' | 'enum' | 'bool' | 'money' | 'day' | 'duration' | 'number';

/** One setting as `packConfig` answers it. */
export type ConfigDecl = { type: ConfigType; values?: readonly string[]; default?: unknown; label?: string; note?: string };

/** What `packConfig` answers: what the manifest declares, and the value each setting holds now. */
export type PackConfig = { id: string; version: string | null; config: Record<string, ConfigDecl>; values: Record<string, unknown> };

/** What `setPackConfig` answers. */
export type ConfigSaved = PackConfig & { changed: string[]; said: string };

export type Source = {
  /** True while this tab is drawing the sample. */
  sample: boolean;
  packs(): Promise<Answer<PackState[]>>;
  disable(id: string, alsoDisable?: readonly string[]): Promise<Answer<PackToggle>>;
  enable(id: string): Promise<Answer<PackToggle>>;
  config(id: string): Promise<Answer<PackConfig>>;
  /** Only the settings that changed. `null` puts one back to its default. */
  setConfig(id: string, values: Record<string, unknown>): Promise<Answer<ConfigSaved>>;
  /** Take an add-on back out. Its declarations go and its rows stay. The sample says what would happen. */
  uninstall(id: string): Promise<Answer<Uninstalled>>;
};

/** What `uninstallPack` answers, with only the key read here. The sample's carries the sentence it toasts. */
export type Uninstalled = { id: string; said?: string };

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

/** The client methods these screens call, so a test can hand in something that is not a socket. */
export type Caller = {
  packs(): Promise<Wire<PackState[]>>;
  disablePack(args: { id: string; alsoDisable?: string[] }): Promise<Wire<PackToggle>>;
  enablePack(args: { id: string }): Promise<Wire<PackToggle>>;
  packConfig(args: { id: string }): Promise<Wire<unknown>>;
  setPackConfig(args: { id: string; values: Record<string, unknown> }): Promise<Wire<unknown>>;
  uninstallPack(args: { id: string }): Promise<Wire<unknown>>;
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
    config: async (id) => said(await client.packConfig({ id })) as Answer<PackConfig>,
    setConfig: async (id, values) => said(await client.setPackConfig({ id, values })) as Answer<ConfigSaved>,
    uninstall: async (id) => said(await client.uninstallPack({ id })) as Answer<Uninstalled>,
  };
}

/* ── installing one from the catalogue ──────────────────────────────────── */

/** The two client methods an install calls, apart from `Caller` so the switch tests need not stub them. */
export type Installer = {
  planPack(args: { doc: unknown; source?: { kind: string } }): Promise<Wire<unknown>>;
  installPack(args: { doc: unknown; source?: { kind: string }; planHash: string; approve?: string[] }): Promise<Wire<unknown>>;
};

/** A plan somebody is reading: the record's diff in the screen's words, the calls it makes, and the lines Install approves. */
export type Offer = { id: string; doc: Record<string, unknown>; plan: Plan; calls: CallOut[]; approve: string[] };

/**
 * The document behind a catalogue entry, or `null` for one nothing ships yet.
 *
 * LOADED WHEN INSTALL IS PRESSED, because the seed is every first-party declaration and most visits never install.
 *
 * FOR THE RECORD IT GOES INTO, WHEN THE SCREEN KNOWS WHICH PACKS THAT RECORD HOLDS. People sent whole pointed at
 * Projects, so installing People alone was refused on a record without them; a link to a list the record will not
 * hold is left out, the way onboarding leaves it out (`install.ts` `moduleDocument`). And the examples are the record's
 * use case's, or none: a module added here never brings the sample studio's rows into somebody's record.
 */
export async function packDocument(id: string, installed?: readonly PackState[], usecase?: string): Promise<Record<string, unknown> | null> {
  const seed = await import('@braindog/seed');
  if (id === seed.AGENTS_PACK.manifest.id) return seed.agentsPackDocument();
  if (installed === undefined) return seed.firstPartyDocument(id);
  const { moduleDocument, dayOf } = await import('@braindog/seed/usecases/install');
  const { useCase } = await import('@braindog/seed/usecases');
  const on = installed.filter((p) => p.disabled_at === null);
  const own = seed.FIRST_PARTY.includes(id as never) ? seed.firstPartyManifest(id as never).provides : [];
  const holds = [...on.flatMap((p) => p.registers), ...own.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []))];
  const speaking = on.find((p) => p.id.startsWith('usecase-'))?.id.slice('usecase-'.length);
  /* THE USE CASE BEING INSTALLED, WHEN ONE IS, so a module it brings carries its examples, targets and words: Personal
     installed from browse on an empty record was given Money with a business's sums and "Money in arrives late by". */
  const u = (usecase === undefined ? undefined : useCase(usecase)) ?? (speaking === undefined ? undefined : useCase(speaking));
  const doc = u ? moduleDocument(u, id, { today: dayOf(Date.now()), holds }) : seed.firstPartyDocument(id, { holds, seeds: [] });
  if (doc && Array.isArray(doc.seeds) && doc.seeds.length === 0) delete doc.seeds;
  return doc;
}

/**
 * A module already on this record as the use case being added would install it, with no example rows, or `null` when that
 * use case gives the module no words or targets of its own (`install.ts` `relabels`). A module installed before a use case
 * keeps the words it went in with, and this is the update the plan offers for it.
 */
export async function relabelDocument(id: string, installed: readonly PackState[], usecase: string): Promise<Record<string, unknown> | null> {
  const { moduleDocument, relabels, dayOf } = await import('@braindog/seed/usecases/install');
  const { useCase } = await import('@braindog/seed/usecases');
  const u = useCase(usecase);
  if (!u || !relabels(u, id)) return null;
  const holds = installed.filter((p) => p.disabled_at === null).flatMap((p) => p.registers);
  const doc = moduleDocument(u, id, { today: dayOf(Date.now()), holds });
  if (doc) delete doc.seeds;
  return doc;
}

/**
 * Ask the record what installing a document would do. The plan is what the screen draws, and its `planHash` is what
 * Install sends back, so what installs is what was shown.
 */
export async function planInstall(client: Installer, id: string, doc: Record<string, unknown>, nameOf: (kind: 'register' | 'page', id: string) => string): Promise<Answer<Offer>> {
  const planned = said(await client.planPack({ doc, source: { kind: 'local' } }));
  if (!planned.ok) return planned;
  const diff = (planned.value as { diff?: { calls_out?: unknown; approve?: unknown } } | null)?.diff;
  const plan = planOf(diff, nameOf);
  if (!plan) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: copy.writeRaced } };
  const approve = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  return { ok: true, value: { id, doc, plan, calls: callsOutOf(diff?.calls_out), approve } };
}

/**
 * Install the plan that was shown. `PLAN_STALE` means the record moved since, so it is planned again and the fresh plan
 * comes back beside the sentence, for the person to read before pressing again.
 */
export async function installPlanned(
  client: Installer,
  offer: Offer,
  nameOf: (kind: 'register' | 'page', id: string) => string,
): Promise<{ ok: true } | { ok: false; fix: string; again: Offer | null }> {
  const out = said(
    await client.installPack({ doc: offer.doc, source: { kind: 'local' }, planHash: offer.plan.planHash, ...(offer.approve.length > 0 ? { approve: offer.approve } : {}) }),
  );
  if (out.ok) return { ok: true };
  if (out.refusal.code !== 'PLAN_STALE') return { ok: false, fix: out.refusal.fix, again: null };
  const fresh = await planInstall(client, offer.id, offer.doc, nameOf);
  return fresh.ok ? { ok: false, fix: out.refusal.fix, again: fresh.value } : { ok: false, fix: fresh.refusal.fix, again: null };
}

/**
 * Which source these screens read, and IT IS NOT DECIDED HERE ANY MORE.
 *
 * `sampled` IS THE SHELL'S ANSWER, WHICH IS `boot`'s. The root layout asks `readBoot` once for the
 * tab and hands every screen the result as `data.live`. This module used to ask its own first call
 * the same question, against its own copy of the two refusals that mean there is no record here, so
 * there were two answers in the product to one question about one record. Nothing had to be broken
 * for them to differ: a single transient `UNREACHABLE` on `packs` was enough for `/start` to believe
 * it was on the demo while the list that draws its rows was live, and a row typed against one is not
 * a row the other will show.
 *
 * A REFUSAL IS STILL THE RECORD'S OWN, AND NOW ALL OF THEM ARE. On a record the first answer is
 * whatever the record said, `UNREACHABLE` included, because the shell has already established that
 * there is a record there to refuse. Falling back to the sample on that code would be this module
 * overruling the one call that is entitled to decide it.
 */
export async function choose(client: Caller, sampled: boolean): Promise<{ source: Source; first: Answer<PackState[]> }> {
  const source = sampled ? sample() : live(client);
  return { source, first: await source.packs() };
}

/** The same source for one add-on's settings, from the same answer and never from a second probe. */
export async function openSettings(client: Caller, id: string, sampled: boolean): Promise<{ source: Source; first: Answer<PackConfig> }> {
  const source = sampled ? sample() : live(client);
  return { source, first: await source.config(id) };
}

/* ── the settings form ──────────────────────────────────────────────────── */

export const words = {
  settings: 'Settings',
  /* THE ONE SENTENCE. The record fills `{{config:}}` when a pack is installed, so a saved value waits for that. */
  when: 'A change takes effect the next time this add-on is installed or updated, unless the setting says it is held at once.',
  save: 'Save',
  reset: 'Reset',
  saved: (names: readonly string[]) => `Saved ${names.join(', ')}.`,
  changed: (names: readonly string[]) => `${names.join(', ')} changed`,
  unit: 'Unit',
  units: { days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds' },
} as const;

export type Unit = keyof typeof words.units;

/** Largest first, so a stored duration is drawn in the biggest unit it is a whole number of. */
export const UNITS: readonly (readonly [Unit, number])[] = [
  ['days', 86_400],
  ['hours', 3_600],
  ['minutes', 60],
  ['seconds', 1],
];

/** What one control holds while somebody edits it. Each type reads the part that is its own. */
export type Draft = { text: string; on: boolean; unit: Unit };

type Money = { amount: number; currency: string };
const isMoney = (v: unknown): v is Money =>
  typeof v === 'object' && v !== null && typeof (v as Money).amount === 'number' && typeof (v as Money).currency === 'string';

/** A setting's name as a person reads it: the manifest's label, or its key in words. */
export const labelOf = (key: string, decl: ConfigDecl): string =>
  decl.label ?? key.replace(/_/g, ' ').replace(/^./u, (c) => c.toUpperCase());

/**
 * The currency a money setting is typed in: its own value's, its default's, or else the first other
 * money setting's in the same add-on. Printed beside the box and never typed, as the row form does.
 */
export function currencyOf(settings: PackConfig, key: string): string | null {
  const own = [settings.values[key], settings.config[key]?.default].find(isMoney);
  if (own) return own.currency;
  for (const [k, d] of Object.entries(settings.config)) {
    const other = d.type === 'money' ? [settings.values[k], d.default].find(isMoney) : undefined;
    if (other) return other.currency;
  }
  return null;
}

/** The control's starting state for a stored value. */
export function draftOf(decl: ConfigDecl, value: unknown): Draft {
  const blank: Draft = { text: '', on: false, unit: 'days' };
  if (value === null || value === undefined) return blank;
  switch (decl.type) {
    case 'bool':
      return { ...blank, on: value === true };
    case 'money': {
      if (!isMoney(value)) return blank;
      const exp = exponentOf(value.currency);
      return { ...blank, text: (value.amount / 10 ** exp).toFixed(exp) };
    }
    case 'duration': {
      const n = Number(value);
      const [unit, size] = UNITS.find(([, s]) => Number.isInteger(n) && n % s === 0) ?? ['seconds', 1];
      return { ...blank, text: String(n / size), unit };
    }
    default:
      return { ...blank, text: String(value) };
  }
}

/**
 * The value a control would send, or why it cannot be sent yet.
 *
 * ONLY MONEY IS CHECKED HERE, with the row form's own two sentences, because a figure in the wrong
 * shape would be rounded into a different amount. Everything else goes as typed, and the record's
 * refusal is what is shown beside the field.
 */
export function valueOf(decl: ConfigDecl, draft: Draft, currency: string | null): { ok: true; value: unknown } | { ok: false; why: string } {
  switch (decl.type) {
    case 'bool':
      return { ok: true, value: draft.on };
    case 'money': {
      const raw = draft.text.trim();
      if (currency === null) return { ok: true, value: raw };
      const exp = exponentOf(currency);
      if (!/^-?\d+(\.\d+)?$/u.test(raw)) return { ok: false, why: copy.moneyShape };
      if ((raw.split('.')[1] ?? '').length > exp) return { ok: false, why: copy.moneyPlaces(exp) };
      return { ok: true, value: { amount: Math.round(Number(raw) * 10 ** exp), currency } };
    }
    case 'duration': {
      const raw = draft.text.trim();
      const size = UNITS.find(([u]) => u === draft.unit)?.[1] ?? 1;
      return { ok: true, value: /^\d+$/u.test(raw) ? Number(raw) * size : raw };
    }
    case 'number': {
      /* SENT AS A NUMBER WHEN IT READS AS ONE, and as typed otherwise, so the record's refusal says what is wrong. */
      const raw = draft.text.trim();
      return { ok: true, value: /^-?\d+(\.\d+)?$/u.test(raw) ? Number(raw) : raw };
    }
    default:
      /* AN EMPTY BOX IS NO VALUE, so a setting with no default that nobody filled in has not moved. */
      return { ok: true, value: draft.text === '' ? null : draft.text };
  }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether a setting holds its default, so Reset has nothing to do. */
export const isDefault = (decl: ConfigDecl, value: unknown): boolean => same(value, decl.default);

/** What Save would send: only the settings whose value moved, and the ones that cannot be sent yet. */
export function changesOf(settings: PackConfig, drafts: Readonly<Record<string, Draft>>): { values: Record<string, unknown>; wrong: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const wrong: Record<string, string> = {};
  for (const [key, decl] of Object.entries(settings.config)) {
    const draft = drafts[key];
    if (!draft) continue;
    const out = valueOf(decl, draft, currencyOf(settings, key));
    if (!out.ok) wrong[key] = out.why;
    else if (!same(out.value, settings.values[key])) values[key] = out.value;
  }
  return { values, wrong };
}

/** The setting a refusal names, when it names one, so its sentence is drawn beside that field. */
export const fieldAt = (refusal: Refusal): string | null => (refusal.at?.startsWith('values.') ? refusal.at.slice('values.'.length) : null);

/**
 * Whether the answer to a refusal is signing in again: a session that is not a browser's, or not the
 * owner's. The same two the Agents settings and the Vault offer the button for.
 */
export const signInFor = (refusal: Refusal): boolean => refusal.code === 'NEEDS_BROWSER_SESSION' || refusal.code === 'FORBIDDEN';

/* ── the sample ─────────────────────────────────────────────────────────── */

/**
 * Which sample packs lean on which, as the seed's do: every first-party list points at a project, so
 * Portfolio is the one that cannot go off alone.
 */
export const LEANS_ON: Readonly<Record<string, readonly string[]>> = {
  agents: ['portfolio'],
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
  /* WHAT SOMEBODY CHOSE IN THIS TAB, by add-on. A setting that is absent holds its default. */
  const chosen = new Map<string, Record<string, unknown>>();
  const settingsOf = (id: string): PackConfig => {
    const config = (PACK_SETTINGS[id] ?? {}) as Record<string, ConfigDecl>;
    const set = chosen.get(id) ?? {};
    const values = Object.fromEntries(Object.entries(config).map(([k, d]) => [k, k in set ? set[k] : (d.default ?? null)]));
    return { id, version: known(id)?.version ?? null, config, values };
  };

  return {
    sample: true,

    /* NOTHING LEAVES THE SAMPLE. It answers with the sentence the screen has always shown, so the demo says what an
       uninstall would do rather than acting one out. */
    uninstall: async (id) =>
      known(id)
        ? { ok: true, value: { id, said: copy.notWritten(copy.uninstallWould(known(id)?.name ?? id)) } }
        : unknown(id, 'id'),

    config: async (id) => (known(id) ? { ok: true, value: settingsOf(id) } : unknown(id, 'id')),

    /* THE RECORD'S OWN CHECKS, the ones a form cannot make for itself: the names, and an enum's values. */
    setConfig: async (id, values) => {
      if (!known(id)) return unknown(id, 'id');
      if (Object.keys(values).length === 0) return refuse('REQUIRED_MISSING', 'values is a map of setting names to the value each should hold.', { at: 'values' });
      const current = settingsOf(id);
      const declared = Object.keys(current.config);
      const set = { ...(chosen.get(id) ?? {}) };
      for (const [key, value] of Object.entries(values)) {
        const decl = current.config[key];
        if (!decl)
          return refuse('FIELD_UNKNOWN', declared.length === 0 ? `${id} declares no settings.` : `${id} has no setting called ${key}. It has ${declared.join(', ')}.`, {
            at: `values.${key}`,
            allowed: declared,
          });
        if (value === null) delete set[key];
        else if (decl.type === 'enum' && !decl.values?.includes(String(value)))
          return refuse('ENUM_VALUE_UNKNOWN', `The setting ${key} is one of ${decl.values?.join(', ')}, and ${JSON.stringify(value)} is not.`, {
            at: `values.${key}`,
            allowed: decl.values ?? [],
          });
        else set[key] = value;
      }
      chosen.set(id, set);
      const next = settingsOf(id);
      const changed = declared.filter((k) => JSON.stringify(next.values[k]) !== JSON.stringify(current.values[k]));
      const names = changed.map((k) => labelOf(k, next.config[k] as ConfigDecl));
      return { ok: true, value: { ...next, changed, said: copy.notWritten(words.changed(names)) } };
    },
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
