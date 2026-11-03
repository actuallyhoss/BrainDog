/**
 * An add-on made from what a person made: `exportPack` (READ+), the pack builder's one read.
 *
 * BEFORE THIS ONLY THE WHOLE SETUP COULD LEAVE. `exportUseCase` shares every module and every page as one use case, and
 * a page shares as a template alone. Nothing made an add-on from a chosen set, so the list, the page and the automation
 * somebody built for themselves could not go to a second record as one file installed from Browse.
 *
 * ASKED WITH NOTHING, IT OFFERS. `{ offered }` is the record's own declarations: those written here and not brought by
 * any installed add-on (`pack_id` null), less one a person edited from an add-on's (`kernel.detached`, still that
 * add-on's to update), a page the seed owns by its body, and the arrangement kinds that are one person's (a look, a job
 * the owner's machine runs). Each is said by its own name, with its id as the handle a tick sends back.
 *
 * ASKED WITH TICKS, IT ANSWERS THE FILE AND SAYS WHAT IT WOULD ADD. The ticked declarations, and every one of the
 * record's own that a ticked one reads (a list a page shows, a figure a stat cell names, a script a figure runs, an
 * automation or a door a block presses), each said in `brings` with why. A list an installed add-on holds is not
 * carried: the add-on is named in `requires.packs`, at the version held here or a later one of its major, as the page
 * template names it (`apps/web/src/lib/market/template.ts`).
 *
 * NOTHING OF THE AUTHOR'S GOES OUT, the owner's line: declarations only, through `declare`'s `scrubPack`, which turns
 * each literal naming something of this record into a setting and drops a key, a token and a door's address, saying
 * each. The setting goes out holding a stand-in of its kind (`standIn`), never the author's literal, and whoever installs
 * it picks their own. A row goes out only when `rows` names it by list and number, as an example, and only its shareable fields
 * (`exampleFields`: never a link, a file or a secret).
 *
 * THE FILE IS READ BACK THROUGH THE DOOR IT COMES IN BY (`normalise`), so a file this answers is one a record reads. It
 * writes nothing, asks nothing, publishes nothing and uploads nothing: Download and Publish are the person's presses.
 */

import type { Result } from '@braindog/ports';
import { FORMAT_VERSION } from '@braindog/kernel';
import { exampleFields, normalise } from '@braindog/declare';
import { MANIFEST_KEYS } from '@braindog/declare/catalogue';
import { scrubPack } from '@braindog/declare/scrub';
import { PRIMITIVES_VERSION } from 'braindog-render';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

type Body = Record<string, unknown>;

/** One declaration of the record's own, by its handle, its kind and its own name. */
export type Offered = { id: string; kind: string; title: string };

/** What `exportPack` answers when nothing is ticked. */
export type ExportOffer = {
  offered: Offered[];
  /** The skills the record keeps, each by its row number, name and the moment to reach for it. Absent when it keeps none. */
  skills?: { seq: number; name: string; trigger: string }[];
};

/** What `exportPack` answers for ticks: the file's name and text, every declaration it adds, and what came along and why. */
export type ExportedPack = {
  file: string;
  text: string;
  adds: string[];
  brings: { id: string; why: string }[];
  /** The skills it gives the agents of a record that installs it, by name. Absent when it gives none. */
  skills?: string[];
  /** Each literal made a setting, by its key and what it was about, never the literal itself. */
  settings: { key: string; label: string }[];
  /** What the scrub left out, and why, in its own words. */
  dropped: { at: string; why: string }[];
};

/** What the call takes, and nothing else. */
const TAKES = ['declarations', 'rows', 'title', 'id', 'version', 'summary', 'changes', 'skills'] as const;

/** The most characters of the note on what a version changed, as the pack file holds it (`CHANGES_MOST` in `declare`). */
const CHANGES_NOTE_MOST = 500;
/** The most skills one add-on carries (`readPackSkills` in `declare`). */
const SKILLS_MOST = 8;

/** The one line a store card says, at most this many characters. */
export const SUMMARY_MOST = 140;

/** The kinds an add-on carries. A look is how one person arranges a page, and a job is approved for one machine. */
const CARRIED = new Set(['register', 'page', 'block', 'ingest', 'rule', 'metric', 'theme', 'digest', 'script']);

/** What each kind is called to a person, for `brings`. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  register: 'the list',
  page: 'the page',
  block: 'the block',
  ingest: 'the door',
  rule: 'the automation',
  metric: 'the figure',
  theme: 'the theme',
  digest: 'the digest',
  script: 'the script',
};

/** A key inside a declaration that names another declaration by its id alone, and the kind it names. */
const NAMES_BY_KEY: Readonly<Record<string, string>> = {
  register: 'register',
  metric: 'metric',
  script: 'script',
  rule: 'rule',
  ingest: 'ingest',
  digest: 'digest',
  block: 'block',
  page: 'page',
};

/** A declaration said by its address, `register.jobs`, wherever a value names one. */
const ADDRESS = /^(register|metric|script|rule|ingest|digest|block|page)\.([a-z][a-z0-9_-]*)$/u;
const PACK_ID = /^[a-z][a-z0-9-]{1,63}$/u;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
/** The most declarations one file is asked for, and the most example rows of one list, as a pack takes them. */
const TICKS_MOST = 200;
const EXAMPLES_MOST = 5;

const isMap = (x: unknown): x is Body => x !== null && typeof x === 'object' && !Array.isArray(x);

/** `jobs-count` as "Jobs count", for a declaration that gives itself no name. */
const wordsOf = (id: string): string => {
  const words = id.replaceAll(/[-_]+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * A stored body in a pack document's own shape: its kind as the first key, naming it. The record stores a body with its
 * keys sorted and may hold a list's name as `id`, and `normalise` reads only the kind first (as `usecase.ts` writes it).
 */
export function asWritten(kind: string, body: Body): Body {
  const { [kind]: named, ...rest } = body;
  if (typeof named === 'string') return { [kind]: named, ...rest };
  const { id, ...others } = rest;
  return { [kind]: id, ...others };
}

/** What a declaration calls itself: its name, its title or its heading, and its id in words when it says none. */
export function titleOf(id: string, body: Body): string {
  for (const key of ['name', 'title', 'heading'])
    if (typeof body[key] === 'string' && (body[key] as string).trim() !== '') return (body[key] as string).trim();
  return wordsOf(id.slice(id.indexOf('.') + 1));
}

/**
 * Every other declaration one body reads, by address: a value that is an address (`register.jobs`, a block's source, a
 * page's `requires`), a key that names one by id (a stat cell's `metric`, a rule's `register`, a step's `script`), a
 * link field's `to`, and a door named by its `door`. Its own kind key is not a reading of itself. What names nothing
 * here is answered too and simply matches nothing.
 */
export function readsOf(kind: string, body: Body): { ids: Set<string>; doors: Set<string> } {
  const ids = new Set<string>();
  const doors = new Set<string>();
  const walk = (node: unknown, top: boolean): void => {
    if (typeof node === 'string') {
      if (ADDRESS.test(node)) ids.add(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const n of node) walk(n, false);
      return;
    }
    if (!isMap(node)) return;
    for (const [key, value] of Object.entries(node)) {
      if (top && key === kind) continue;
      if (typeof value === 'string') {
        const named = NAMES_BY_KEY[key];
        if (named !== undefined && !value.includes('.')) ids.add(`${named}.${value}`);
        else if (key === 'to' && (node.type === 'ref' || node.of === 'ref')) ids.add(`register.${value}`);
        else if (key === 'door') doors.add(value);
      }
      walk(value, false);
    }
  };
  walk(body, true);
  return { ids, doors };
}

export function methods(deps: RecordDeps) {
  const { kernel, guard, readable, no } = deps;

  /** The record's own declarations, by id, with their bodies as a pack writes them. */
  const ownOf = (): Map<string, { kind: string; body: Body }> => {
    const detached = new Set(kernel.detached().map((d) => d.id));
    const out = new Map<string, { kind: string; body: Body }>();
    for (const r of kernel.declarations()) {
      if (r.pack_id !== null || detached.has(r.id) || !CARRIED.has(r.kind)) continue;
      const stored = JSON.parse(r.body) as Body;
      /* A PAGE THE SEED OWNS BY ITS BODY names its add-on in it, and is that add-on's however it is stored. */
      if (r.kind === 'page' && 'pack' in stored) continue;
      out.set(r.id, { kind: r.kind, body: asWritten(r.kind, stored) });
    }
    return out;
  };

  /** Which installed add-on brings each declaration it holds, and the version it is held at. */
  const holders = (): Map<string, { pack: string; version: string | null }> => {
    const versions = new Map(kernel.packStates().map((s) => [s.id, s.version]));
    const out = new Map<string, { pack: string; version: string | null }>();
    for (const r of kernel.declarations()) if (r.pack_id !== null) out.set(r.id, { pack: r.pack_id, version: versions.get(r.pack_id) ?? null });
    /* ONE A PERSON EDITED FROM AN ADD-ON'S is still that add-on's, so a file reading it requires the add-on. */
    for (const d of kernel.detached()) if (!out.has(d.id)) out.set(d.id, { pack: d.was, version: versions.get(d.was) ?? null });
    return out;
  };

  return {
    /**
     * With nothing ticked, `{ offered }`: the record's own declarations, each by id, kind and name. With `declarations`
     * (ids from `offered`), and `rows`, `title`, `id` and `version` when said, `{ file, text, adds, brings, settings,
     * dropped }`: the add-on file, every declaration it adds, and each one it brought along with why. READ+, for
     * somebody who reads the whole record, and it writes nothing.
     */
    async exportPack(
      args: { declarations?: unknown; rows?: unknown; title?: unknown; id?: unknown; version?: unknown; summary?: unknown; changes?: unknown; skills?: unknown } | undefined,
      ctx: CallContext,
    ): Promise<Result<ExportOffer | ExportedPack>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      /* EVERY LIST'S FIELDS AND EVERY PAGE OF THE RECORD'S OWN, so somebody who reads all of it, as a use case is shared. */
      if (deps.readsEveryList?.(ctx) !== true) return no('FORBIDDEN', 'A plugin is made by somebody who can read the whole BrainDog.', { at: 'principal' });
      const said = (args ?? {}) as Record<string, unknown>;
      const extra = Object.keys(said).find((k) => !(TAKES as readonly string[]).includes(k));
      if (extra !== undefined)
        return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${TAKES.join(', ')}.`, { at: extra, allowed: [...TAKES] });

      const own = ownOf();
      const ticks = said.declarations;
      /* THE SKILLS THE RECORD KEEPS, by row number, offered beside the rest and sent back by number. A skill's text is
         the author's own and is carried only when ticked; the store's reviewer reads it with everything else. */
      const skillRows = (): { seq: number; name: string; trigger: string; what: string | null; body: string }[] => {
        if (!kernel.register('skills') || readable(ctx, 'skills')) return [];
        const read = kernel.list({ register: 'skills', limit: 200 } as never, kernel.scope(ctx, 'skills'));
        if (!read.ok) return [];
        const listed = (read.value as { rows: { seq: number | null; fields: Body }[] }).rows;
        return listed.flatMap((r) => {
          const { name, trigger, body, what } = r.fields;
          return r.seq !== null && typeof name === 'string' && name.trim() !== '' && typeof trigger === 'string' && trigger.trim() !== ''
            ? [{ seq: r.seq, name: name.trim(), trigger: trigger.trim(), what: typeof what === 'string' && what.trim() !== '' ? what.trim() : null, body: typeof body === 'string' ? body : '' }]
            : [];
        });
      };
      if (ticks === undefined) {
        const kept = skillRows();
        return {
          ok: true,
          value: {
            offered: [...own].map(([id, d]) => ({ id, kind: d.kind, title: titleOf(id, d.body) })).sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title)),
            ...(kept.length === 0 ? {} : { skills: kept.map(({ seq, name, trigger }) => ({ seq, name, trigger })) }),
          },
        };
      }

      if (!Array.isArray(ticks) || ticks.length === 0 || ticks.length > TICKS_MOST || !ticks.every((t) => typeof t === 'string' && t !== ''))
        return no('VALUE_MALFORMED', `declarations is a list of one to ${TICKS_MOST} of the ids this answers as offered.`, { at: 'declarations' });
      const unknown = (ticks as string[]).find((t) => !own.has(t));
      if (unknown !== undefined)
        return no('DECLARATION_UNKNOWN', `${unknown} is not one of your own to share. Ask with nothing ticked to see what is.`, { at: 'declarations' });
      for (const key of ['title', 'id', 'version'] as const)
        if (said[key] !== undefined && (typeof said[key] !== 'string' || (said[key] as string).trim() === ''))
          return no('VALUE_MALFORMED', `${key} is a line of text.`, { at: key });
      /* THE LINE A STORE CARD SAYS, in the author's words; left out, the file keeps the plain line it always had. */
      const line = typeof said.summary === 'string' ? said.summary.trim().replace(/\s+/gu, ' ') : undefined;
      if (said.summary !== undefined && (line === undefined || line === '' || [...line].length > SUMMARY_MOST))
        return no('VALUE_MALFORMED', `summary is one line of at most ${SUMMARY_MOST} characters.`, { at: 'summary' });
      /* WHAT THIS VERSION CHANGED, in the author's words: shown to whoever installed an earlier one when they are offered this. */
      const note = typeof said.changes === 'string' ? said.changes.trim().replace(/\s+/gu, ' ') : undefined;
      if (said.changes !== undefined && (note === undefined || note === '' || [...note].length > CHANGES_NOTE_MOST))
        return no('VALUE_MALFORMED', `changes is a line or two on what this version changes, of at most ${CHANGES_NOTE_MOST} characters.`, { at: 'changes' });
      const skillTicks = said.skills;
      if (skillTicks !== undefined && (!Array.isArray(skillTicks) || skillTicks.length === 0 || skillTicks.length > SKILLS_MOST || !skillTicks.every((n) => Number.isInteger(n) && (n as number) > 0)))
        return no('VALUE_MALFORMED', `skills is a list of one to ${SKILLS_MOST} skill row numbers, as the offer names them.`, { at: 'skills' });
      const rows = said.rows;
      if (rows !== undefined && (!isMap(rows) || !Object.values(rows).every((v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && (n as number) > 0))))
        return no('VALUE_MALFORMED', 'rows names example rows by list and number, such as {"jobs":[1,2]}.', { at: 'rows' });

      const first = own.get(ticks[0] as string)!;
      const title = typeof said.title === 'string' ? said.title.trim().replace(/\s+/gu, ' ') : titleOf(ticks[0] as string, first.body);
      const id = typeof said.id === 'string' ? said.id : packIdFrom(title);
      if (!PACK_ID.test(id)) return no('VALUE_MALFORMED', `${id} is not a plugin id: lower-case letters, digits and hyphens.`, { at: 'id' });
      if (kernel.packStates().some((s) => s.id === id))
        return no('VALUE_MALFORMED', `A plugin called ${id} is already installed here. Give this one another id.`, { at: 'id' });
      const version = typeof said.version === 'string' ? said.version : '1.0.0';
      if (!SEMVER.test(version)) return no('VALUE_MALFORMED', `${version} is not a version. Write 1.0.0.`, { at: 'version' });

      /* WHAT THE TICKED ONES READ, followed until nothing new is read: the record's own come along and are said, an
         installed add-on's are required by that add-on, and anything else (a built-in figure) is the kernel's own. */
      const held = holders();
      const carried = new Map<string, { kind: string; body: Body }>();
      const brings: { id: string; why: string }[] = [];
      const packs: Record<string, string> = {};
      const doorsOf = (door: string): string[] => [...own].filter(([, d]) => d.kind === 'ingest' && d.body.door === door).map(([at]) => at);
      const queue = [...new Set(ticks as string[])];
      for (const t of queue) carried.set(t, own.get(t)!);
      for (let i = 0; i < queue.length; i++) {
        const at = queue[i]!;
        const decl = carried.get(at)!;
        const reads = readsOf(decl.kind, decl.body);
        for (const door of reads.doors) for (const d of doorsOf(door)) reads.ids.add(d);
        for (const other of reads.ids) {
          if (other === at || carried.has(other)) continue;
          const mine = own.get(other);
          if (mine !== undefined) {
            carried.set(other, mine);
            queue.push(other);
            brings.push({ id: other, why: `${cap(KIND_WORDS[decl.kind] ?? 'it')} ${titleOf(at, decl.body)} reads ${KIND_WORDS[mine.kind] ?? 'it'} ${titleOf(other, mine.body)}.` });
            continue;
          }
          const holder = held.get(other);
          if (holder !== undefined && holder.version !== null) packs[holder.pack] = `^${holder.version}`;
        }
      }

      /* AN EXAMPLE ROW ONLY WHEN `rows` NAMES IT, of a list this file carries, read as reading that list is, and only
         its shareable fields: never a link to another row, a file or a secret. */
      const examples: Body[] = [];
      for (const [list, seqs] of Object.entries((rows ?? {}) as Record<string, number[]>)) {
        const decl = carried.get(`register.${list}`);
        if (decl === undefined)
          return no('VALUE_MALFORMED', `${list} is not a list this plugin carries, so none of its rows can go as an example.`, { at: `rows.${list}` });
        if (seqs.length > EXAMPLES_MOST) return no('OUT_OF_BOUNDS', `A plugin carries at most ${EXAMPLES_MOST} example rows a list.`, { at: `rows.${list}` });
        const denied = readable(ctx, list);
        if (denied) return { ok: false, refusal: denied };
        /* NOR A ROW OF A PERSONAL LIST: it is the owner's alone, and this file is for somebody else. */
        if (kernel.personalLists().includes(list))
          return no('FORBIDDEN', `${titleOf(`register.${list}`, decl.body)} is personal, so none of its rows go out as examples. The list goes without them.`, { at: `rows.${list}` });
        for (const seq of new Set(seqs)) {
          /* BY ITS OWN NUMBER, as other reads find one row, so a list of thousands finds its first and its last. */
          /* UNDER HER GRANT, so a row kept private from her or outside her rule is a row this list does not have. */
          const read = kernel.list({ register: list, where: { field: 'seq', is: seq }, limit: 1 } as never, kernel.scope(ctx, list));
          if (!read.ok) return read as Result<never>;
          const row = (read.value as { rows: { seq: number | null; fields: Body }[] }).rows[0];
          if (row === undefined) return no('ROW_UNKNOWN', `${titleOf(`register.${list}`, decl.body)} has no row ${seq}.`, { at: `rows.${list}` });
          /* AS THE SCRUB READS A TICKED ROW: its list, its number and its values, so a key in it is taken out too. */
          examples.push({ register: list, row: `${list}#${seq}`, values: exampleFields(decl.body, row.fields) });
        }
      }

      /* THROUGH THE SCRUB, every literal that names something of this record made a setting and every key dropped. */
      const scrubbed = scrubPack([...[...carried.values()].map((d) => d.body), ...examples], rows === undefined ? {} : { rows: rows as Record<string, number[]> });
      if (!scrubbed.ok) return scrubbed as Result<never>;
      const clean = scrubbed.value;
      const seeds = clean.rows.map((r) => ({ register: String(r.register), fields: (isMap(r.values) ? r.values : {}) as Body }));
      /* A SETTING GOES OUT HOLDING A STAND-IN OF ITS KIND, never the author's literal, which is what the scrub took out:
         a pack that reads a setting must give it a default for the first install, and an empty one is not read. */
      const standIns = new Map(clean.settings.map((st) => [st.key, standIn(st.names, st.value)]));
      const config: Record<string, Body> = {};
      /* AND ITS NOTE SAYS SO: the scrub's own note says a kept default came from the record it was made from, which a
         stand-in did not. */
      for (const [key, setting] of Object.entries(clean.config))
        config[key] = { ...((isMap(setting) ? setting : {}) as Body), default: standIns.get(key) ?? 'example', note: STAND_IN_NOTE };

      /* A TICKED SKILL GOES OUT WITH ITS STEPS, named the way a pack names one. A skill with no steps, or with an address or a
         link in them, is refused here by name rather than sent: the store would read the same and say the same. */
      const skills: Body[] = [];
      if (Array.isArray(skillTicks)) {
        const kept = skillRows();
        for (const seq of new Set(skillTicks as number[])) {
          const row = kept.find((k) => k.seq === seq);
          if (row === undefined) return no('ROW_UNKNOWN', `Skills has no row ${seq}. Ask with nothing ticked to see what is offered.`, { at: 'skills' });
          if (row.body.trim() === '') return no('VALUE_MALFORMED', `The skill ${row.name} has no steps written, so there is nothing to share. Write them in Skills first.`, { at: 'skills' });
          const text = `${row.trigger}\n${row.body}`;
          if (/[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/iu.test(text) || /https?:\/\/\S+/iu.test(text))
            return no('VALUE_MALFORMED', `The skill ${row.name} holds an email address or a link, and those stay in your BrainDog. Take it out of the skill, or leave this skill out.`, { at: 'skills' });
          skills.push({ name: skillNameOf(row.name), trigger: row.trigger, ...(row.what === null ? {} : { what: [...row.what].slice(0, 200).join('') }), body: row.body });
        }
      }

      const doc: Body = {
        pack: id,
        version,
        title,
        summary: line ?? `${title}, made on one BrainDog and shared as a plugin.`,
        changes: note ?? (version === '1.0.0' ? 'The first version.' : 'A new version.'),
        author: 'a BrainDog owner',
        license: 'MIT',
        requires: { format: FORMAT_VERSION, primitives: PRIMITIVES_VERSION, packs },
        ...(Object.keys(config).length > 0 ? { config } : {}),
        declarations: clean.declarations,
        ...(skills.length > 0 ? { skills } : {}),
        ...(seeds.length > 0 ? { seeds } : {}),
      };
      const stray = Object.keys(doc).find((k) => !(MANIFEST_KEYS as readonly string[]).includes(k));
      if (stray !== undefined) return no('PACK_MALFORMED', `A plugin file has no ${stray}.`, { at: stray });
      /* READ BACK THROUGH THE DOOR IT COMES IN BY, so a file that would be refused on the second record is refused here. */
      const back = await normalise(doc, { kind: 'local' });
      if (!back.ok) return back as Result<never>;

      return {
        ok: true,
        value: {
          file: `${id}.pack.json`,
          text: `${JSON.stringify(doc, null, 2)}\n`,
          adds: back.value.declarations.map((d) => d.id),
          brings,
          ...(skills.length > 0 ? { skills: skills.map((s) => String(s.name)) } : {}),
          settings: clean.settings.map((s) => ({ key: s.key, label: s.label })),
          dropped: clean.dropped,
        },
      };
    },
  };
}

/**
 * What a setting holds when the file is made, by what it names, and nothing of the author's: the first of the same list
 * (`clients#1` for a filter on `clients#7`), a person nobody is, a project called "example", and an address and a link
 * of the reserved example domain. Whoever installs it picks their own on the add-on's page.
 */
export function standIn(names: string, literal: string): string {
  if (names === 'row') {
    const list = /^([a-z][a-z0-9_]*)#/u.exec(literal.trim())?.[1];
    return list === undefined ? 'example' : `${list}#1`;
  }
  if (names === 'person') return NOBODY;
  if (names === 'address') return 'someone@example.com';
  if (names === 'link') return 'https://example.com';
  return 'example';
}

/** What a setting's note says to whoever installs the add-on. */
const STAND_IN_NOTE = 'An example to start from. Change it to one of yours.';

/** A person's handle in the shape the record writes one, naming nobody. */
const NOBODY = `p_${'0'.repeat(26)}`;

/** A sentence's first word with its capital. */
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A skill's name as a pack file writes one: "Weekly tidy" is `weekly-tidy`. */
export const skillNameOf = (name: string): string => packIdFrom(name);

/** An add-on's id from its title: "Jobs board" is `jobs-board`. */
export function packIdFrom(title: string): string {
  const id = title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replace(/^[^a-z]+/u, '').replace(/-+$/u, '').slice(0, 56);
  return id.length >= 2 ? id : 'my-add-on';
}
