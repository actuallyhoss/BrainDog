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
import { labelsOf, laterVersion, normalise, packIdOf, plan, readShared, install, unresolvedFault, SPEAKS, VOICE_KEYS, speakingPack, voiceOf as voiceIn, voiceSetting, voiceWrites, type Host, type Installed, type Pack, type VoiceKey } from '@braindog/declare';
import { configValue, ulids, type ConfigDecl, type Declaration, type Kernel } from '@braindog/kernel';

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
   * The version `doc` builds, when the host knows it without building one, so a pack on at an older version is offered as
   * an update. Absent, the document is built to read it, and only for a pack a proposal names.
   */
  version?: string | undefined;
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
  /**
   * What an update from an older version moves: numbers the older version kept typed, written as the rows the newer one
   * reads (`@braindog/seed` `carryForward`). Run wherever the record updates the pack, from the app, an agent's accepted
   * proposal or any other caller, after the install and before its examples are linked. OPTIONAL, and never a reason to fail.
   */
  carry?: (io: CarryIo, from: string) => Promise<number>;
  /** The skills a use case names for agents working in it, which Spark offers once it is on (`loop/research-spark.md` S9). */
  skills?: readonly { name: string; trigger: string }[] | undefined;
};

/** The rows of a list, and one link set on one row, as the owner who accepted. */
export type RowIo = {
  rows: (register: string) => Promise<readonly { seq: number | null; fields: Record<string, unknown> }[] | null>;
  link: (register: string, seq: number, field: string, spoken: string) => Promise<boolean>;
};

/** A `RowIo` that also writes a row and empties one field, as the owner who pressed. */
export type CarryIo = RowIo & {
  create: (register: string, fields: Record<string, unknown>) => Promise<boolean>;
  clear: (register: string, seq: number, field: string) => Promise<boolean>;
};

/** The ordinary write path as an install's steps use it, signed by `actor`. */
export function rowIo(kernel: Kernel, actor: string): CarryIo {
  return {
    rows: async (register) => {
      const read = kernel.list({ register, limit: 200 });
      return read.ok ? read.value.rows : null;
    },
    link: async (register, seq, field, spoken) =>
      kernel.update(register, `${register}#${seq}`, { [field]: spoken }, { actor, cascade: false, note: 'Linked an example to the example it belongs with.' }).ok,
    create: async (register, fields) => kernel.create(register, fields as never, { actor, note: 'Carried forward from before the update.' }).ok,
    clear: async (register, seq, field) =>
      kernel.update(register, `${register}#${seq}`, { [field]: null }, { actor, cascade: false, note: 'Carried forward into its own row.' }).ok,
  };
}

/**
 * The catalogue's carry for a pack just updated from `from`, when it has one. Answers how many were moved; nothing when the
 * pack was new, the catalogue has no step, or the step throws.
 */
export async function carryUpdate(catalogue: readonly CatalogueEntry[], kernel: Kernel, id: string, from: string | null, actor: string): Promise<number> {
  const step = from === null ? undefined : catalogue.find((e) => e.id === id)?.carry;
  if (!step || from === null) return 0;
  return step(rowIo(kernel, actor), from).catch(() => 0);
}

type Body = Record<string, unknown>;

export type ArrangeDeps = {
  kernel: Kernel;
  catalogue: readonly CatalogueEntry[];
  installed: () => Installed;
  host: (actor: string) => Host;
};

/** A use case's pack starts with this, by `declare`'s own convention. */
const USE_CASE = packIdOf('');

/** The record's packs with each use case's `speaks` setting read, as the voice rule reads them. */
const speakingStates = (kernel: Kernel) =>
  kernel.packStates().map((p) => {
    if (!p.id.startsWith(USE_CASE)) return { id: p.id, disabled_at: p.disabled_at };
    const read = kernel.packConfig(p.id);
    const said = read.ok ? read.value.values[SPEAKS] : null;
    return { id: p.id, disabled_at: p.disabled_at, speaks: typeof said === 'boolean' ? said : null };
  });

/** The use case this record speaks in now, by the voice rule (`declare` `voiceWhenAdding`), or `null` for the house voice. */
export const speakingNow = (kernel: Kernel): string | null => speakingPack(speakingStates(kernel));

/**
 * Write the voice rule down with `speaker` speaking (`declare` `voiceWrites`): it set to speak and every other use case on
 * set not to, only where that differs. A pack that refuses the setting is passed over; the rule still names one speaker.
 */
export function writeVoice(kernel: Kernel, speaker: string, actor: string): void {
  /* ONE BATCH FOR THE ANSWER, so a reader of the log (Home's feed) reads these lines as one change and never pairs them with
     another write's by where they sit. */
  const batch = ulids(() => Date.now())();
  for (const w of voiceWrites(speakingStates(kernel), speaker)) kernel.setPackConfig(w.id, { [SPEAKS]: w.speaks }, { actor, batch });
}

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
  /** The version on offer for a pack, from the catalogue or the document sent with the proposal. */
  const offeredVersion = (id: string, docs: ReadonlyMap<string, Body>): string | null => {
    const sent = docs.get(id)?.version;
    if (typeof sent === 'string') return sent;
    const entry = entryOf(id);
    if (!entry) return null;
    if (entry.version !== undefined) return entry.version;
    const built = entry.doc({ holds: heldBy(d.installed()), usecase: null })?.version;
    return typeof built === 'string' ? built : null;
  };
  /**
   * AN UPDATE: a pack on at a version older than the one on offer. It is planned and installed like any other, over the one
   * there, and the catalogue's carry step moves what the older version kept typed (`carryUpdate`).
   */
  const updateOf = (id: string, docs: ReadonlyMap<string, Body>): { from: string; to: string } | null => {
    const held = stateOf(id);
    if (!held || held.disabled_at !== null || held.version === null) return null;
    const offered = offeredVersion(id, docs);
    return offered !== null && offered !== held.version && laterVersion(offered, held.version) === offered ? { from: held.version, to: offered } : null;
  };
  const speakerNow = (): string | null => speakingNow(kernel);
  /* THE USE CASE SPEAKING, by the rule and the setting a person chose, never simply the first one on. */
  const useCaseOn = (): string | null => speakerNow();
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
      /* A PACK ON AT AN OLDER VERSION THAN THE ONE OFFERED, which a `pack` install proposal updates. */
      ...(() => {
        const updates = packs.flatMap((p) => {
          const version = p.disabled_at === null && p.version !== null ? entryOf(p.id)?.version : undefined;
          return version !== undefined && version !== p.version && laterVersion(version, p.version) === version ? [{ id: p.id, from: p.version, to: version }] : [];
        });
        return updates.length === 0 ? {} : { updates };
      })(),
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

  /**
   * The packs to install and to turn on, dependencies first, for what was asked. Already on is skipped, unless a newer
   * version is offered: of what was asked, or of a module under it, which the shared-file install already plans.
   */
  function expand(ids: readonly string[], at: string, docs: ReadonlyMap<string, Body>, sent: ReadonlyMap<string, readonly string[]> = new Map()): Result<{ install: string[]; enable: string[] }> {
    const install: string[] = [];
    const enable: string[] = [];
    const seen = new Set<string>();
    for (const [i, asked] of ids.entries()) {
      const entry = entryOf(asked);
      const target = entry?.id ?? asked;
      if (!entry && !docs.has(target)) return notOffered(asked, `${at}[${i}]`);
      for (const id of [...(entry?.modules ?? sent.get(target) ?? []), target]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const state = stateOf(id);
        if (state && state.disabled_at === null) {
          if (updateOf(id, docs)) install.push(id);
          continue;
        }
        if (state) enable.push(id);
        else if (entryOf(id) || docs.has(id)) install.push(id);
        else return notOffered(id, `${at}[${i}]`);
      }
    }
    return ok({ install, enable });
  }

  type Planned = { plan: Body[]; approve: string[]; batch: Declaration[]; config: Map<string, Record<string, ConfigDecl>>; packs: Map<string, Pack> };

  /** Each pack planned in order, each against the record as the ones before it would leave it. Nothing is written. */
  async function planAll(ids: readonly string[], docs: ReadonlyMap<string, Body>): Promise<Result<Planned>> {
    const base = d.installed();
    let state: Installed = { ...base, packs: [...base.packs], declarations: [...base.declarations] };
    const out: Planned = { plan: [], approve: [], batch: [], config: new Map(), packs: new Map() };
    for (const id of ids) {
      const read = await packOf(id, docs, heldBy(state), useCaseFor(ids, id));
      if (!read.ok) return read;
      const pack = read.value;
      const diff = await plan(pack, state);
      const unheld = unresolvedFault(diff);
      if (unheld) return { ok: false, refusal: unheld };
      const clash = diff.conflicts[0];
      if (clash)
        return refuse('PROVIDES_CONFLICT', `${id} would take over ${clash.id}, which ${clash.pack} holds. Leave ${id} out, or retire ${clash.id} first.`, 'body.packs');
      const from = state.packs.find((p) => p.id === id)?.version ?? null;
      out.plan.push({
        pack: id,
        ...(from === null ? {} : { from }),
        version: pack.manifest.version,
        adds: diff.adds.map((a) => a.id),
        ...(diff.changes.length === 0 ? {} : { changes: diff.changes.map((c) => c.id) }),
        /* WHAT AN UPDATE TAKES AWAY, with the rows it keeps, so Decide says it beside what it adds. */
        ...(diff.retires.length === 0 ? {} : { retires: diff.retires.map((x) => ({ id: x.id, rows: x.rows })) }),
        ...(diff.seeds.count === 0 ? {} : { examples: diff.seeds.count }),
      });
      out.approve.push(...diff.approve.filter((line) => !out.approve.includes(line)));
      out.config.set(id, pack.manifest.config ?? {});
      out.packs.set(id, pack);
      for (const decl of pack.declarations) out.batch.push({ id: decl.id, kind: decl.kind, body: decl.body, pack: id });
      state = {
        ...state,
        packs: [...state.packs.filter((p) => p.id !== id), { id, version: pack.manifest.version }],
        declarations: [
          ...state.declarations.filter((decl) => decl.pack_id !== id),
          ...pack.declarations.map((decl) => ({ id: decl.id, version: 1, kind: decl.kind, pack_id: id, body: decl.canonical, checksum: '' })),
        ],
      };
    }
    return ok(out);
  }

  /**
   * WHAT DECIDE CALLS EACH LIST AND PAGE A PROPOSAL NAMES, as the rail will once it is accepted. Decide named a use case's
   * Home page from its id, "Home personal", and a list by the build's word, Things, where the rail says Projects, because
   * a catalogue pack is filed without its document. So the record files the names: a list by the label the use case
   * speaking afterwards gives it, else its declared name; that use case's Home page by its voice, else a page by its title.
   *
   * A LIST ALREADY HERE IS NAMED ONLY WHEN THE PROPOSAL MOVES THE VOICE. Otherwise its name is the one the rail draws when
   * Decide is opened, which a later switch may change, and a name filed now would go stale beside it.
   */
  function namesFor(planned: Planned, speaker: string | null): Record<string, string> {
    let values: Record<string, unknown> = {};
    let config: Record<string, { label?: unknown }> = {};
    if (speaker !== null) {
      const coming = planned.packs.get(speaker)?.manifest.config ?? {};
      const read = kernel.packConfig(speaker);
      const now = read.ok ? read.value : { values: {}, config: {} };
      config = { ...(now.config as Record<string, { label?: unknown }>), ...coming };
      values = { ...Object.fromEntries(Object.entries(coming).map(([k, decl]) => [k, decl.default ?? null])), ...(now.values as Record<string, unknown>) };
    }
    const labels = labelsOf(values, config);
    const home = voiceIn(values).home;
    const out: Record<string, string> = {};
    const moves = speaker !== speakerNow();
    if (moves) for (const [key, word] of Object.entries(labels)) if (/^[a-z][a-z0-9_]*$/u.test(key)) out[`register.${key}`] = word;
    for (const pack of planned.packs.values()) {
      for (const decl of pack.declarations) {
        const body = decl.body as Body;
        if (decl.kind === 'register') {
          const name = typeof body.name === 'string' ? body.name : null;
          const bare = decl.id.slice('register.'.length);
          if (out[decl.id] === undefined && name !== null && (moves || kernel.register(bare) === undefined)) out[decl.id] = labels[bare] ?? name;
        } else if (decl.kind === 'page') {
          const title = typeof body.title === 'string' && !body.title.includes('{{') ? body.title : null;
          const said = speaker !== null && home !== undefined && decl.id === `page.home-${speaker.slice(USE_CASE.length)}` ? home : title;
          if (said !== null) out[decl.id] = said;
        }
      }
    }
    return out;
  }

  /** The lists a declaration state holds. */
  const heldBy = (state: Installed): string[] =>
    state.declarations.filter((decl) => decl.kind === 'register').map((decl) => decl.id.slice('register.'.length));

  /**
   * THE USE CASE A MODULE IS INSTALLED FOR: the one this proposal installs, else the one already on. A module added by a
   * proposal carried no examples where onboarding gives it the use case's, so the two paths made different records.
   */
  const useCaseFor = (installing: readonly string[], id?: string): string | null => {
    /* A MODULE GOES IN FOR THE USE CASE AFTER IT IN THE ORDER, so with Student beside Personal, Money carries Personal's
       examples and not Student's. */
    const from = id === undefined ? -1 : installing.indexOf(id);
    const next = from < 0 ? undefined : installing.slice(from).find((x) => x.startsWith(USE_CASE));
    return (next ?? [...installing].reverse().find((x) => x.startsWith(USE_CASE)) ?? useCaseOn())?.slice(USE_CASE.length) ?? null;
  };

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
    /* A LONG LABEL IS KEPT AS `lk_<hash>`, which says nothing to the owner, and Decide has no declared settings to read it
       through when the pack is not on yet. Its title goes with it, as the setting was declared. */
    const titles = Object.fromEntries(Object.keys(values).flatMap((key) => (/^lk_[0-9a-f]{8}$/u.test(key) && typeof config[key]?.label === 'string' ? [[key, config[key].label]] : [])));
    return ok({ pack, values, before, ...(Object.keys(titles).length === 0 ? {} : { titles }) });
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
        /* TURNING A PACK ON ARMS WHAT IT CALLS OUT AGAIN, so the owner is shown those lines, as an install shows them. */
        const calls = verb === 'enable' ? kernel.callsWhenEnabled(id) : [];
        return ok({ [verb]: id, registers: state.registers, ...(calls.length === 0 ? {} : { approve: calls }) });
      }
      /* A SHARED USE-CASE FILE, as `braindog usecase install` sends it. It is read through the door the app and `planUseCase`
         read one through (`readShared`: the size, a credential, a block kind nothing draws), and becomes the install of its
         pack with the document it carries and the modules it names. A token files the question; only the owner installs. */
      let fromFile: { title: string; summary: string; modules: readonly string[] } | null = null;
      if (body.file !== undefined) {
        if (typeof body.file !== 'string' && !isMap(body.file))
          return refuse('VALUE_MALFORMED', 'file is a .usecase.json file, as its text or its document.', 'body.file');
        const shared = await readShared(body.file, { kind: 'paste' });
        if (!shared.ok) {
          const r = 'refusal' in shared ? shared.refusal : ({ code: 'PACK_MALFORMED', fix: 'This is not a use-case file.' } as Refusal);
          return { ok: false, refusal: { ...r, at: r.at ? `body.file.${r.at}` : 'body.file' } };
        }
        const u = shared.value.usecase;
        if (shared.value.doc === null)
          return refuse('PACK_MALFORMED', `${u.title} carries no lists or pages of its own, only the modules it names: ${listed(u.modules)}. Propose installing those instead.`, 'body.file');
        body = { install: packIdOf(u.usecase), doc: shared.value.doc };
        fromFile = { title: u.title, summary: u.summary, modules: u.modules };
      }
      if (typeof body.install !== 'string') return ok(body);
      const asked = body.install;
      const target = entryOf(asked)?.id ?? asked;
      /* A DOCUMENT IS FOR A PACK THE CATALOGUE LACKS, as the grammar says. One sent for a pack the host offers was filed under the
         catalogue's title and summary, so a propose token could put its own pages, rules and version in front of the owner as
         "Study". What the host offers is installed from the host's own document; a shared file says its own name. */
      if (fromFile === null && isMap(body.doc) && entryOf(asked) !== undefined)
        return refuse(
          'VALUE_MALFORMED',
          `${target} is on offer here, so it is installed from this host's own document. Propose {"install":"${asked}"} without doc.`,
          'body.doc',
        );
      const docs = new Map<string, Body>(isMap(body.doc) ? [[target, body.doc]] : []);
      const sent = new Map<string, readonly string[]>(fromFile === null ? [] : [[target, fromFile.modules]]);
      /* AN UPDATE OF A MODULE UNDER IT is an update too: Personal at its version with Money behind is planned for Money. */
      if (on(target) && ![...(entryOf(asked)?.modules ?? sent.get(target) ?? []), target].some((id) => on(id) && updateOf(id, docs)))
        return refuse(
          'TRANSITION_ILLEGAL',
          `${target} is already installed and on, at ${stateOf(target)?.version ?? 'its version'}, and no newer version is offered. To change what it says, propose body_kind settings.`,
          'body.install',
        );
      const order = expand([asked], 'body.install', docs, sent);
      if (!order.ok) return order;
      const planned = await planAll(order.value.install, docs);
      if (!planned.ok) return planned;
      const entry = entryOf(target);
      /* A USE CASE ADDED BESIDE THE ONE SPEAKING KEEPS THAT VOICE, and Decide says whose. An update changes no voice. */
      const speaker = speakerNow();
      const keeps = target.startsWith(USE_CASE) && !on(target) && speaker !== null && speaker !== target ? speaker : null;
      const names = namesFor(planned.value, keeps ?? (target.startsWith(USE_CASE) && !on(target) ? target : speaker));
      return ok({
        install: target,
        /* A FILE IS SAID BY ITS OWN TITLE, even over a catalogue use case with the same id: it is what the owner was asked about. */
        ...(fromFile ? { kind: 'usecase', title: fromFile.title, summary: fromFile.summary } : entry ? { kind: entry.kind, title: entry.title, summary: entry.summary } : {}),
        ...(keeps === null ? {} : { keeps }),
        packs: { install: order.value.install, ...(order.value.enable.length === 0 ? {} : { enable: order.value.enable }) },
        plan: planned.value.plan,
        approve: planned.value.approve,
        ...(Object.keys(names).length === 0 ? {} : { names }),
        ...(isMap(body.doc) ? { doc: body.doc } : {}),
      });
    }

    /* AN ARRANGEMENT: packs, then pages, then settings, each checked against what the ones before would leave. */
    const packs = isMap(body.packs) ? body.packs : {};
    const lead = typeof body.usecase === 'string' ? packIdOf(body.usecase.replace(new RegExp(`^${USE_CASE}`), '')) : null;
    /* A USE CASE BESIDE THE ONE SPEAKING, by the voice rule every other door keeps (`declare` `voiceWhenAdding`): it
       installs after the lead and never changes who speaks, whichever way its id sorts, because accepting writes the
       answer down (`apply`). */
    const beside: string[] = [];
    if (body.alongside !== undefined) {
      if (!Array.isArray(body.alongside) || body.alongside.some((x) => typeof x !== 'string'))
        return refuse('VALUE_MALFORMED', 'alongside is a list of use case ids from offer, such as ["student"].', 'body.alongside');
      if (lead === null && speakerNow() === null)
        return refuse('REQUIRED_MISSING', 'A use case goes beside the one this BrainDog speaks in, and none is on. Name one as usecase, and the others beside it.', 'body.alongside');
      for (const [i, raw] of (body.alongside as string[]).entries()) {
        const id = packIdOf(raw.replace(new RegExp(`^${USE_CASE}`), ''));
        const entry = entryOf(id);
        if (!entry || entry.kind !== 'usecase') return notOffered(raw, `body.alongside[${i}]`);
        beside.push(id);
      }
    }
    const asked = [...(lead === null ? [] : [lead]), ...beside, ...(Array.isArray(packs.install) ? packs.install.map(String) : [])];
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

    const names = namesFor(planned.value, lead ?? speakerNow() ?? order.value.install.find((id) => id.startsWith(USE_CASE)) ?? null);
    return ok({
      ...(typeof body.usecase === 'string' ? { usecase: body.usecase } : {}),
      ...(beside.length === 0 ? {} : { alongside: beside.map((id) => id.slice(USE_CASE.length)) }),
      why: body.why,
      packs: {
        ...(order.value.install.length === 0 ? {} : { install: order.value.install }),
        ...(enable.length === 0 ? {} : { enable }),
        ...(disable.length === 0 ? {} : { disable }),
      },
      ...(planned.value.plan.length === 0 ? {} : { plan: planned.value.plan }),
      ...((approve) => (approve.length === 0 ? {} : { approve }))([...new Set([...planned.value.approve, ...enable.flatMap((id) => kernel.callsWhenEnabled(id))])]),
      ...(pages.length === 0 ? {} : { pages }),
      ...(settings.length === 0 ? {} : { settings }),
      ...(Object.keys(names).length === 0 ? {} : { names }),
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
    await step(rowIo(kernel, actor)).catch(() => undefined);
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

    const steps = Array.isArray(body.plan) ? (body.plan as Body[]) : [];
    const spokeBefore = speakerNow();
    for (const id of packs.install ?? []) {
      /* AN UPDATE THE OWNER ACCEPTED goes in over the pack that is on, unless that pack is already at the planned version. */
      const step = steps.find((s) => s.pack === id);
      const held = stateOf(id)?.version ?? null;
      const updating = on(id) && typeof step?.from === 'string' && typeof step.version === 'string' && held !== step.version && laterVersion(step.version, held) === step.version;
      if (on(id) && !updating) continue;
      if (stateOf(id) && !updating) {
        const unshown = kernel.callsWhenEnabled(id).filter((line) => !approved.includes(line));
        if (unshown.length > 0)
          return stopped(refuse('PLAN_STALE', `${id} would call out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
        const back = await kernel.enablePack(id, { actor });
        if (!back.ok) return stopped(back);
        done.enabled.push(id);
        continue;
      }
      const state = d.installed();
      const pack = await packOf(id, docs, heldBy(state), useCaseFor(packs.install ?? [], id));
      if (!pack.ok) return stopped(pack);
      const diff = await plan(pack.value, state);
      const unshown = diff.approve.filter((line) => !approved.includes(line));
      if (unshown.length > 0)
        return stopped(refuse('PLAN_STALE', `${id} now calls out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
      const from = state.packs.find((p) => p.id === id)?.version ?? null;
      const put = await install(pack.value, diff, d.host(actor), diff.planHash, diff.approve);
      if (!put.ok) return stopped(put);
      done.installed.push(id);
      await carryUpdate(d.catalogue, kernel, id, from, actor);
      await afterInstall(id, actor);
    }
    for (const id of enable) {
      if (on(id)) continue;
      const unshown = kernel.callsWhenEnabled(id).filter((line) => !approved.includes(line));
      if (unshown.length > 0)
        return stopped(refuse('PLAN_STALE', `${id} would call out something this proposal did not show: ${unshown.join('; ')}. Propose it again.`, 'body.approve'));
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
    /* THE VOICE RULE, WRITTEN DOWN (`declare` `voiceWrites`). The use case an arrangement sets the record up for speaks;
       any other use case this press added or turned on goes beside the one that spoke before, which keeps its voice. Every
       use case on is then set to speak or not, so a third one, or an id that sorts first, never moves it. */
    const lead = kind === 'arrange' && typeof body.usecase === 'string' ? packIdOf(body.usecase.replace(new RegExp(`^${USE_CASE}`), '')) : null;
    const updated = new Set(steps.filter((s) => typeof s.from === 'string').map((s) => String(s.pack)));
    const joined = [...done.installed.filter((id) => !updated.has(id)), ...done.enabled].filter((id) => id.startsWith(USE_CASE));
    if (lead !== null || joined.length > 0) {
      const speaker = (lead !== null && on(lead) ? lead : null) ?? (spokeBefore !== null && on(spokeBefore) ? spokeBefore : null) ?? speakerNow();
      if (speaker !== null) writeVoice(kernel, speaker, actor);
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
