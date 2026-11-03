/**
 * The add-on marketplace as an agent reads it, and the start of an add-on of its own: `addons`, `addon` and `addonNew`
 * (READ+, all three reads). `addonCheck`, which plans a file against this record, is in `index.ts` beside `planPack`,
 * because the plan is that file's.
 *
 * WHY AN AGENT NEEDS THEM. The store is a page of the app, and an agent saw the catalogue only as `arrangement`'s offer:
 * an id, a line and the modules under it. Asked for something BrainDog does not do, it could not tell whether an add-on
 * already did it, who made that add-on, what it would reach of the person's, or what an add-on it wrote itself would ask
 * for, so it either gave up or wrote rows that pretended to be a feature. These answer what the store's pages answer, in
 * lines, read off the same catalogue index the store reads and off what this record holds.
 *
 * WHAT IT REACHES IS READ, NEVER TAKEN FROM THE AUTHOR. A listing's asks are the catalogue's `reach`, which the
 * catalogue tool worked out from the file itself, and an installed add-on's grants are read off the declarations it put
 * in this record, so a file cannot describe itself as friendlier than it is.
 *
 * NOTHING HERE INSTALLS. Installing stays `installPack`, which an agent reaches only as a question the person answers
 * on Decide (`act` turns the refusal into a `pack` proposal carrying the file), or while the person lets agents act
 * without asking.
 */

import { listedEntries, offeredVersion, type CatalogueEntry as IndexEntry, type CatalogueIndex, type CatalogueVersion, type Reach } from '@braindog/declare/catalogue';
import { FIELD_TYPES } from '@braindog/kernel';
import type { Result } from '@braindog/ports';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';
import { GIT_UNREVIEWED, parseGit, repoSaid, shortSha } from '../git-channel.ts';

type Body = Record<string, unknown>;

/** How far a listing is trusted, from the catalogue and never from the file: BrainDog's own, reviewed, signed, or neither. */
export type AddonTrust = 'braindog' | 'reviewed' | 'signed' | 'unreviewed' | 'made-here' | 'from-a-link';

/** One line of `addons`. */
export type AddonLine = {
  id: string;
  title: string;
  summary: string;
  by: string;
  trust: AddonTrust;
  latest: string | null;
  shelf?: string;
  /** What it would reach, one short line, read from the catalogue's reach. */
  reaches?: string;
  /** Present when this BrainDog holds it. */
  here?: { version: string | null; on: boolean; update?: string };
};

/** Words a search reads past, since every add-on's line holds them. */
const STOP: ReadonlySet<string> = new Set(['the', 'and', 'for', 'with', 'what', 'that', 'this', 'from', 'your', 'you', 'into', 'about', 'want', 'need', 'track', 'list', 'keep', 'add-on', 'addon']);

/** The most lines one `addons` answer holds, and its default. */
const MOST = 30;
const FIRST = 12;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** `a` is later than `b`, as three numbers. */
const later = (a: string, b: string): boolean => {
  const pa = a.split(/[.-]/u).slice(0, 3).map(Number);
  const pb = b.split(/[.-]/u).slice(0, 3).map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

/** A list, a page or a figure id said as the person reads it: `register.money_goals` is "money goals". */
const placeWords = (id: string): string => {
  const [kind, rest] = id.includes('.') ? [id.slice(0, id.indexOf('.')), id.slice(id.indexOf('.') + 1)] : ['', id];
  const words = rest.replace(/[_-]+/gu, ' ');
  return kind === 'register' ? `the ${words} list` : kind === 'page' ? `the ${words} page` : kind === 'metric' ? `the ${words} figure` : words;
};

/** What a version reaches, in the lines a person reads before installing it. Empty when it reaches nothing of note. */
export function reachLines(reach: Reach | undefined): string[] {
  if (reach === undefined) return [];
  const out: string[] = [];
  if (reach.modules.length > 0) out.push(`Needs ${reach.modules.join(', ')} installed first.`);
  if (reach.lists.length > 0) out.push(`Adds ${reach.lists.length === 1 ? 'a list' : `${reach.lists.length} lists`}: ${reach.lists.join(', ')}.`);
  if (reach.pages.length > 0) out.push(`Adds ${reach.pages.length === 1 ? 'a page' : `${reach.pages.length} pages`}: ${reach.pages.join(', ')}.`);
  const reads = (reach.uses ?? []).filter((u) => !u.writes).map((u) => placeWords(u.id));
  const writes = (reach.uses ?? []).filter((u) => u.writes).map((u) => placeWords(u.id));
  if (writes.length > 0) out.push(`Changes yours: ${writes.join(', ')}.`);
  if (reads.length > 0) out.push(`Reads yours: ${reads.join(', ')}.`);
  if (reach.rules.length > 0) out.push(`Runs ${reach.rules.length === 1 ? 'an automation' : `${reach.rules.length} automations`} while nobody is looking.`);
  for (const c of reach.calls_out) out.push(c.line);
  if (reach.skills.length > 0) out.push(`Teaches your agents: ${reach.skills.join(', ')}.`);
  if ((reach.widgets ?? []).length > 0) out.push(`Today cards to add: ${(reach.widgets ?? []).join(', ')}.`);
  if ((reach.waits ?? []).length > 0) out.push(`Some parts wait until you hold: ${(reach.waits ?? []).join(', ')}.`);
  if (reach.examples > 0) out.push(`Starts with ${reach.examples} example ${reach.examples === 1 ? 'entry' : 'entries'}.`);
  return out;
}

/** The one-line form of `reachLines`, for a search answer: what it adds and what it reaches past itself. */
function reachShort(reach: Reach | undefined): string | undefined {
  if (reach === undefined) return undefined;
  const parts: string[] = [];
  if (reach.lists.length > 0) parts.push(`${reach.lists.length} ${reach.lists.length === 1 ? 'list' : 'lists'}`);
  if (reach.pages.length > 0) parts.push(`${reach.pages.length} ${reach.pages.length === 1 ? 'page' : 'pages'}`);
  const uses = reach.uses ?? [];
  if (uses.some((u) => u.writes)) parts.push(`changes ${uses.filter((u) => u.writes).length} of yours`);
  else if (uses.length > 0) parts.push(`reads ${uses.length} of yours`);
  const hosts = [...new Set(reach.calls_out.map((c) => c.host).filter((h): h is string => h !== null))];
  if (hosts.length > 0) parts.push(`calls ${hosts.join(', ')}`);
  if ((reach.widgets ?? []).length > 0) parts.push('Today cards');
  if (reach.skills.length > 0) parts.push('agent skills');
  return parts.length === 0 ? undefined : parts.join(', ');
}

/** How far an entry is trusted, from the catalogue: BrainDog's own, reviewed by the operator, signed by its author, or none. */
export function trustOfEntry(entry: IndexEntry, version: CatalogueVersion | null): AddonTrust {
  if (entry.publisher?.kind === 'braindog') return 'braindog';
  if (version?.reviewed !== undefined) return 'reviewed';
  if (version?.signature !== undefined) return 'signed';
  return 'unreviewed';
}

/** What each trust is called to the person. */
export const TRUST_SAID: Readonly<Record<AddonTrust, string>> = {
  braindog: 'Made by BrainDog',
  reviewed: 'Reviewed by BrainDog',
  signed: 'Signed by its author, not reviewed',
  unreviewed: 'Not reviewed',
  'made-here': 'Made in this BrainDog',
  'from-a-link': 'Installed from a link or a file, not reviewed',
};

/** The pack id a record holds an entry under: a use case's is `usecase-<id>`. */
const heldId = (e: IndexEntry): string => (e.kind === 'usecase' ? `usecase-${e.id}` : e.id);

/** A register id made from an add-on id: `watch-list` is `watch_list`, at most 32 characters. */
const registerOf = (id: string): string => id.replace(/-/gu, '_').slice(0, 32).replace(/_+$/u, '');

/* A field type a starter takes, the kernel's own, less the two a person cannot fill in a form. */
const STARTER_TYPES: readonly string[] = FIELD_TYPES.filter((t) => t !== 'secret' && t !== 'json');

/**
 * A starter add-on file: one list with a title field and whatever fields were asked, a page with what is open and
 * what is done, and a Today card. It is a file that installs as it is (`addonCheck` says so), to be changed.
 */
export function starterAddon(a: { id: string; title: string; summary?: string; fields?: readonly Body[]; author?: string }): Body {
  const register = registerOf(a.id);
  const asked = (a.fields ?? []).flatMap((f) => {
    const id = text(f.id);
    if (id === null || !/^[a-z][a-z0-9_]{0,31}$/u.test(id) || ['name', 'state', 'title', 'id'].includes(id)) return [];
    const type = text(f.type) ?? 'text';
    const field: Body = { id, label: text(f.label) ?? id.replace(/_/gu, ' ').replace(/^./u, (c) => c.toUpperCase()), type: STARTER_TYPES.includes(type) ? type : 'text' };
    if (field.type === 'enum') field.values = Array.isArray(f.values) && f.values.every((v) => typeof v === 'string') ? f.values : ['one', 'two'];
    return [field];
  });
  const title = a.title.trim();
  const lower = title.toLowerCase();
  return {
    pack: a.id,
    version: '0.1.0',
    title,
    summary: a.summary?.trim() || `${title}: what is open, what is done, and a card on Today.`,
    author: a.author?.trim() || 'Made in this BrainDog',
    license: 'MIT',
    requires: { format: 1, primitives: 1, packs: {} },
    uses: [],
    widgets: [
      {
        id: `${a.id}-open`,
        title,
        says: `What is still open on ${lower}.`,
        group: 'life',
        for: 'both',
        block: {
          kind: 'table',
          heading: title,
          source: `register.${register}`,
          where: 'state is open',
          columns: [{ field: 'name' }],
          limit: 5,
          empty: 'Nothing open.',
        },
        sizes: ['small', 'wide'],
        size: 'small',
        needs: { lists: [register] },
        example: { rows: [{ title: 'First one' }, { title: 'Second one' }] },
      },
    ],
    declarations: [
      {
        register,
        name: title,
        title: 'name',
        fields: [
          { id: 'name', label: 'Name', type: 'text', required: true },
          ...asked,
          { id: 'state', label: 'Status', type: 'enum', values: ['open', 'done'], default: 'open' },
        ],
      },
      {
        page: a.id,
        title,
        nav: { section: title, order: 50 },
        requires: [`register.${register}`],
        blocks: [
          { kind: 'capture', span: 12, register, heading: `Add to ${lower}` },
          { kind: 'table', span: 12, heading: 'Open', source: `register.${register}`, where: 'state is open', columns: [{ field: 'name' }, ...asked.slice(0, 3).map((f) => ({ field: f.id }))], limit: 50, empty: 'Nothing open.' },
          { kind: 'table', span: 12, heading: 'Done', source: `register.${register}`, where: 'state is done', columns: [{ field: 'name' }], limit: 50, empty: 'Nothing done yet.' },
        ],
      },
    ],
  };
}

export function methods(deps: RecordDeps) {
  const { kernel, sql, guard, no } = deps;

  const indexNow = async (): Promise<CatalogueIndex | null> => {
    const shelf = deps.catalogueShelf;
    if (shelf?.index === undefined) return null;
    try {
      return await shelf.index();
    } catch {
      return null;
    }
  };

  /** What this record holds, by pack id: version, on, and where it came from. */
  const heldNow = (): Map<string, { version: string | null; on: boolean; source: string | null; source_ref: string | null; title: string | null; summary: string | null; author: string | null }> => {
    const rows = sql.all<{ id: string; source: string; source_ref: string | null; manifest: string }>('SELECT id, source, source_ref, manifest FROM pack');
    const from = new Map(rows.map((r) => [r.id, r]));
    const said = (id: string): { title: string | null; summary: string | null; author: string | null } => {
      try {
        const m = JSON.parse(from.get(id)?.manifest ?? '{}') as Body;
        return { title: text(m.title), summary: text(m.summary), author: text(m.author) };
      } catch {
        return { title: null, summary: null, author: null };
      }
    };
    return new Map(
      kernel
        .packStates()
        .map((s) => [s.id, { version: s.version, on: s.disabled_at === null, source: from.get(s.id)?.source ?? null, source_ref: from.get(s.id)?.source_ref ?? null, ...said(s.id) }]),
    );
  };

  const entryNamed = (index: CatalogueIndex, id: string): IndexEntry | undefined =>
    index.entries.find((e) => heldId(e) === id) ?? index.entries.find((e) => e.kind === 'usecase' && e.id === id);

  /** A made-here or linked add-on's trust, from where it came: a pasted or local file was made here, a link was not. */
  const trustOfSource = (source: string | null): AddonTrust => (source === 'url' || source === 'git' || source === 'kennel' ? 'from-a-link' : 'made-here');

  /** The live declarations an installed add-on put in this record, each by id, kind and body. */
  const liveOf = (pack: string): { id: string; kind: string; body: Body }[] =>
    sql
      .all<{ id: string; kind: string; body: string }>(
        `SELECT id, kind, body FROM declaration WHERE pack_id = ? AND superseded_at IS NULL AND retired = 0 ORDER BY id`,
        pack,
      )
      .flatMap((r) => {
        try {
          const body = JSON.parse(r.body) as unknown;
          return isMap(body) ? [{ id: r.id, kind: r.kind, body }] : [];
        } catch {
          return [];
        }
      });

  /**
   * What an installed add-on can do here, read off what it put in: its lists and pages, what runs on its own, where it
   * calls out and with which key, its doors, and the skills it gave the agents. The record's word, never the file's.
   */
  const grantsOf = (pack: string): string[] => {
    const live = liveOf(pack);
    const of = (kind: string) => live.filter((d) => d.kind === kind);
    const out: string[] = [];
    const lists = of('register').map((d) => text(d.body.name) ?? d.id.slice(d.id.indexOf('.') + 1));
    if (lists.length > 0) out.push(`Lists: ${lists.join(', ')}.`);
    const pages = of('page').map((d) => text(d.body.title) ?? d.id.slice(d.id.indexOf('.') + 1));
    if (pages.length > 0) out.push(`Pages: ${pages.join(', ')}.`);
    for (const s of of('script')) {
      const egress = Array.isArray(s.body.egress) ? s.body.egress.filter((e): e is string => typeof e === 'string') : [];
      const keys = Array.isArray(s.body.keys) ? s.body.keys.filter((e): e is string => typeof e === 'string') : [];
      const runs = isMap(s.body.runs) ? s.body.runs : {};
      const when = typeof runs.every === 'string' ? `every ${runs.every}` : typeof runs.door === 'string' ? `when ${runs.door} is called` : runs.rule === true ? 'when an automation starts it' : 'when started';
      out.push(
        `Script ${text(s.body.title) ?? s.id}: runs ${when}${egress.length > 0 ? `, may call ${egress.join(', ')}` : ', calls nothing outside'}${keys.length > 0 ? ` with the key ${keys.join(', ')}` : ''}.`,
      );
    }
    for (const i of of('ingest')) {
      const channel = text(i.body.channel) ?? 'door';
      const url = text(i.body.url);
      const host = url === null ? null : (() => { try { return new URL(url).host; } catch { return null; } })();
      out.push(`${channel === 'webhook' ? 'A door others can post to' : `A ${channel}`}${host === null ? '' : ` to ${host}`}${text(i.body.grant) === null ? '' : ` with the key ${text(i.body.grant)!}`}: ${text(i.body.description) ?? i.id}.`);
    }
    const rules = of('rule').length;
    if (rules > 0) out.push(`${rules === 1 ? 'An automation' : `${rules} automations`} that run while nobody is looking.`);
    const digests = of('digest').length;
    if (digests > 0) out.push(`${digests === 1 ? 'A digest' : `${digests} digests`} it sends you.`);
    return out;
  };

  /** The add-on file this record holds for an add-on: its manifest and its live declarations, as an author writes them. */
  const fileOf = (pack: string): Body | null => {
    const row = sql.all<{ manifest: string }>('SELECT manifest FROM pack WHERE id = ?', pack)[0];
    if (row === undefined) return null;
    let manifest: Body = {};
    try {
      const m = JSON.parse(row.manifest) as unknown;
      if (isMap(m)) manifest = m;
    } catch {
      return null;
    }
    const declarations = liveOf(pack).map((d) => {
      const { [d.kind]: named, id: _id, pack: _pack, ...rest } = d.body;
      return { [d.kind]: typeof named === 'string' ? named : d.id.slice(d.id.indexOf('.') + 1), ...rest };
    });
    return { ...manifest, declarations };
  };

  /** Does this caller read the whole record, so an add-on's settings and grants may be said? */
  const whole = (ctx: CallContext): boolean => deps.readsEveryList?.(ctx) === true;

  return {
    /**
     * The marketplace: `{ q?, shelf?, installed?, limit? }`. Words find add-ons by name, line, shelf and what they add;
     * none lists the store's own order. `installed: true` is what this BrainDog holds instead, made-here ones too. Each
     * line says who made it, how far it is trusted, its newest version, what it reaches and whether it is here.
     */
    async addons(args: { q?: unknown; shelf?: unknown; installed?: unknown; limit?: unknown } | undefined, ctx: CallContext): Promise<Result<unknown>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const takes = ['q', 'shelf', 'installed', 'limit'];
      const extra = Object.keys(said).find((k) => !takes.includes(k));
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${takes.join(', ')}.`, { at: extra, allowed: takes });
      const limit = typeof said.limit === 'number' && Number.isInteger(said.limit) ? Math.min(Math.max(said.limit, 1), MOST) : FIRST;
      const q = (text(said.q) ?? '').toLowerCase();
      const shelf = text(said.shelf);
      const index = await indexOf();
      const held = heldNow();

      const lineOf = (e: IndexEntry): AddonLine => {
        const latest = offeredVersion(e);
        const id = heldId(e);
        const here = held.get(id);
        const reaches = reachShort(latest?.reach);
        return {
          id,
          title: e.title,
          summary: e.summary,
          by: e.publisher?.name ?? e.author,
          trust: trustOfEntry(e, latest),
          latest: latest?.version ?? null,
          ...(e.shelf === undefined ? {} : { shelf: e.shelf }),
          ...(reaches === undefined ? {} : { reaches }),
          ...(here === undefined
            ? {}
            : { here: { version: here.version, on: here.on, ...(latest !== null && here.version !== null && later(latest.version, here.version) ? { update: latest.version } : {}) } }),
        };
      };

      if (said.installed === true) {
        const lines: AddonLine[] = [];
        for (const [id, h] of held) {
          const e = index === null ? undefined : entryNamed(index, id);
          if (e !== undefined) lines.push(lineOf(e));
          else
            lines.push({
              id,
              title: h.title ?? id.replace(/-/gu, ' ').replace(/^./u, (c) => c.toUpperCase()),
              summary: h.summary ?? '',
              by: h.author ?? '',
              trust: trustOfSource(h.source),
              latest: null,
              here: { version: h.version, on: h.on },
            });
        }
        const found = q === '' ? lines : lines.filter((l) => `${l.id} ${l.title} ${l.summary}`.toLowerCase().includes(q));
        return {
          ok: true,
          value: {
            found: found.length,
            addons: found.slice(0, limit),
            how: 'act addon {"id":"<id>"} reads one whole, with what it may do here.',
          },
        };
      }

      if (index === null)
        return {
          ok: true,
          value: {
            found: 0,
            addons: [],
            how: 'This BrainDog reads no catalogue, so nothing is on offer. To make what you need, act addonNew {"id","title"}.',
          },
        };
      /* EVERY WORD THAT SAYS SOMETHING, AND ALL OF THEM: "films to watch" found Money watch by its last word, which is
         an answer to a question nobody asked. A search that holds every word and finds nothing says so, and names the
         nearest few that hold one, so the agent knows to build rather than to install the wrong thing. */
      const words = q.split(/[^a-z0-9-]+/u).filter((w) => w.length > 2 && !STOP.has(w));
      const scored = listedEntries(index)
        .filter((e) => offeredVersion(e) !== null && (shelf === null || e.shelf === shelf || (e.categories ?? []).includes(shelf as never)))
        .map((e) => {
          if (words.length === 0) return { e, score: 1 };
          const reach = offeredVersion(e)?.reach;
          const head = `${e.id} ${e.title}`.toLowerCase();
          const body = [e.summary, ...(e.categories ?? []), e.shelf ?? '', ...(reach?.lists ?? []), ...(reach?.pages ?? []), ...(reach?.widgets ?? []), ...(reach?.skills ?? [])].join(' ').toLowerCase();
          let score = 0;
          let held = 0;
          for (const w of words) {
            const stem = w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
            const hit = head.includes(stem) ? 3 : body.includes(stem) ? 1 : 0;
            score += hit;
            if (hit > 0) held++;
          }
          return { e, score, all: held === words.length };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      const whole = scored.filter((s) => s.all);
      const near = whole.length === 0 ? scored.slice(0, 5).map((s) => ({ id: heldId(s.e), title: s.e.title })) : [];
      const shown = whole.slice(0, limit).map((s) => lineOf(s.e));
      return {
        ok: true,
        value: {
          found: whole.length,
          addons: shown,
          ...(near.length === 0 ? {} : { near }),
          how:
            whole.length === 0
              ? `Nothing on offer says ${q}. To make it, act addonNew {"id","title"} and read act arrangement {"grammar":"pack"}.`
              : 'act addon {"id":"<id>"} reads one whole: what it asks of yours, who made it, its versions. Nothing fits: act addonNew.',
        },
      };
    },

    /**
     * One add-on whole: `{ id, file? }`. What it adds and asks for of yours in plain lines, who made it and how far it is
     * trusted, its versions with their notes, and, when this BrainDog holds it, its version, settings and what it may do
     * here. `file: true` hands back its add-on file, the catalogue's verified copy or the one this record holds, to change
     * or to start from.
     */
    async addon(args: { id?: unknown; file?: unknown } | undefined, ctx: CallContext): Promise<Result<unknown>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const takes = ['id', 'file'];
      const extra = Object.keys(said).find((k) => !takes.includes(k));
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${takes.join(', ')}.`, { at: extra, allowed: takes });
      const id = text(said.id);
      if (id === null) return no('REQUIRED_MISSING', 'Which add-on? Send its id, as act addons answers it.', { at: 'id' });
      const index = await indexOf();
      const entry = index === null ? undefined : entryNamed(index, id);
      const h = heldNow().get(entry === undefined ? id : heldId(entry));
      if (entry === undefined && h === undefined)
        return no('DECLARATION_UNKNOWN', `No add-on called ${id} is on offer or here. act addons {"q":"<a word>"} searches the store.`, { at: 'id' });

      const out: Body = { id: entry === undefined ? id : heldId(entry) };
      if (entry !== undefined) {
        const latest = offeredVersion(entry);
        const trust = trustOfEntry(entry, latest);
        Object.assign(out, {
          title: entry.title,
          summary: entry.summary,
          kind: entry.kind === 'usecase' ? 'starter' : 'add-on',
          by: entry.publisher?.name ?? entry.author,
          trust,
          trust_said: TRUST_SAID[trust],
          license: entry.license,
          latest: latest?.version ?? null,
          ...(entry.shelf === undefined ? {} : { shelf: entry.shelf }),
          ...(entry.categories === undefined ? {} : { categories: entry.categories }),
          asks: reachLines(latest?.reach),
          versions: [...entry.versions]
            .reverse()
            .slice(0, 8)
            .map((v) => ({
              version: v.version,
              published_at: v.published_at,
              ...(v.bump === null ? {} : { bump: v.bump }),
              ...(v.notes === undefined ? {} : { notes: v.notes }),
              ...(v.yanked === undefined ? {} : { yanked: v.yanked.reason }),
              ...(v.reviewed === undefined ? {} : { reviewed: v.reviewed }),
              signed: v.signature !== undefined,
            })),
        });
      } else {
        const trust = trustOfSource(h!.source);
        Object.assign(out, {
          ...(h!.title === null ? {} : { title: h!.title }),
          ...(h!.summary === null ? {} : { summary: h!.summary }),
          ...(h!.author === null ? {} : { by: h!.author }),
          trust,
          trust_said: TRUST_SAID[trust],
          ...(h!.source_ref === null ? {} : { from: h!.source_ref }),
        });
        /* FROM GITHUB: the repository, the commit it is pinned to, and that nobody reviewed it (`git-channel.ts`). */
        const git = h!.source === 'git' && h!.source_ref !== null ? parseGit(h!.source_ref) : null;
        if (git !== null)
          Object.assign(out, {
            ...(h!.author === null || h!.author === 'Made in this BrainDog' ? { by: `${repoSaid(git)} on GitHub` } : {}),
            trust_said: GIT_UNREVIEWED,
            github: { repo: repoSaid(git), commit: shortSha(git.ref), path: git.path },
          });
      }
      if (h !== undefined) {
        const here: Body = { version: h.version, on: h.on };
        if (whole(ctx)) {
          const config = kernel.packConfig(String(out.id));
          if (config.ok && Object.keys(config.value.values).length > 0) here.settings = config.value.values;
          here.may = grantsOf(String(out.id));
        }
        out.here = here;
      }
      if (said.file === true) {
        if (!whole(ctx)) return no('FORBIDDEN', 'An add-on file is read by somebody who can read the whole BrainDog.', { at: 'file' });
        const fetched = entry !== undefined && deps.catalogueShelf ? await deps.catalogueShelf.fetch(heldId(entry)) : null;
        const doc = fetched !== null && fetched.ok ? fetched.value.doc : h !== undefined ? fileOf(String(out.id)) : null;
        if (doc !== null) out.file = doc;
        else out.file_missing = fetched !== null && !fetched.ok && 'refusal' in fetched ? fetched.refusal.fix : 'This BrainDog cannot hand this file back.';
      }
      out.next =
        h === undefined
          ? `Install: act installPack {"id":"${String(out.id)}"} puts it to the person on Decide.`
          : entry === undefined && isMap(out.github)
            ? `A newer tag on ${String(out.github.repo)} is asked about on Decide by itself. To pick a version: act installPack {"source":{"kind":"git","ref":"${String(out.github.repo)}@<tag>:${String(out.github.path)}"}}.`
            : entry === undefined
            ? `Change it: edit file, raise its version, act addonCheck {"doc":<file>}, then act installPack {"doc":<file>}.`
            : `It is here.${isMap(out.here) && h.on === false ? ' It is off: act enablePack {"id"}.' : ''}`;
      return { ok: true, value: out };
    },

    /**
     * A starter add-on file, to change: `{ id, title, summary?, fields? }`. One list with a name, the fields asked
     * (`[{id, type, label?, values?}]`) and a status, a page with what is open and what is done, and a Today card. It
     * writes nothing; `addonCheck` plans it against this BrainDog and `installPack` with it as `doc` asks the person.
     */
    async addonNew(args: { id?: unknown; title?: unknown; summary?: unknown; fields?: unknown } | undefined, ctx: CallContext): Promise<Result<unknown>> {
      const stop = guard(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const said = (args ?? {}) as Record<string, unknown>;
      const takes = ['id', 'title', 'summary', 'fields'];
      const extra = Object.keys(said).find((k) => !takes.includes(k));
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes ${takes.join(', ')}.`, { at: extra, allowed: takes });
      const id = text(said.id);
      if (id === null || !/^[a-z][a-z0-9-]{1,63}$/u.test(id)) return no('VALUE_MALFORMED', 'id is lower-case letters, digits and dashes, such as watch-list.', { at: 'id' });
      const title = text(said.title);
      if (title === null) return no('REQUIRED_MISSING', 'title is what the person will call it, such as Watch list.', { at: 'title' });
      if (said.fields !== undefined && (!Array.isArray(said.fields) || !said.fields.every(isMap)))
        return no('VALUE_MALFORMED', 'fields is a list like [{"id":"year","type":"number"}].', { at: 'fields' });
      const index = await indexOf();
      const taken = index === null ? undefined : entryNamed(index, id);
      if (taken !== undefined)
        return no('PROVIDES_CONFLICT', `${taken.title} is already ${id} in the store. Read it with act addon {"id":"${id}"}, or name yours differently.`, { at: 'id' });
      if (heldNow().has(id)) return no('PROVIDES_CONFLICT', `This BrainDog already holds ${id}. act addon {"id":"${id}","file":true} hands its file back to change.`, { at: 'id' });
      const doc = starterAddon({ id, title, ...(text(said.summary) === null ? {} : { summary: text(said.summary)! }), ...(Array.isArray(said.fields) ? { fields: said.fields as Body[] } : {}) });
      return {
        ok: true,
        value: {
          doc,
          next: [
            'Change doc to do what the person asked: act arrangement {"grammar":"pack"} says every part an add-on may have.',
            'act addonCheck {"doc":<doc>} says what is wrong, or what installing it adds and asks for.',
            'act installPack {"doc":<doc>} puts it to the person on Decide; nothing is installed until they say yes.',
          ],
        },
      };
    },
  };

  /* The catalogue index this host reads, or `null` (named apart so the reads above say what they read). */
  async function indexOf(): Promise<CatalogueIndex | null> {
    return indexNow();
  }
}
