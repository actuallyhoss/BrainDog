/**
 * A page shared as a template: a pack of that page alone, for somebody else to install.
 *
 * WHAT GOES OUT IS THE PAGE AS THE RECORD STORES IT, read as the source view reads it (`sourceOf` in `lib/dog/read.ts`),
 * never the live answer with its rows spread over it. So no row of this record goes in: a page holds filters and
 * headings, and the rows are read wherever it is installed.
 *
 * EVERY LITERAL IN A FILTER THAT NAMES SOMETHING OF THIS RECORD BECOMES A SETTING: a row (`tasks#12`), a person, or a
 * project named on its scope field. Each is read back as `{{config:<key>}}` (`docs/04-PACKS.md`, settings), a text
 * setting whose default is the literal, so the pack installs and draws as it does here and whoever installs it picks
 * their own on `/packs/<id>`. One literal used in three filters is one setting. Past `SETTINGS_MOST` (the kernel's own
 * ceiling on a manifest) a literal stays as written, because a pack over the ceiling is refused whole.
 *
 * `requires` NAMES THE LISTS IT READS, twice, as a pack says it: the page's own list of `register.<id>`, and on the
 * manifest each installed pack that holds one of those lists, at the version held here or later.
 *
 * IT GOES OUT SIGNED, ON THE SAME PATH AS A USE CASE: the menu sends `text` through `submitToKennel` in `publish.ts`,
 * which signs it with the publisher's key in this browser (`author-key.ts`) over kind `pack`, `id`, `version` and the
 * text's checksum, so nothing here holds a key. `signedAs` names what that signature covers, as the Kennel reads it.
 *
 * PURE, AND LOADED BY PLAIN NODE: its one import is the file reader the Kennel checks it with, which imports nothing, and the
 * page's menu reaches this only when it is pressed.
 */

import { usesOf } from '@braindog/declare/uses';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Body = Record<string, unknown>;

/** A pack as `packs()` answers it: which lists it holds, and the version held. */
export type TemplateState = { id: string; version: string | null; registers: readonly string[] };

/** One literal turned into a setting: its key, the field it filtered on, the literal, and what kind of thing it names. */
export type TemplateSetting = { key: string; label: string; field: string; value: string; names: 'row' | 'person' | 'project' };

export type Template = {
  /** The pack's id: the page's, with `-page` after it. */
  id: string;
  version: string;
  title: string;
  /** The manifest, and the file it is saved and sent as. */
  doc: Body;
  text: string;
  file: string;
  /** The ids of the lists the page reads. */
  reads: string[];
  settings: TemplateSetting[];
  /** Every host an address in the page names. A page reads only its record, so this is nearly always empty. */
  hosts: string[];
  /** The page's block headings in the order they are drawn: the page as drawn now, in words. */
  headings: string[];
};

export const templateWords = {
  open: 'Share as a template',
  title: 'Share as a template',
  lead: 'A plugin of this page alone, for somebody else to install. None of what it shows goes in: each project, person or item it filters on becomes a setting they pick.',
  reading: 'Reading the page',
  unread: 'BrainDog answered in a way this version of the app does not read.',
  addsPage: (title: string): string => `The page ${title}`,
  setting: (label: string): string => `A setting for ${label}, which whoever installs it picks`,
  settingNow: (label: string, now: string): string => `A setting for ${label}, now ${now}, which whoever installs it picks`,
  reads: 'What it reads',
  readsNothing: 'None of your lists',
  drawn: 'The page as it is drawn now',
  drawnNone: 'Its blocks have no headings.',
  download: 'Download the file',
  downloaded: (file: string): string => `${file} is downloaded.`,
  back: 'Share a link instead',
  summary: (title: string): string => `The page ${title}, shared as a template.`,
  settingNote: 'Filled in from the page it was made from. Change it to one of yours.',
} as const;

/** Who a template says made it when nobody is named: the words the record writes on a pack it exports. */
export const TEMPLATE_AUTHOR = 'a BrainDog owner';

/** The most settings a manifest may declare (`CONFIG_CEILING` in `@braindog/kernel`). */
export const SETTINGS_MOST = 64;

/** A qualified row id, as `docs/02-DATA-MODEL.md` §3 writes one. A bare `#7` never resolves, so it is not one. */
const ROW = /^[a-z][a-z0-9_]*#[1-9][0-9]*$/u;
/** A person's id: `p_` and a ULID, minted by the Directory. */
const PERSON = /^p_[0-9A-HJKMNP-TV-Z]{26}$/u;
/** The scope field a project is named on (`docs/06-PAGES.md`: `project is {{name}}`). */
const PROJECT = 'project';
/** The words a filter uses that name no value. */
const NO_VALUE = new Set(['set', 'empty', 'unset', 'true', 'false']);
/** A clause of a filter written as a sentence: `field is value`, `field is not value`, `field not value`, comma between. */
const CLAUSE = /(^|,)(\s*)([a-z][a-z0-9_]*)(\s+(?:is not|is|not)\s+)([^,]+)/gu;
/** The operators whose value a leaf of a filter tree compares against. */
const LEAF_OPS = ['is', 'not', 'in', 'not_in'] as const;
const HOST = /https:\/\/([a-z0-9.-]+)/giu;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

/** An id in words, for a list or a field this build has no name for: `due_date` reads "Due date". */
export const wordsOf = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replaceAll(/[_-]+/gu, ' ');

/** What a literal names, or `null` when it is a value anybody's record could hold (a state, a word, a date). */
function namesOf(field: string, value: string): TemplateSetting['names'] | null {
  const v = value.trim();
  if (v === '' || v.includes('{{') || NO_VALUE.has(v)) return null;
  const parts = v.split(/\s+or\s+/u);
  if (parts.every((p) => PERSON.test(p))) return 'person';
  if (parts.every((p) => ROW.test(p))) return 'row';
  return field === PROJECT ? 'project' : null;
}

/**
 * Make the template. `version` is the one it goes out as; `format` and `primitives` are the record's own (`version()`),
 * so the pack asks for no newer renderer than the one that drew it here.
 */
export function templateOf(input: { body: Body; states: readonly TemplateState[]; format: number; primitives: number; version?: string; author?: string }): Template {
  const settings: TemplateSetting[] = [];
  const reads = new Set<string>();
  const hosts = new Set<string>();

  const keyFor = (field: string, value: string, names: TemplateSetting['names']): string | null => {
    const had = settings.find((s) => s.field === field && s.value === value);
    if (had) return had.key;
    if (settings.length >= SETTINGS_MOST) return null;
    const base = field.toLowerCase().replaceAll(/[^a-z0-9_]/gu, '_').replace(/^[^a-z]+/u, '').slice(0, 28) || 'value';
    let key = base;
    for (let n = 2; settings.some((s) => s.key === key); n++) key = `${base}_${n}`;
    settings.push({ key, label: wordsOf(field).toLowerCase(), field, value, names });
    return key;
  };
  const placed = (field: string, value: string): string => {
    const names = namesOf(field, value);
    const key = names === null ? null : keyFor(field, value.trim(), names);
    return key === null ? value : `{{config:${key}}}`;
  };

  const sentence = (text: string): string =>
    text.replace(CLAUSE, (all: string, lead: string, gap: string, field: string, verb: string, value: string) => {
      const out = placed(field, value.trim());
      return out === value.trim() ? all : `${lead}${gap}${field}${verb}${out}${value.slice(value.trimEnd().length)}`;
    });

  const tree = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(tree);
    if (!isMap(node)) return node;
    const out: Body = { ...node };
    for (const group of ['all', 'any', 'none']) if (Array.isArray(out[group])) out[group] = (out[group] as unknown[]).map(tree);
    const field = typeof out.field === 'string' ? out.field : null;
    if (field !== null)
      for (const op of LEAF_OPS) {
        const v = out[op];
        if (typeof v === 'string') out[op] = placed(field, v);
        else if (Array.isArray(v)) out[op] = v.map((x) => (typeof x === 'string' ? placed(field, x) : x));
      }
    return out;
  };

  /* ONE WALK: every filter is scrubbed, every list read is noted, and every address is heard. */
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(HOST)) if (m[1]) hosts.add(m[1].toLowerCase());
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (!isMap(node)) return node;
    const out: Body = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'where') out[key] = typeof value === 'string' ? sentence(value) : tree(value);
      else if (key === 'row' && typeof value === 'string') out[key] = placed('row', value);
      else out[key] = walk(value);
      if ((key === 'source' || key === 'register') && typeof value === 'string') {
        const list = value.startsWith('register.') ? value.slice('register.'.length) : key === 'register' ? value : null;
        if (list) reads.add(list);
      }
    }
    return out;
  };

  const body = input.body;
  if (Array.isArray(body.requires)) for (const r of body.requires) if (typeof r === 'string' && r.startsWith('register.')) reads.add(r.slice('register.'.length));
  const page = walk(body) as Body;
  const list = [...reads].sort();
  if (list.length > 0) page.requires = list.map((r) => `register.${r}`);
  else delete page.requires;

  const pageId = typeof body.page === 'string' ? body.page : 'page';
  const title = typeof body.title === 'string' && body.title.trim() !== '' ? body.title : wordsOf(pageId);
  const id = `${pageId.toLowerCase().replaceAll(/[^a-z0-9-]+/gu, '-').replace(/^[^a-z]+/u, '').replace(/-+$/u, '').slice(0, 56) || 'shared'}-page`;
  const version = input.version ?? '1.0.0';

  /* THE PACKS THAT HOLD WHAT IT READS, each at the version held here or a later one of the same major. */
  const packs: Record<string, string> = {};
  for (const r of list) {
    const holder = input.states.find((s) => s.registers.includes(r) && s.version !== null);
    if (holder?.version) packs[holder.id] = `^${holder.version}`;
  }
  const config: Record<string, Json> = {};
  for (const s of settings) config[s.key] = { type: 'text', default: s.value, label: wordsOf(s.field), note: templateWords.settingNote };

  const doc: Body = {
    pack: id,
    version,
    title,
    summary: templateWords.summary(title),
    /* EVERY PACK SAYS ITS AUTHOR AND LICENSE, or every door refuses it (`readPackFile`): the Kennel and an install from
       the file alike. The words are the record's own for a pack it exports (`export-pack.ts`). */
    author: input.author?.trim() || TEMPLATE_AUTHOR,
    license: 'MIT',
    requires: { format: input.format, primitives: input.primitives, packs },
    ...(settings.length > 0 ? { config } : {}),
    declarations: [page],
  };
  /* WHAT IT USES OF YOURS IS SAID ON THE FILE (`uses.ts`): the Kennel refuses a pack that names a list and leaves it unsaid. */
  const used = usesOf(doc).map((u) => u.id);
  if (used.length > 0) doc.uses = used;

  const headings: string[] = [];
  const heard = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      if (!isMap(b)) continue;
      if (typeof b.heading === 'string' && b.heading.trim() !== '') headings.push(b.heading.replaceAll(/\{\{[^{}]*\}\}/gu, '…'));
      heard(b.blocks);
    }
  };
  heard(body.blocks);

  return {
    id,
    version,
    title,
    doc,
    text: `${JSON.stringify(doc, null, 2)}\n`,
    file: `${id}.pack.json`,
    reads: list,
    settings,
    hosts: [...hosts].sort(),
    headings,
  };
}

/** What a template's signature covers: the kind, id and version the Kennel reads from its file, beside its checksum. */
export const signedAs = (t: Pick<Template, 'id' | 'version'>): { kind: 'pack'; id: string; version: string } => ({ kind: 'pack', id: t.id, version: t.version });
