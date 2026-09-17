/**
 * Arranging a BrainDog by proposal: what an agent or Spark reads first, what it may ask for, and what
 * the owner's press applies (`loop/research-spark.md` S12, `loop/DIRECTION.md` §11).
 *
 * THE RECORD HAD NO WAY TO BE ARRANGED BY ANYBODY BUT ITS OWNER IN A BROWSER. Installing a pack, turning
 * one on or off and changing its settings are `ADMIN`, and no token of any scope reaches them (ADR-060).
 * That stays true. What is added is the question: a `pack`, `settings` or `arrange` suggestion, which is
 * filed with everything the owner needs to answer it and changes nothing until they accept it.
 *
 * WHAT A PROPOSAL WOULD DO IS WORKED OUT HERE, NEVER TAKEN FROM THE PROPOSER. The packs it installs, in
 * order, what each one adds, the calls out it asks the owner to approve and the settings as they stand
 * are all read from the catalogue and the record when the question is filed. Anything the proposer wrote
 * under those keys is dropped. On acceptance each pack is planned again, and a pack that now calls out
 * something the question did not show is refused `PLAN_STALE` rather than armed.
 *
 * THE CORE NAMES NO USE CASE. What a host offers is its catalogue, handed in as data; the only convention
 * read here is `declare`'s own, that a use case's pack is `usecase-<id>` and its voice is `voice_<key>`.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { normalise, packIdOf, plan, install, unresolvedFault, VOICE_KEYS, voiceSetting, type Host, type Installed, type Pack, type VoiceKey } from '@braindog/declare';
import { configValue, type ConfigDecl, type Declaration, type Kernel } from '@braindog/kernel';

/**
 * One thing a host offers to install: a pack, or a use case and the modules it builds on.
 *
 * `doc` IS A FUNCTION because a document is built when it is asked for, and a catalogue listed on every
 * read should not build nine of them.
 */
export type CatalogueEntry = {
  /** The pack id it installs as: `work`, or `usecase-student`. */
  id: string;
  kind: 'pack' | 'usecase';
  title: string;
  summary: string;
  /** The packs installed before it, in order. */
  modules: readonly string[];
  /**
   * The document to install, for a record that holds `holds` once the packs before it are in, so a link to a list
   * the record will not hold can be left out, and whose use case is `usecase` (its id, `team`), so a module carries
   * that use case's example rows as onboarding gives them, or none.
   */
  doc: (options: { holds: readonly string[]; usecase?: string | null }) => Record<string, unknown> | null;
  /**
   * What the installer does once the pack is in, through the ordinary write path: a use case links its example rows
   * to each other by title, because a seed carries no link (42 §5.2). OPTIONAL, and never a reason to fail the install.
   */
  afterInstall?: (io: RowIo) => Promise<unknown>;
};

/** The rows of a list, and one link set on one row, as the owner who accepted. */
export type RowIo = {
  rows: (register: string) => Promise<readonly { seq: number | null; fields: Record<string, unknown> }[] | null>;
  link: (register: string, seq: number, field: string, spoken: string) => Promise<boolean>;
};

type Body = Record<string, unknown>;

export type ArrangeDeps = {
  kernel: Kernel;
  catalogue: readonly CatalogueEntry[];
  installed: () => Installed;
  host: (actor: string) => Host;
};

/** A use case's pack starts with this, by `declare`'s own convention. */
const USE_CASE = packIdOf('');

const isMap = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);
const refuse = <T>(code: Refusal['code'], fix: string, at?: string, allowed?: readonly string[]): Result<T> => ({
  ok: false,
  refusal: { code, fix, ...(at === undefined ? {} : { at }), ...(allowed === undefined ? {} : { allowed }) },
});
const listed = (items: readonly string[]): string => (items.length === 0 ? 'none' : items.slice(0, 20).join(', '));

export function arranger(d: ArrangeDeps) {
  const { kernel, catalogue } = d;
  const states = () => kernel.packStates();
  const stateOf = (id: string) => states().find((s) => s.id === id);
  const on = (id: string) => stateOf(id)?.disabled_at === null;
  const entryOf = (id: string): CatalogueEntry | undefined =>
    catalogue.find((e) => e.id === id) ?? catalogue.find((e) => e.kind === 'usecase' && e.id === packIdOf(id));
  const useCaseOn = (): string | null => states().find((s) => s.id.startsWith(USE_CASE) && s.disabled_at === null)?.id ?? null;
  const waiting = (): string[] => {
    const open = kernel.openSuggestions();
    return open.ok ? open.value.filter((r) => r.body_kind === 'arrange').map((r) => String(r.id)) : [];
  };

  const notOffered = (id: string, at: string): Result<never> =>
    refuse(
      'DECLARATION_UNKNOWN',
      catalogue.length === 0
        ? `This host offers no catalogue, so ${id} cannot be found by name. Send the pack document as doc.`
        : `There is no pack called ${id} on offer here. Read arrangement for what is offered: ${listed(catalogue.map((e) => e.id))}.`,
      at,
    );

  /* ── reading ─────────────────────────────────────────────────────────── */

  /**
   * How this BrainDog is arranged, compactly: its packs, what else is on offer, its voice and other
   * settings, the pages the caller can open, and the arrangements already waiting.
   */
  function overview(pages: readonly { slug: string; title: string }[]): Body {
    const packs = states();
    const settings: Record<string, Body> = {};
    for (const p of packs) {
      if (p.disabled_at !== null) continue;
      const config = kernel.packConfig(p.id);
      if (!config.ok) continue;
      const values = Object.fromEntries(Object.entries(config.value.values).filter(([key]) => !key.startsWith('voice_')));
      if (Object.keys(values).length > 0) settings[p.id] = values;
    }
    const voicePack = useCaseOn();
    const said: Body = {};
    if (voicePack) {
      const config = kernel.packConfig(voicePack);
      if (config.ok)
        for (const key of VOICE_KEYS) {
          const v = config.value.values[voiceSetting(key)];
          if (typeof v === 'string' && v) said[key] = v;
        }
    }
    const held = new Set(packs.map((p) => p.id));
    return {
      packs: packs.map((p) => ({ id: p.id, ...(p.version === null ? {} : { version: p.version }), ...(p.disabled_at === null ? {} : { off: true }) })),
      offer: catalogue
        .filter((e) => !held.has(e.id))
        /* A PACK IS ITS ID AND ONE LINE; a use case says so, and its title, because that is what a person is offered. */
        .map((e) => ({
          id: e.id,
          ...(e.kind === 'usecase' ? { usecase: e.title } : {}),
          summary: e.summary,
          ...(e.modules.length === 0 ? {} : { modules: e.modules }),
        })),
      /* THE KEYS ARE IN braindog:grammar/proposals, read once; here is only what this record says. */
      voice: { pack: voicePack, said },
      ...(Object.keys(settings).length === 0 ? {} : { settings }),
      pages: pages.map((p) => ({ slug: p.slug, title: p.title })),
      waiting: waiting(),
    };
  }

  /** One page's declaration, as installed, to read before proposing a change to it. */
  function declaration(asked: string, pages: readonly { slug: string }[]): Result<Body> {
    const id = asked.startsWith('page.') ? asked : `page.${asked}`;
    const visible = pages.some((p) => `page.${p.slug}` === id);
    const row = visible ? kernel.declarations().find((r) => r.id === id && r.kind === 'page') : undefined;
    if (!row)
      return refuse(
        'PAGE_UNKNOWN',
        `There is no page declaration ${id} that you can read. The pages are: ${listed(pages.map((p) => p.slug))}.`,
        'page',
      );
    const body = JSON.parse(row.body) as Body;
    return ok({ id: row.id, version: row.version, pack: row.pack_id ?? (typeof body.pack === 'string' ? body.pack : null), body });
  }

  /* ── filing ──────────────────────────────────────────────────────────── */

  /** The packs to install and to turn on, dependencies first, for what was asked. Already on is skipped. */
  function expand(ids: readonly string[], at: string, docs: ReadonlyMap<string, Body>): Result<{ install: string[]; enable: string[] }> {
    const install: string[] = [];
    const enable: string[] = [];
    const seen = new Set<string>();
    for (const [i, asked] of ids.entries()) {
      const entry = entryOf(asked);
      const target = entry?.id ?? asked;
      if (!entry && !docs.has(target)) return notOffered(asked, `${at}[${i}]`);
      for (const id of [...(entry?.modules ?? []), target]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const state = stateOf(id);
        if (state && state.disabled_at === null) continue;
        if (state) enable.push(id);
        else if (entryOf(id) || docs.has(id)) install.push(id);
        else return notOffered(id, `${at}[${i}]`);
      }
    }
    return ok({ install, enable });
  }

  type Planned = { plan: Body[]; approve: string[]; batch: Declaration[]; config: Map<string, Record<string, ConfigDecl>> };

  /** Each pack planned in order, each against the record as the ones before it would leave it. Nothing is written. */
  async function planAll(ids: readonly string[], docs: ReadonlyMap<string, Body>): Promise<Result<Planned>> {
    const base = d.installed();
    let state: Installed = { ...base, packs: [...base.packs], declarations: [...base.declarations] };
    const out: Planned = { plan: [], approve: [], batch: [], config: new Map() };
    for (const id of ids) {
      const read = await packOf(id, docs, heldBy(state), useCaseFor(ids));
      if (!read.ok) return read;
      const pack = read.value;
      const diff = await plan(pack, state);
      const unheld = unresolvedFault(diff);
      if (unheld) return { ok: false, refusal: unheld };
      const clash = diff.conflicts[0];
      if (clash)
        return refuse('PROVIDES_CONFLICT', `${id} would take over ${clash.id}, which ${clash.pack} holds. Leave ${id} out, or retire ${clash.id} first.`, 'body.packs');
      out.plan.push({
        pack: id,
        version: pack.manifest.version,
        adds: diff.adds.map((a) => a.id),
        ...(diff.changes.length === 0 ? {} : { changes: diff.changes.map((c) => c.id) }),
        ...(diff.seeds.count === 0 ? {} : { examples: diff.seeds.count }),
      });
      out.approve.push(...diff.approve.filter((line) => !out.approve.includes(line)));
      out.config.set(id, pack.manifest.config ?? {});
      for (const decl of pack.declarations) out.batch.push({ id: decl.id, kind: decl.kind, body: decl.body, pack: id });
      state = {
        ...state,
        packs: [...state.packs, { id, version: pack.manifest.version }],
        declarations: [
          ...state.declarations,
          ...pack.declarations.map((decl) => ({ id: decl.id, version: 1, kind: decl.kind, pack_id: id, body: decl.canonical, checksum: '' })),
        ],
      };
    }
    return ok(out);
  }

  /** The lists a declaration state holds. */
  const heldBy = (state: Installed): string[] =>
    state.declarations.filter((decl) => decl.kind === 'register').map((decl) => decl.id.slice('register.'.length));

  /**
   * THE USE CASE A MODULE IS INSTALLED FOR: the one this proposal installs, else the one already on. A module added by a
   * proposal carried no examples where onboarding gives it the use case's, so the two paths made different records.
   */
  const useCaseFor = (installing: readonly string[]): string | null =>
    ([...installing].reverse().find((id) => id.startsWith(USE_CASE)) ?? useCaseOn())?.slice(USE_CASE.length) ?? null;

  async function packOf(id: string, docs: ReadonlyMap<string, Body>, holds: readonly string[], usecase: string | null): Promise<Result<Pack>> {
    const doc = docs.get(id) ?? entryOf(id)?.doc({ holds, usecase }) ?? null;
    if (!doc) return notOffered(id, 'body.packs');
    const pack = await normalise(doc, { kind: 'local' });
    if (!pack.ok) return pack;
    if (pack.value.manifest.pack !== id)
      return refuse('VALUE_MALFORMED', `The document names its pack ${pack.value.manifest.pack}, and the proposal asks for ${id}. Make the two agree.`, 'body.doc');
    return pack;
  }

  /** One settings change, checked against the pack's declared settings, with the values it replaces. */
  function settingsOf(raw: Body, at: string, pending: ReadonlyMap<string, Record<string, ConfigDecl>>): Result<Body> {
    const pack = String(raw.pack);
    const values = (isMap(raw.values) ? raw.values : {}) as Body;
    let config: Record<string, ConfigDecl>;
    let current: Body = {};
    const coming = pending.get(pack);
    if (coming) config = coming;
    else {
      const read = kernel.packConfig(pack);
      if (!read.ok)
        return refuse(
          'DECLARATION_UNKNOWN',
          `${pack} is not installed, so it has no settings to change. Install it in the same arrangement, or propose installing it first.`,
          `${at}.pack`,
        );
      config = read.value.config as Record<string, ConfigDecl>;
      current = read.value.values as Body;
    }
    const keys = Object.keys(config);
    for (const [key, value] of Object.entries(values)) {
      const decl = config[key];
      if (!decl) return refuse('FIELD_UNKNOWN', `${pack} has no setting called ${key}. Its settings are: ${listed(keys)}.`, `${at}.values.${key}`, keys.slice(0, 32));
      if (value === null) continue;
      const fits = configValue(key, decl, value, `${at}.values.${key}`);
      if (!fits.ok) return fits as Result<Body>;
    }
    const before = Object.fromEntries(Object.keys(values).map((key) => [key, current[key] ?? (coming ? (config[key]?.default ?? null) : null)]));
    return ok({ pack, values, before });
  }

  /** `{"voice":{"home":"Today"}}` as the settings of the use case's pack: the one being installed, or the one on. */
  function voiceOf(raw: unknown, at: string, installing: readonly string[]): Result<Body> {
    if (!isMap(raw) || Object.keys(raw).length === 0)
      return refuse('VALUE_MALFORMED', `voice is a map of voice keys to short lines, such as {"home":"Today"}. The keys are: ${VOICE_KEYS.join(', ')}.`, at);
    const pack = [...installing].reverse().find((id) => id.startsWith(USE_CASE)) ?? useCaseOn();
    if (!pack)
      return refuse(
        'REQUIRED_MISSING',
        'No use case is installed, so this BrainDog speaks in the house voice and has no voice to change. Install a use case in the same arrangement, then set its voice.',
        at,
      );
    const values: Body = {};
    for (const [key, line] of Object.entries(raw)) {
      if (!(VOICE_KEYS as readonly string[]).includes(key))
        return refuse('FIELD_UNKNOWN', `${key} is not a voice key. The keys are: ${VOICE_KEYS.join(', ')}.`, `${at}.${key}`, VOICE_KEYS);
      values[voiceSetting(key as VoiceKey)] = line;
    }
    return ok({ pack, values });
  }

  /**
   * A `pack`, `settings` or `arrange` body as it is filed: what was asked, and what it would do.
   *
   * ONLY THE KEYS A PROPOSER MAY WRITE ARE READ. Everything the owner is shown about the consequences is
   * this function's, so a proposer cannot describe a pack as friendlier than it is.
   */
  async function prepare(kind: 'pack' | 'settings' | 'arrange', body: Body): Promise<Result<Body>> {
    if (kind === 'settings') {
      if (body.voice !== undefined) {
        const said = voiceOf(body.voice, 'body.voice', []);
        if (!said.ok) return said;
        return settingsOf(said.value, 'body', new Map());
      }
      if (typeof body.pack !== 'string' || !isMap(body.values)) return ok(body);
      return settingsOf(body, 'body', new Map());
    }

    if (kind === 'pack') {
      if (typeof body.enable === 'string' || typeof body.disable === 'string') {
        const verb = typeof body.enable === 'string' ? 'enable' : 'disable';
        const id = String(body[verb]);
        const state = stateOf(id);
        if (!state) return refuse('DECLARATION_UNKNOWN', `${id} is not installed here, so it cannot be turned ${verb === 'enable' ? 'on' : 'off'}. Propose install instead.`, `body.${verb}`);
        if ((state.disabled_at === null) === (verb === 'enable'))
          return refuse('TRANSITION_ILLEGAL', `${id} is already ${verb === 'enable' ? 'on' : 'off'}.`, `body.${verb}`);
        return ok({ [verb]: id, registers: state.registers });
      }
      if (typeof body.install !== 'string') return ok(body);
      const asked = body.install;
      const target = entryOf(asked)?.id ?? asked;
      if (on(target))
        return refuse('TRANSITION_ILLEGAL', `${target} is already installed and on. To change what it says, propose body_kind settings.`, 'body.install');
      const docs = new Map<string, Body>(isMap(body.doc) ? [[target, body.doc]] : []);
      const order = expand([asked], 'body.install', docs);
      if (!order.ok) return order;
      const planned = await planAll(order.value.install, docs);
      if (!planned.ok) return planned;
      const entry = entryOf(target);
      return ok({
        install: target,
        ...(entry ? { kind: entry.kind, title: entry.title, summary: entry.summary } : {}),
        packs: { install: order.value.install, ...(order.value.enable.length === 0 ? {} : { enable: order.value.enable }) },
        plan: planned.value.plan,
        approve: planned.value.approve,
        ...(isMap(body.doc) ? { doc: body.doc } : {}),
      });
    }

    /* AN ARRANGEMENT: packs, then pages, then settings, each checked against what the ones before would leave. */
    const packs = isMap(body.packs) ? body.packs : {};
    const asked = [
      ...(typeof body.usecase === 'string' ? [packIdOf(body.usecase.replace(new RegExp(`^${USE_CASE}`), ''))] : []),
      ...(Array.isArray(packs.install) ? packs.install.map(String) : []),
    ];
    const order = expand([...new Set(asked)], 'body.packs.install', new Map());
    if (!order.ok) return order;
    const enable = [...order.value.enable];
    for (const [i, id] of (Array.isArray(packs.enable) ? packs.enable.map(String) : []).entries()) {
      const state = stateOf(id);
      if (!state) return refuse('DECLARATION_UNKNOWN', `${id} is not installed here, so it cannot be turned on. Put it under packs.install.`, `body.packs.enable[${i}]`);
      if (state.disabled_at !== null && !enable.includes(id)) enable.push(id);
    }
    const disable: string[] = [];
    for (const [i, id] of (Array.isArray(packs.disable) ? packs.disable.map(String) : []).entries()) {
      if (!on(id)) return refuse('TRANSITION_ILLEGAL', `${id} is not on, so there is nothing to turn off.`, `body.packs.disable[${i}]`);
      disable.push(id);
    }
    const planned = await planAll(order.value.install, new Map());
    if (!planned.ok) return planned;

    const pages: Body[] = [];
    const installed = kernel.declarations();
    for (const raw of Array.isArray(body.pages) ? body.pages : []) {
      if (!isMap(raw)) continue;
      const was = installed.find((r) => r.id === raw.id);
      pages.push({ id: raw.id, kind: 'page', body: raw.body, was: was ? was.version : null });
    }
    if (pages.length > 0) {
      const fault = kernel.lint([...planned.value.batch, ...pages.map((p) => ({ id: String(p.id), kind: 'page' as const, body: p.body as never }))]);
      if (fault) return { ok: false, refusal: { ...fault, at: `body.pages${fault.at ? `: ${fault.at}` : ''}` } };
    }

    const settings: Body[] = [];
    for (const [i, raw] of (Array.isArray(body.settings) ? body.settings : []).entries()) {
      if (!isMap(raw)) continue;
      const one = settingsOf(raw, `body.settings[${i}]`, planned.value.config);
      if (!one.ok) return one;
      settings.push(one.value);
    }
    if (body.voice !== undefined) {
      const said = voiceOf(body.voice, 'body.voice', order.value.install);
      if (!said.ok) return said;
      const one = settingsOf(said.value, 'body.voice', planned.value.config);
      if (!one.ok) return one;
      settings.push(one.value);
    }

    return ok({
      ...(typeof body.usecase === 'string' ? { usecase: body.usecase } : {}),
      why: body.why,
      packs: {
        ...(order.value.install.length === 0 ? {} : { install: order.value.install }),
        ...(enable.length === 0 ? {} : { enable }),
        ...(disable.length === 0 ? {} : { disable }),
      },
      ...(planned.value.plan.length === 0 ? {} : { plan: planned.value.plan, approve: planned.value.approve }),
      ...(pages.length === 0 ? {} : { pages }),
      ...(settings.length === 0 ? {} : { settings }),
    });
  }

  /* ── applying, after the owner's press ───────────────────────────────── */

  /**
   * An accepted proposal, carried out: packs installed in order, then turned on and off, then pages, then
   * settings. The first that will not land stops the rest and is the answer, and the caller reopens the
   * question with what was already done in its sentence.
   */
  /** The catalogue entry's own step after its pack is in. A throw or a refusal in it leaves the install as it is. */
  async function afterInstall(id: string, actor: string): Promise<void> {
    const step = entryOf(id)?.afterInstall;
    if (!step) return;
    const io: RowIo = {
      rows: async (register) => {
        const read = kernel.list({ register, limit: 200 });
        return read.ok ? read.value.rows : null;
      },
      link: async (register, seq, field, spoken) =>
        kernel.update(register, `${register}#${seq}`, { [field]: spoken }, { actor, cascade: false, note: 'Linked an example to the example it belongs with.' }).ok,
    };
    await step(io).catch(() => undefined);
  }

  async function apply(kind: 'pack' | 'settings' | 'arrange', body: Body, actor: string): Promise<Result<Body>> {
    const done: { installed: string[]; enabled: string[]; disabled: string[]; pages: string[]; settings: string[] } = {
      installed: [],
      enabled: [],
      disabled: [],
      pages: [],
      settings: [],
    };
    const stopped = <T>(r: Result<T>): Result<Body> => {
      const refusal = (r as { refusal?: Refusal }).refusal ?? { code: 'VALUE_MALFORMED' as const, fix: 'It would not apply.' };
      const kept = [...done.installed, ...done.enabled, ...done.disabled, ...done.pages, ...done.settings];
      return { ok: false, refusal: { ...refusal, fix: kept.length === 0 ? refusal.fix : `${refusal.fix} Already applied, and kept: ${kept.join(', ')}.` } };
    };

    const packs = (isMap(body.packs) ? body.packs : {}) as { install?: string[]; enable?: string[]; disable?: string[] };
    const settings: Body[] = kind === 'settings' ? [body] : Array.isArray(body.settings) ? (body.settings as Body[]) : [];
    const enable = kind === 'pack' && typeof body.enable === 'string' ? [body.enable] : (packs.enable ?? []);
    const disable = kind === 'pack' && typeof body.disable === 'string' ? [body.disable] : (packs.disable ?? []);
    const approved = Array.isArray(body.approve) ? (body.approve as string[]) : [];
    const docs = new Map<string, Body>(kind === 'pack' && typeof body.install === 'string' && isMap(body.doc) ? [[body.install, body.doc]] : []);

    for (const id of packs.install ?? []) {
      if (on(id)) continue;
      if (stateOf(id)) {
        const back = await kernel.enablePack(id, { actor });
        if (!back.ok) return stopped(back);
        done.enabled.push(id);
        continue;
      }
      const state = d.installed();
      const pack = await packOf(id, docs, heldBy(state), useCaseFor(packs.install ?? []));
      if (!pack.ok) return stopped(pack);
      const diff = await plan(pack.value, state);
      const unshown = diff.approve.filter((line) => !approved.includes(line));
      if (unshown.length > 0)
        return stopped(refuse('PLAN_STALE', `${id} now calls out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
      const put = await install(pack.value, diff, d.host(actor), diff.planHash, diff.approve);
      if (!put.ok) return stopped(put);
      done.installed.push(id);
      await afterInstall(id, actor);
    }
    for (const id of enable) {
      if (on(id)) continue;
      const back = await kernel.enablePack(id, { actor });
      if (!back.ok) return stopped(back);
      done.enabled.push(id);
    }
    for (const id of disable) {
      if (!on(id)) continue;
      const off = kernel.disablePack(id, { actor });
      if (!off.ok) return stopped(off);
      done.disabled.push(id);
    }
    for (const page of Array.isArray(body.pages) ? (body.pages as Body[]) : []) {
      const put = await kernel.install([{ id: String(page.id), kind: 'page', body: page.body as never }]);
      if (!put.ok) return stopped(put);
      done.pages.push(String(page.id));
    }
    for (const s of settings) {
      const set = kernel.setPackConfig(String(s.pack), s.values, { actor });
      if (!set.ok) return stopped(set);
      done.settings.push(String(s.pack));
    }
    return ok(Object.fromEntries(Object.entries(done).filter(([, v]) => v.length > 0)));
  }

  return { overview, declaration, prepare, apply };
}
