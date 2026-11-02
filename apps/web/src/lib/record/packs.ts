/**
 * Turning an add-on off and on, for `/packs`.
 *
 * THE RECORD OR ITS REFUSAL. The screen reads a `Source`, which is the record over HTTP. There was a
 * second one, a sample of six installed add-ons held in the tab with its own copy of which leans on
 * which, drawn when no record answered; it went with the sample, and with no record the screen
 * draws the record's own sentence for why.
 *
 * PURE, AND THEREFORE TESTABLE, for the reason `device.ts` gives: `node --test` cannot import a
 * `.svelte.ts` file, so the state and the reading of a refusal live here and the screen only assigns.
 */

import { CORE_PACK } from '@braindog/declare';
import { exponentOf } from 'braindog-render';

import { copy } from '../copy.ts';
import { callsOutOf, type CallOut } from './actions.ts';
import { planOf, type Plan } from './keychain.ts';
import { isProof } from '../reauth/ask.ts';

/** A refusal as the record writes one, with only the keys this screen reads. */
export type Refusal = { code: string; fix: string; at?: string | undefined; allowed?: readonly string[] | undefined };

export type Answer<T> = { ok: true; value: T } | { ok: false; refusal: Refusal };

/** One pack, on or off, as `packs` answers. `version` is `null` for a pack the seed owns by its bodies. */
export type PackState = { id: string; version: string | null; disabled_at: string | null; registers: string[] };

/** What `disablePack` and `enablePack` answer. */
export type PackToggle = { id: string; state: 'enabled' | 'disabled'; changed: boolean; packs: string[]; declarations: string[]; said: string };

/** The seven types a setting may take. */
export type ConfigType = 'text' | 'enum' | 'bool' | 'money' | 'day' | 'duration' | 'number' | 'list' | 'secret';

/** One setting as `packConfig` answers it. `max` bounds a `list`'s item count. */
export type ConfigDecl = { type: ConfigType; values?: readonly string[]; default?: unknown; label?: string; note?: string; max?: number };

/** What `packConfig` answers: what the manifest declares, and the value each setting holds now. */
export type PackConfig = { id: string; version: string | null; config: Record<string, ConfigDecl>; values: Record<string, unknown> };

/** What `setPackConfig` answers. */
export type ConfigSaved = PackConfig & { changed: string[]; said: string };

export type Source = {
  packs(): Promise<Answer<PackState[]>>;
  disable(id: string, alsoDisable?: readonly string[]): Promise<Answer<PackToggle>>;
  enable(id: string): Promise<Answer<PackToggle>>;
  config(id: string): Promise<Answer<PackConfig>>;
  /** Only the settings that changed. `null` puts one back to its default. */
  setConfig(id: string, values: Record<string, unknown>): Promise<Answer<ConfigSaved>>;
  /** Take an add-on back out. Its declarations go and its rows stay. */
  uninstall(id: string): Promise<Answer<Uninstalled>>;
};

/** What `uninstallPack` answers, with only the key read here. */
export type Uninstalled = { id: string };

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
      : { ok: false, refusal: { code: 'VERSION_STALE', fix: 'Something changed while this was sent. Try again.' } };

export function live(client: Caller): Source {
  return {
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
  installPack(args: { doc: unknown; source?: { kind: string }; planHash: string; approve?: string[]; retireWithRows?: boolean }): Promise<Wire<unknown>>;
};

/** A plan somebody is reading: the record's diff in the screen's words, the calls it makes, and the lines Install approves. */
export type Offer = {
  id: string;
  doc: Record<string, unknown>;
  plan: Plan;
  calls: CallOut[];
  approve: string[];
  /** The plan takes a list away that still holds items, keeping them (`Diff.removals`); Install on it says so. */
  removes: boolean;
};

/**
 * The document behind a catalogue entry, or `null` for one nothing ships yet.
 *
 * LOADED WHEN INSTALL IS PRESSED, because the seed is every first-party declaration and most visits never install.
 *
 * FOR THE RECORD IT GOES INTO, WHEN THE SCREEN KNOWS WHICH PACKS THAT RECORD HOLDS. People sent whole pointed at
 * Projects, so installing People alone was refused on a record without them; a link to a list the record will not
 * hold is left out, the way onboarding leaves it out (`install.ts` `moduleDocument`). And it carries no example rows
 * (`moduleDocument`), only the starting set a module gives every record: a module added here never writes a sample's rows.
 */
export async function packDocument(id: string, installed?: readonly PackState[], usecase?: string): Promise<Record<string, unknown> | null> {
  const seed = await import('@braindog/seed/packs');
  /* AGENTS LINKS TO PROJECTS AND NO LONGER NEEDS THEM (1.32.0), so it is cut to the lists the record holds as well. */
  if (id === seed.AGENTS_PACK.manifest.id)
    return seed.agentsPackDocument(installed === undefined ? {} : { holds: installed.filter((p) => p.disabled_at === null).flatMap((p) => p.registers) });
  if (installed === undefined) return seed.firstPartyDocument(id);
  const { moduleDocument, dayOf } = await import('@braindog/seed/usecases/install');
  const { useCase } = await import('@braindog/seed/usecases');
  const on = installed.filter((p) => p.disabled_at === null);
  const own = seed.FIRST_PARTY.includes(id as never) ? seed.firstPartyManifest(id as never).provides : [];
  const holds = [...on.flatMap((p) => p.registers), ...own.flatMap((p) => (p.startsWith('register.') ? [p.slice('register.'.length)] : []))];
  const speaking = on.find((p) => p.id.startsWith('usecase-'))?.id.slice('usecase-'.length);
  /* THE USE CASE BEING INSTALLED, WHEN ONE IS, so a module it brings carries its targets and words: Personal
     installed from browse on an empty record was given Money with a business's sums and "Money in arrives late by". */
  const u = (usecase === undefined ? undefined : useCase(usecase)) ?? (speaking === undefined ? undefined : useCase(speaking));
  /* THE ROWS ARE `moduleDocument`'S TO CHOOSE, WITH A USE CASE OR WITHOUT ONE. This asked for the module with `seeds: []`
     when no use case spoke, and so dropped the starting set a module plants on every record along with the examples: a
     module turned on from here arrived with a list its first entry had nowhere to go in. */
  return moduleDocument(u ?? null, id, { today: dayOf(Date.now()), holds });
}

/**
 * The modules this build ships at a later version than the record holds, each on: `{ id, from, to }`.
 *
 * A MODULE TURNED ON BY ITSELF WAS NEVER OFFERED ITS NEWER VERSION. /packs hid an installed pack from Install and had no
 * Update, browse offers updates only through a use case, and Slash reads only a shared catalogue, so a record that took
 * Work alone stayed on the version it started with. /packs offers these through the same plan an install gets.
 */
export async function moduleUpdates(states: readonly PackState[]): Promise<{ id: string; from: string; to: string }[]> {
  const seed = await import('@braindog/seed/packs');
  const { compareVersions } = await import('@braindog/declare/catalogue');
  const shipped = new Map<string, string>([...seed.FIRST_PARTY.map((id) => [id, seed.FIRST_PARTY_VERSIONS[id]] as const), [seed.AGENTS_PACK.manifest.id, seed.AGENTS_PACK.manifest.version]]);
  return states.flatMap((s) => {
    const to = shipped.get(s.id);
    /* CORE IS PART OF BRAINDOG, not an add-on: it is kept current by the night and never offered as an update. */
    return s.id !== CORE_PACK && to !== undefined && s.version !== null && s.disabled_at === null && compareVersions(s.version, to) < 0 ? [{ id: s.id, from: s.version, to }] : [];
  });
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
  /* WHAT `moduleDocument` CARRIES STAYS IN: no examples, and the module's starting set. Deleting `seeds` here made the
     update a different document from the one a first install sends, and an install plants only into a list it adds
     (`seedsFor`), so a list this record already holds is written nothing. */
  return moduleDocument(u, id, { today: dayOf(Date.now()), holds });
}

/**
 * Ask the record what installing a document would do. The plan is what the screen draws, and its `planHash` is what
 * Install sends back, so what installs is what was shown.
 */
export async function planInstall(client: Installer, id: string, doc: Record<string, unknown>, nameOf: (kind: 'register' | 'page' | 'metric', id: string) => string): Promise<Answer<Offer>> {
  const planned = said(await client.planPack({ doc, source: { kind: 'local' } }));
  if (!planned.ok) return planned;
  const diff = (planned.value as { diff?: { calls_out?: unknown; approve?: unknown; removals?: unknown } } | null)?.diff;
  const plan = planOf(diff, nameOf);
  if (!plan) return { ok: false, refusal: { code: 'VALUE_MALFORMED', fix: copy.writeRaced } };
  const approve = Array.isArray(diff?.approve) ? diff.approve.filter((l): l is string => typeof l === 'string') : [];
  const removes = Array.isArray(diff?.removals) && diff.removals.length > 0;
  return { ok: true, value: { id, doc, plan, calls: callsOutOf(diff?.calls_out), approve, removes } };
}

/**
 * Install the plan that was shown. `PLAN_STALE` means the record moved since, so it is planned again and the fresh plan
 * comes back beside the sentence, for the person to read before pressing again.
 */
export async function installPlanned(
  client: Installer,
  offer: Offer,
  nameOf: (kind: 'register' | 'page' | 'metric', id: string) => string,
): Promise<{ ok: true } | { ok: false; fix: string; again: Offer | null }> {
  const out = said(
    await client.installPack({
      doc: offer.doc,
      source: { kind: 'local' },
      planHash: offer.plan.planHash,
      ...(offer.approve.length > 0 ? { approve: offer.approve } : {}),
      ...(offer.removes ? { retireWithRows: true } : {}),
    }),
  );
  if (out.ok) return { ok: true };
  if (out.refusal.code !== 'PLAN_STALE') return { ok: false, fix: out.refusal.fix, again: null };
  const fresh = await planInstall(client, offer.id, offer.doc, nameOf);
  return fresh.ok ? { ok: false, fix: out.refusal.fix, again: fresh.value } : { ok: false, fix: fresh.refusal.fix, again: null };
}

/**
 * The source these screens read, and its first answer.
 *
 * THE RECORD IS ASKED WHATEVER THE SHELL SAID. `choose` took the shell's `boot` answer and drew the sample when it said
 * there was no record, so a signed-out `/packs` listed six add-ons nobody installed with switches that moved in the tab.
 * With no sample, the record's own refusal is the answer: a 401 says to sign in, a dead network says it was not reached.
 *
 * `_shell` IS HEARD AND NOT OBEYED. `/start` and `/packs/browse` still pass `!page.data.live`; it can go once neither
 * does. It was never a witness anyway: the refused shell is built by `layoutOf`, which sets `live: true`, so every
 * caller passed `false`.
 *
 * A REFUSAL IS THE RECORD'S OWN, ALL OF THEM. Falling back on `UNREACHABLE` is what once let `/start` believe it was on
 * the demo while the list that draws its rows was live, and a row typed against one is not a row the other will show.
 */
export async function choose(client: Caller, _shell?: boolean): Promise<{ source: Source; first: Answer<PackState[]> }> {
  const source = live(client);
  return { source, first: await source.packs() };
}

/** The same source for one add-on's settings. */
export async function openSettings(client: Caller, id: string): Promise<{ source: Source; first: Answer<PackConfig>; alone: boolean }> {
  const source = live(client);
  const first = await source.config(id);
  /* WHETHER THIS USE CASE IS THE ONLY ONE ON, because "Speaks for this BrainDog" is only written down once two are
     (`voice.ts` `voiceWrites`), and drawn off it said the opposite of what the rail says. */
  const held = await source.packs().catch(() => null);
  const on = held?.ok ? held.value.filter((p) => /^usecase-/u.test(p.id) && p.disabled_at === null) : [];
  return { source, first, alone: on.length === 1 && on[0]?.id === id };
}

/* ── the settings form ──────────────────────────────────────────────────── */

export const words = {
  settings: 'Settings',
  /** The two parts of an add-on's What this adds, named so a list and the page of the same name read as two things. */
  addsLists: 'Lists',
  addsPages: 'Pages',
  /* THE ONE SENTENCE. The record fills `{{config:}}` when a pack is installed, so a saved value waits for that. */
  when: 'A change takes effect the next time this add-on is installed or updated, unless the setting says it is held at once.',
  save: 'Save',
  reset: 'Reset',
  /* A BLANK SUM SAYS IT IS BLANK: its currency in front of an empty box read as a value. */
  notSet: 'Not set',
  /* AN EMPTY LIMIT IS NO LIMIT, said in its box (audit 31 Oct g, AG29). */
  noLimit: 'No limit',
  moreLimits: (n: number) => `Show ${n} more ${n === 1 ? 'limit' : 'limits'}`,
  /** Settings still holding the words the add-on ships, folded (L45). */
  moreSettings: (n: number) => `Show ${n} more ${n === 1 ? 'setting' : 'settings'}, as the add-on ships them`,
  saved: (names: readonly string[]) => `Saved ${names.join(', ')}.`,
  speaksAlone: 'It is the only starter on, so BrainDog speaks in its words. This becomes a choice when a second one is on.',
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
  /* AN ADD-ON THAT DECLARES A HOME CURRENCY TAKES ITS SUMS IN IT once one is chosen, so a person whose money is in pounds
     types a limit in pounds; the record holds a figure to it in that currency (`declare.ts` `liveTarget`). */
  const home = typeof settings.values.home_currency === 'string' ? settings.values.home_currency.trim().toUpperCase() : '';
  if (settings.config.home_currency && settings.config[key]?.type === 'money' && /^[A-Z]{3}$/u.test(home)) return home;
  const own = [settings.values[key], settings.config[key]?.default].find(isMoney);
  if (own) return own.currency;
  for (const [k, d] of Object.entries(settings.config)) {
    const other = d.type === 'money' ? [settings.values[k], d.default].find(isMoney) : undefined;
    if (other) return other.currency;
  }
  return null;
}

/**
 * A money setting still held in a currency other than the one its box is typed in, as it reads: `GBP 50,000.00`. Drawn
 * faintly in the empty box, so a person sees the limit that holds until they type one in the box's currency.
 */
export function heldElsewhere(settings: PackConfig, key: string): string | null {
  const value = settings.values[key];
  const currency = currencyOf(settings, key);
  if (!isMoney(value) || currency === null || value.currency === currency) return null;
  return `${value.currency} ${draftOf(settings.config[key]!, value).text}`;
}

/** The control's starting state for a stored value. A sum in another currency than the box's starts empty. */
export function draftOf(decl: ConfigDecl, value: unknown, currency: string | null = null): Draft {
  const blank: Draft = { text: '', on: false, unit: 'days' };
  if (value === null || value === undefined) return blank;
  if (decl.type === 'money' && currency !== null && isMoney(value) && value.currency !== currency) return blank;
  switch (decl.type) {
    case 'bool':
      return { ...blank, on: value === true };
    case 'money': {
      if (!isMoney(value)) return blank;
      const exp = exponentOf(value.currency);
      /* GROUPED, AS EVERY OTHER AMOUNT IN THE APP READS: a limit drew as `50000.00` beside its code. `valueOf` reads the commas back. */
      return { ...blank, text: (value.amount / 10 ** exp).toLocaleString('en-GB', { minimumFractionDigits: exp, maximumFractionDigits: exp }) };
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
      const typed = draft.text.trim();
      /* AN EMPTY BOX IS NO LIMIT: money-core ships every ceiling with no default, so an untouched one has not moved, and clearing one sends null. */
      if (typed === '') return { ok: true, value: null };
      /* Thousands grouped as the box first draws them are read as the digits they group; any other comma is refused below. */
      const raw = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/u.test(typed) ? typed.replace(/,/gu, '') : typed;
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
    const currency = currencyOf(settings, key);
    /* A SUM STILL HELD IN ANOTHER CURRENCY HAS NOT MOVED until something is typed over it in the box's currency. */
    const stored = settings.values[key];
    if (decl.type === 'money' && currency !== null && isMoney(stored) && stored.currency !== currency && (draft.text.trim() === '' || draft.text === draftOf(decl, stored).text)) continue;
    const out = valueOf(decl, draft, currency);
    if (!out.ok) wrong[key] = out.why;
    else if (!same(out.value, settings.values[key])) values[key] = out.value;
  }
  return { values, wrong };
}

/** The setting a refusal names, when it names one, so its sentence is drawn beside that field. */
export const fieldAt = (refusal: Refusal): string | null => (refusal.at?.startsWith('values.') ? refusal.at.slice('values.'.length) : null);

/**
 * Whether the answer to a refusal is signing in again: a session that is not a browser's, or not the
 * owner's. The same two the Agents settings and the Keychain offer the button for.
 */
export const signInFor = (refusal: Refusal): boolean => !isProof(refusal) && (refusal.code === 'NEEDS_BROWSER_SESSION' || refusal.code === 'FORBIDDEN');
