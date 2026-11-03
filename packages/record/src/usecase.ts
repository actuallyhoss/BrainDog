/**
 * A BrainDog's arrangement shared as a use case, and a shared one planned for this record.
 *
 * WHAT GOES OUT IS WHAT MAKES THE ARRANGEMENT, AND NONE OF THE RECORD'S ROWS BY DEFAULT. The first-party modules that
 * are on; the enabled use case's own lists and pages; the pages the person placed themselves; the voice and labels as
 * they are set now; and the example rows the caller named by number, never one they did not.
 *
 * WHAT COMES IN IS PLANNED, NEVER INSTALLED, HERE. `plan` reads the file through `declare`'s `readShared`, works out
 * the modules it needs first and plans each pack in order against the record as the ones before it would leave it.
 * Installing is the ordinary `installPack`, one document at a time, with the plan hash and the calls-out lines the
 * owner read: this file adds no second way in.
 *
 * THE CORE NAMES NO USE CASE: the only convention read is `declare`'s, that a use case's pack is `usecase-<id>`.
 */

import type { Refusal, Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import {
  SEEDS_PER_REGISTER,
  exampleFields,
  exportUseCase,
  labelsOf,
  laterVersion,
  nextVersion,
  SHARED_VERSION,
  SPEAKS,
  speakingPack,
  packIdOf,
  plan,
  readShared,
  sharedFileName,
  unfilled,
  voiceOf,
  AUDIENCES,
  type Audience,
  type Diff,
  type ExampleLink,
  type Installed,
  type Pack,
  type PackSource,
} from '@braindog/declare';
import type { Kernel } from '@braindog/kernel';

import type { CatalogueEntry } from './arrange.ts';
import { normaliseChecked, themeFault } from './theme-check.ts';

type Body = Record<string, unknown>;

const USE_CASE = packIdOf('');
const AUDIENCE_BYTES = 40;
const ID = /^[a-z][a-z0-9-]{1,40}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const isMap = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);
const refuse = <T>(code: Refusal['code'], fix: string, at?: string): Result<T> => ({ ok: false, refusal: { code, fix, ...(at === undefined ? {} : { at }) } });

/**
 * A stored declaration body in a pack document's own shape: its kind as the first key, naming it.
 *
 * THE RECORD STORES A BODY CANONICALLY, keys sorted, and a register's name as `id`, so `{ fields, id: 'courses' }` is
 * written back as `{ register: 'courses', fields }`, which is the only form `normalise` reads.
 */
function asWritten(kind: string, body: Body): Body {
  const { [kind]: named, ...rest } = body;
  if (typeof named === 'string') return { [kind]: named, ...rest };
  const { id, ...others } = rest;
  return { [kind]: id, ...others };
}

export type UseCaseDeps = {
  kernel: Kernel;
  catalogue: readonly CatalogueEntry[];
  installed: () => Installed;
};

export type ExportArgs = {
  usecase?: string;
  title?: string;
  summary?: string;
  version?: string;
  audience?: string;
  author?: string;
  /** Example rows to share, by list and row number. Nothing is shared that is not named here. */
  examples?: Record<string, number[]>;
  /** The version step when no version is named: the patch or the minor after the later of the installed and last shared. */
  step?: 'patch' | 'minor';
  /**
   * The rail as the person sees it, as addresses (`/p/<page>`, `/r/<list>`). Only those of the pages and lists this file
   * carries go out, and the carried declarations are written in that order.
   */
  nav?: string[];
  /** The words the arranger listens for, when the person ticked them. */
  signals?: string[];
  /** Rows of the skills list to share, by number, as a name and when to use it. Their text never goes out. */
  skills?: number[];
};

/** One pack as `planUseCase` answers: the document to install and what installing it would do. */
export type PlannedPack = {
  id: string;
  /** `module` for a first-party pack the use case builds on, `usecase` for the pack the file carries. */
  role: 'module' | 'usecase';
  version: string;
  installed_version: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  adds: string[];
  changes: string[];
  retires: string[];
  /**
   * What the update hands to another pack instead of retiring: still live, under that pack's name. Apart from `retires`
   * so a door somebody's Shortcut posts to is not said as taken away, and absent when nothing is handed, so a reader of
   * `retires` as strings reads what it always did.
   */
  hands?: { id: string; to: string }[];
  conflicts: { id: string; pack: string }[];
  unresolved: string[];
  examples: number;
  /** What it calls out, as `plan` answers each action; `approve` is the lines the owner arms at install. */
  calls_out: Diff['calls_out'];
  approve: string[];
  doc: Body;
};

export function useCases(d: UseCaseDeps) {
  const { kernel } = d;

  /* ── going out ────────────────────────────────────────────────────────── */

  /** The arrangement as a use-case file, and the name to save it under. `rows` reads one list for the examples. */
  async function exportFile(args: ExportArgs, rows: (register: string) => Result<{ seq: number | null; fields: Body }[]>): Promise<Result<Body>> {
    const states = kernel.packStates();
    const on = states.filter((s) => s.disabled_at === null);
    /* THE USE CASE SPEAKING, by the voice rule and the `speaks` setting a person chose, when two are on. */
    const speaks = (id: string): boolean | null => {
      const read = kernel.packConfig(id);
      const v = read.ok ? read.value.values[SPEAKS] : null;
      return typeof v === 'boolean' ? v : null;
    };
    const lead = speakingPack(on.filter((s) => s.id.startsWith(USE_CASE)).map((s) => ({ id: s.id, disabled_at: s.disabled_at, speaks: speaks(s.id) })));
    const speaking = on.find((s) => s.id === lead) ?? null;
    const id = args.usecase ?? speaking?.id.slice(USE_CASE.length) ?? 'my-setup';
    if (!ID.test(id)) return refuse('VALUE_MALFORMED', `${id} is not a use case id: lower-case letters, digits and hyphens.`, 'usecase');
    const all = kernel.declarations();
    const settings = speaking ? kernel.packConfig(speaking.id) : null;
    const values = settings?.ok ? (settings.value.values as Body) : {};
    const lastShared = typeof values[SHARED_VERSION] === 'string' ? (values[SHARED_VERSION] as string) : null;
    const version = args.version ?? nextVersion(laterVersion(speaking?.version, lastShared), args.step ?? 'patch');
    if (!SEMVER.test(version)) return refuse('VALUE_MALFORMED', `${version} is not a version. Write 1.0.1.`, 'version');
    /* FREE TEXT ON ONE LINE: `declare`'s AUDIENCES are suggestions, never a closed list, so an audience outside them is
       accepted here too, up to the same 40 bytes `declare` checks it against on the way in. */
    if (args.audience !== undefined && (/[\r\n]/u.test(args.audience) || args.audience.trim() === '' || new TextEncoder().encode(args.audience).length > AUDIENCE_BYTES))
      return refuse('VALUE_MALFORMED', `Say who this is for in a few words on one line, such as ${AUDIENCES.join(', ')}.`, 'audience');

    const config = settings?.ok ? (settings.value.config as Record<string, { default?: unknown; label?: unknown }>) : {};
    /* A HEADING THE VOICE FILLED goes out as its placeholder, from the value now or the default it was installed with. */
    const filled = new Map<string, string>();
    for (const key of Object.keys(config))
      if (key.startsWith('voice_'))
        for (const v of [config[key]?.default, values[key]]) if (typeof v === 'string' && v.trim() !== '') filled.set(v, key);

    const own = all.filter((r) => speaking !== null && r.pack_id === speaking.id);
    /* THE PAGES A PERSON PLACED belong to no pack; a page the seed owns by its body names its pack in it. */
    const placed = all.filter((r) => r.pack_id === null && r.kind === 'page' && !('pack' in (JSON.parse(r.body) as Body)));
    const unordered = [...own, ...placed].map((r) => {
      const body = asWritten(r.kind, JSON.parse(r.body) as Body);
      /* A USE CASE'S HOME IS THE PAGE NAMED FOR IT, so it is renamed with the use case. */
      if (speaking && r.kind === 'page' && body.page === `home-${speaking.id.slice(USE_CASE.length)}`) body.page = `home-${id}`;
      return (r.kind === 'page' ? unfilled(body, filled) : body) as Body;
    });

    /* THE RAIL'S ORDER GOES OUT AS THE PERSON SEES IT, and the declarations follow it, since a record keeps no install
       order of its own. An address that is not one of the carried pages or lists is left out rather than refused: the
       rail also holds the modules' pages, which are not this file's to order. */
    const addressOf = (b: Body): string | null => (typeof b.register === 'string' ? `/r/${b.register}` : typeof b.page === 'string' ? `/p/${b.page}` : null);
    const carried = new Set(unordered.map(addressOf).filter((a): a is string => a !== null));
    const nav = [...new Set((args.nav ?? []).filter((a) => carried.has(a)))];
    const rank = new Map(nav.map((a, i) => [a, i]));
    const slots = unordered.flatMap((b, i) => (rank.has(addressOf(b) ?? '') ? [i] : []));
    const named = slots.map((i) => unordered[i] as Body).sort((a, b) => (rank.get(addressOf(a) ?? '') ?? 0) - (rank.get(addressOf(b) ?? '') ?? 0));
    const declarations = [...unordered];
    slots.forEach((slot, i) => (declarations[slot] = named[i] as Body));

    const registers = new Map(declarations.filter((b) => typeof b.register === 'string').map((b) => [String(b.register), b]));
    const examples: { register: string; fields: Body }[] = [];
    /* EACH PICKED ROW AS IT IS HELD, so a link between two picked rows goes out by their titles (a seed carries none). */
    const picked = new Map<string, { register: string; fields: Body }>();
    for (const [register, seqs] of Object.entries(args.examples ?? {})) {
      const decl = registers.get(register);
      if (!decl)
        return refuse('VALUE_MALFORMED', `${register} is not a list this use case carries, so its rows cannot be shared as examples. It carries ${[...registers.keys()].join(', ') || 'no lists'}.`, `examples.${register}`);
      if (!Array.isArray(seqs) || seqs.some((n) => !Number.isInteger(n)))
        return refuse('VALUE_MALFORMED', `examples.${register} is a list of row numbers.`, `examples.${register}`);
      if (seqs.length > SEEDS_PER_REGISTER)
        return refuse('OUT_OF_BOUNDS', `A use case shares at most ${SEEDS_PER_REGISTER} example rows a list.`, `examples.${register}`);
      /* NOR A ROW OF A PERSONAL LIST: it is the owner's alone, and a use case is for somebody else. */
      if (decl.personal === true)
        return refuse('FORBIDDEN', `${String(decl.name ?? register)} is personal, so none of its rows go out as examples. The list goes without them.`, `examples.${register}`);
      const read = rows(register);
      if (!read.ok) return read as Result<Body>;
      for (const seq of seqs) {
        const row = read.value.find((r) => r.seq === seq);
        if (!row) return refuse('OUT_OF_BOUNDS', `${register} has no row ${seq}.`, `examples.${register}`);
        examples.push({ register, fields: exampleFields(decl, row.fields) });
        const one = { register, fields: row.fields };
        picked.set(`${register}#${seq}`, one);
        /* A LINK IS HELD AS THE ROW'S ID, and said as `register#seq` when it was written that way. */
        const held = (row as { id?: unknown }).id;
        if (typeof held === 'string') picked.set(held, one);
      }
    }

    const links: ExampleLink[] = [];
    const titleOf = (register: string, fields: Body): string | null => {
      const field = registers.get(register)?.title;
      const value = typeof field === 'string' ? fields[field] : undefined;
      return typeof value === 'string' && value.trim() !== '' ? value : null;
    };
    for (const row of new Set(picked.values())) {
      const title = titleOf(row.register, row.fields);
      const fields = registers.get(row.register)?.fields;
      if (title === null || !Array.isArray(fields)) continue;
      for (const field of fields as Body[]) {
        if (field.type !== 'ref' || typeof field.id !== 'string') continue;
        const target = picked.get(String(row.fields[field.id] ?? ''));
        const named = target ? titleOf(target.register, target.fields) : null;
        if (target && named !== null) links.push({ register: row.register, title, field: field.id, to: target.register, target: named });
      }
    }

    /* A SKILL GOES OUT AS ITS NAME AND WHEN TO REACH FOR IT, never its text: the text is the owner's and may name
       anything. The file is read back through `readShared` below, so a trigger holding a credential is refused too. */
    const skills: { name: string; trigger: string }[] = [];
    if (args.skills !== undefined && args.skills.length > 0) {
      const read = rows('skills');
      if (!read.ok) return read as Result<Body>;
      for (const seq of args.skills) {
        const row = read.value.find((r) => r.seq === seq);
        if (!row) return refuse('OUT_OF_BOUNDS', `Skills has no row ${seq}.`, 'skills');
        const { name, trigger } = row.fields;
        if (typeof name !== 'string' || typeof trigger !== 'string')
          return refuse('VALUE_MALFORMED', `Skill ${seq} has no name or no line saying when to use it, so it cannot be shared.`, 'skills');
        skills.push({ name, trigger });
      }
    }

    /* A SHARED USE CASE MAY STAND ON ANY INSTALLED PACK, not only the six first-party modules: every other enabled pack
       goes out by id, and a use case never names its own family. */
    const modules = on.map((s) => s.id).filter((id) => !id.startsWith(USE_CASE));
    const title = args.title ?? id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');
    const built = exportUseCase({
      usecase: id,
      version,
      title,
      summary: args.summary ?? `${title}, as one BrainDog is arranged.`,
      author: args.author ?? 'a BrainDog owner',
      license: 'MIT',
      audience: (args.audience ?? 'other') as Audience,
      tone: 'as its owner arranged it',
      modules,
      voice: voiceOf(values),
      labels: labelsOf(values, config),
      declarations,
      examples,
      ...(args.signals === undefined ? {} : { signals: args.signals }),
      ...(skills.length === 0 ? {} : { skills }),
      ...(nav.length === 0 ? {} : { nav }),
      ...(links.length === 0 ? {} : { links }),
    });
    if (!built.ok) return built;
    /* THE FILE IS READ BACK THROUGH THE DOOR IT WILL COME IN BY, so a picked row holding a credential is refused here,
       before it is downloaded, rather than on somebody else's record. */
    const text = JSON.stringify(built.value, null, 2);
    const back = await readShared(text);
    if (!back.ok) return back as Result<Body>;
    return ok({ file: sharedFileName(id, version), doc: built.value, bytes: back.value.bytes });
  }

  /* ── coming in ────────────────────────────────────────────────────────── */

  /**
   * What installing a shared use case would do here: the modules it needs first, then its own pack, each planned
   * against the record as the ones before it would leave it. Nothing is written.
   *
   * `modules` MAY CARRY THE DOCUMENTS for first-party modules this host has no catalogue for, as the app builds them for
   * this record; a module neither offers is refused by name.
   */
  async function planFile(args: { doc?: unknown; text?: string; source?: PackSource; modules?: Record<string, unknown> }): Promise<Result<Body>> {
    const given = args.text ?? args.doc;
    if (given === undefined) return refuse('REQUIRED_MISSING', 'Send the use-case file as text, or its document as doc.', 'text');
    const shared = await readShared(given, args.source ?? { kind: 'paste' });
    if (!shared.ok) return shared as Result<Body>;
    /* THE FILE'S OWN PACK WAS NORMALISED INSIDE `readShared`, where no theme is checked, so it is checked here: a
       palette the install will refuse is refused at the plan a person reads before pressing it. */
    const painted = shared.value.pack === null ? null : await themeFault(shared.value.pack);
    if (painted) return { ok: false, refusal: painted };
    const u = shared.value.usecase;

    const states = kernel.packStates();
    const base = d.installed();
    let state: Installed = { ...base, packs: [...base.packs], declarations: [...base.declarations] };
    /* WHAT THE COMING USE CASE HANDS ON IS HANDED BEFORE ITS MODULES ARE PLANNED, so a module that takes a list over from
       the use case's older version plans it as taken over rather than as a conflict. Without it the order cycled on a
       Founder 1.x record: People first was PROVIDES_CONFLICT at register.organisations, Founder first PAGE_UNKNOWN. */
    const hands = shared.value.pack?.manifest.hands;
    if (hands !== undefined) state = { ...state, handed: { ...(state.handed ?? {}), ...hands } };
    const enable: string[] = [];
    const packs: PlannedPack[] = [];
    const holds = (s: Installed) => s.declarations.filter((x) => x.kind === 'register').map((x) => x.id.slice('register.'.length));

    const step = async (id: string, role: PlannedPack['role'], pack: Pack, doc: Body) => {
      const diff = await plan(pack, state);
      packs.push({
        id,
        role,
        version: pack.manifest.version,
        installed_version: diff.installed_version,
        direction: diff.direction,
        adds: diff.adds.map((a) => a.id),
        changes: diff.changes.map((c) => c.id),
        retires: diff.retires.filter((r) => r.to === undefined).map((r) => r.id),
        ...(diff.retires.some((r) => r.to !== undefined) ? { hands: diff.retires.flatMap((r) => (r.to === undefined ? [] : [{ id: r.id, to: r.to }])) } : {}),
        conflicts: diff.conflicts,
        unresolved: diff.unresolved.map((x) => x.register),
        examples: diff.seeds.count,
        calls_out: diff.calls_out,
        approve: diff.approve,
        doc,
      });
      const kept = state.declarations.filter((x) => x.pack_id !== id);
      state = {
        ...state,
        packs: [...state.packs.filter((p) => p.id !== id), { id, version: pack.manifest.version }],
        declarations: [...kept, ...pack.declarations.map((decl) => ({ id: decl.id, version: 1, kind: decl.kind, pack_id: id, body: decl.canonical, checksum: '' }))],
      };
    };

    /* WHAT IT STANDS ON, AND NOT ALL IT NAMES: a file that says `needs` goes in with those and grows into the
       rest of `modules` when its moment comes. A file that says none stands on every module it names, as it always did. */
    for (const m of u.needs ?? u.modules) {
      const s = states.find((p) => p.id === m);
      if (s) {
        if (s.disabled_at !== null) enable.push(m);
        /* A MODULE ALREADY HERE MAY BE OFFERED IN THIS USE CASE'S WORDS AND TARGETS, when a document for it is sent: it is
           planned as an update, and left out of the plan when it would change nothing. The person chooses whether it goes. */
        const relabelled = s.disabled_at === null ? args.modules?.[m] : undefined;
        if (!isMap(relabelled)) continue;
        const pack = await normaliseChecked(relabelled, { kind: 'local' });
        if (!pack.ok) return pack as Result<Body>;
        if (pack.value.manifest.pack !== m) return refuse('VALUE_MALFORMED', `The document sent for ${m} is the pack ${pack.value.manifest.pack}.`, `modules.${m}`);
        const diff = await plan(pack.value, state);
        if (diff.adds.length + diff.changes.length + diff.retires.length > 0) await step(m, 'module', pack.value, relabelled);
        continue;
      }
      const offered = args.modules?.[m] ?? d.catalogue.find((e) => e.id === m)?.doc({ holds: holds(state), usecase: null }) ?? null;
      if (!isMap(offered))
        return refuse('DECLARATION_UNKNOWN', `${u.title} builds on ${m}, which this host cannot offer by name. Install ${m} from Plugins first, then plan this again.`, `modules`);
      const pack = await normaliseChecked(offered, { kind: 'local' });
      if (!pack.ok) return pack as Result<Body>;
      if (pack.value.manifest.pack !== m) return refuse('VALUE_MALFORMED', `The document sent for ${m} is the pack ${pack.value.manifest.pack}.`, `modules.${m}`);
      await step(m, 'module', pack.value, offered);
    }
    /* THE FILE'S OWN PACK IS CUT TO WHAT THE RECORD WILL HOLD ONCE THE MODULES ABOVE ARE IN (`fitted`), so a page over a
       list of a module it does not stand on goes in without that list rather than refusing the file REGISTER_UNRESOLVED.
       A pack that reads only what will be held is the file's own document, planned as it always was. */
    if (shared.value.pack && shared.value.doc) {
      const { fitted } = await import('@braindog/seed/usecases/install');
      const doc = fitted(shared.value.doc, new Set(holds(state)));
      const pack = doc === shared.value.doc ? ok(shared.value.pack) : await normaliseChecked(doc, args.source ?? { kind: 'paste' });
      if (!pack.ok) return pack as Result<Body>;
      await step(pack.value.manifest.pack, 'usecase', pack.value, doc);
    }

    return ok({
      usecase: {
        usecase: u.usecase,
        version: u.version,
        title: u.title,
        summary: u.summary,
        author: u.author,
        license: u.license,
        audience: u.audience,
        modules: u.modules,
        voice: u.voice,
        labels: u.labels,
        skills: u.skills,
      },
      bytes: shared.value.bytes,
      ...(enable.length === 0 ? {} : { enable }),
      packs,
      approve: [...new Set(packs.flatMap((p) => p.approve))],
    });
  }

  return { exportFile, planFile };
}
