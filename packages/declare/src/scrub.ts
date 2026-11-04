/**
 * A person's own declarations, scrubbed so they can leave the record as an add-on with nothing of theirs in it.
 *
 * THE TEMPLATE'S PASS, MOVED AND WIDENED. `apps/web/src/lib/market/template.ts` turns every literal in a page's filters
 * that names something of this record into a `{{config:<key>}}` setting whose default is the literal. This does the same
 * over every kind an add-on carries: a list's field defaults, a page's filters and each block's `where`, a figure's
 * `where`, a rule's or a job's `where` and arguments. One literal used three times is one setting.
 *
 * WHAT NAMES SOMETHING OF THIS RECORD: a row (`tasks#12`), a person (`p_` and a ULID), a project named on the `project`
 * field, or any literal on a field that points at a person or at another list (a `person` or `ref` field of a list in
 * the same set, or a field named for a person such as `owner`). An email address or a link becomes a setting too, but
 * with no default and no value kept: whoever installs it fills it in.
 *
 * WHAT NEVER LEAVES, dropped and said in `dropped`: a secret field's default; any string `looksLikeCredential` calls a
 * key, an object's key included; a `token`, `secret` or `password` under any name and any case; a door's address; a
 * skill's text; text holding an email address or a link where no setting can stand for it; and a row, unless
 * `options.rows` names it by list and number. A ticked row still leaves out an address, a link and a person's id.
 * A script's `source` is code: it is kept, and only checked for a key. So is the text of a door's `connect.files`, the
 * script a person pastes into their own account, and `connect.names` are the hosts that recipe opens, as `address.ts` reads them.
 *
 * PAST `SETTINGS_MOST` THE WHOLE PACK IS REFUSED, because the kernel refuses a manifest over its own ceiling
 * (`CONFIG_CEILING` in `packages/kernel/src/declare.ts`) and a literal left as written would be one of the author's.
 *
 * PURE: no I/O, no clock. The answer is the same for the same input.
 */

import { KINDS, looksLikeCredential } from '@braindog/kernel';
import { no, ok } from '@braindog/ports';
import type { Result } from '@braindog/ports';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type Body = Record<string, unknown>;

/** What a setting stands for. `address` and `link` keep no default: the literal never leaves. */
export type ScrubNames = 'row' | 'person' | 'project' | 'address' | 'link';

/** One literal turned into a setting: its key, words for it, where it was first found, the literal, and what it names. */
export type ScrubSetting = { key: string; label: string; at: string; value: string; names: ScrubNames };

/** One thing left out, where it was and the sentence that says why. */
export type ScrubDropped = { at: string; why: string };

export type ScrubOptions = {
  /** The rows the person ticked to go with the add-on, by list and number: `{ tasks: [12] }`. Every other row stays. */
  rows?: Readonly<Record<string, readonly number[]>>;
};

export type Scrubbed = {
  /** Each declaration in the form it came in (a manifest body, or `{ id, kind, body }`), scrubbed. */
  declarations: Body[];
  /** The manifest's `config:` map, one text setting for each entry of `settings`. */
  config: Record<string, Json>;
  settings: ScrubSetting[];
  dropped: ScrubDropped[];
  /** The ticked rows, with any key, address, link or person's id in them taken out. */
  rows: Body[];
};

export const scrubWords = {
  secret: "A secret field's value never leaves the record.",
  key: 'This looks like a key, and a key never leaves the record.',
  token: 'A token or a password never leaves the record. Whoever installs it adds their own.',
  door: "A door's address belongs to the BrainDog it is in, so whoever installs it gets their own.",
  skill: "A skill's text is the author's own, so it stays in the record.",
  address: 'This text holds an email address, and an address names a person, so it stays in the record.',
  link: "This text holds a link, and the author's links stay in the record.",
  person: 'This names a person of the record, so it stays in the record.',
  row: 'Something kept in a list goes only when it is ticked.',
  unknown: 'This is not something a plugin carries, so it stays in the record.',
  settingNote: 'Filled in from the record it was made from. Change it to one of yours.',
  fillNote: 'Whoever installs it fills this in.',
  tooMany: (n: number): string =>
    `This plugin would need ${n} settings, and a plugin holds at most ${SETTINGS_MOST}, so share fewer things at once.`,
} as const;

/** The most settings a manifest may declare (`CONFIG_CEILING` in `@braindog/kernel`). */
export const SETTINGS_MOST = 64;

/** A qualified row id, as `docs/02-DATA-MODEL.md` §3 writes one. */
const ROW = /^([a-z][a-z0-9_]*)#([1-9][0-9]*)$/u;
/** A person's id: `p_` and a ULID, minted by the Directory. */
const PERSON = /^p_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ADDRESS_IN = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/iu;
const LINK = /^https?:\/\/\S+$/iu;
const LINK_IN = /https?:\/\/\S+/iu;
/** The words a filter uses that name no value. */
const NO_VALUE = new Set(['set', 'empty', 'unset', 'true', 'false', 'me', 'today', 'yesterday', 'tomorrow']);
/** A clause of a filter written as a sentence: `field is value`, `field is not value`, `field not value`, comma between. */
const CLAUSE = /(^|,)(\s*)([a-z][a-z0-9_]*)(\s+(?:is not|is|not)\s+)([^,]+)/gu;
/** The operators whose value a leaf of a filter tree compares against. */
const LEAF_OPS = new Set(['is', 'not', 'in', 'not_in']);
/** Fields named for a person, whatever list they sit on. */
const PERSON_FIELDS = new Set(['owner', 'assignee', 'assigned_to', 'author', 'who', 'contact']);
/**
 * Keys whose value is a token or a password, under whatever name the author gave it, read with case and separators
 * taken out (`secretKey` below), so `apiKey`, `Access-Token` and `Authorization` are caught as `api_key` is.
 */
const SECRET_KEYS = /^(?:[a-z0-9]*(?:token|secret|password|passphrase|apikey|credentials?)|bearer|authorization)$/u;
const secretKey = (k: string): boolean => SECRET_KEYS.test(k.toLowerCase().replaceAll(/[^a-z0-9]/gu, ''));
/** Keys a door's own address sits under. */
const DOOR_KEYS = new Set(['address', 'url', 'inbox', 'webhook', 'endpoint']);
/** Keys whose links are hosts the code calls out to, which a reviewer reads and a person approves, not anybody's link. */
const HOST_KEYS = new Set(['egress', 'host', 'hosts', 'origin']);
/** The key a door's `connect.files` is walked under, so a file's `text` is told from any other `text`. */
const CONNECT_FILES = 'connect.files';
/** A skill's own words. */
const SKILL_TEXT = new Set(['text', 'body', 'instructions', 'prompt', 'content']);

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const wordsOf = (id: string): string => (id.charAt(0).toUpperCase() + id.slice(1)).replaceAll(/[_-]+/gu, ' ');
/** A declaration begins with its kind, as `normalise` in `index.ts` reads one. */
const kindOf = (body: Body): string | null => {
  const first = Object.keys(body)[0] ?? '';
  return (KINDS as readonly string[]).includes(first) && typeof body[first] === 'string' ? first : null;
};

/**
 * Scrub a set of declarations for an add-on. Each comes as a manifest body (`{ register: 'tasks', ... }`) or as the
 * record holds one (`{ id, kind, body }`, the body an object or its JSON). Refused, whole, when it would need more
 * settings than a manifest may declare.
 */
export function scrubPack(declarations: readonly unknown[], options: ScrubOptions = {}): Result<Scrubbed> {
  const settings: ScrubSetting[] = [];
  const byLiteral = new Map<string, string>();
  const dropped: ScrubDropped[] = [];
  const rows: Body[] = [];
  const drop = (at: string, why: string): undefined => {
    dropped.push({ at, why });
    return undefined;
  };

  /* THE FIELDS THAT POINT AT A PERSON OR ANOTHER LIST, read off the lists in the same set. */
  const pointing = new Set(PERSON_FIELDS);
  const parts = declarations.map((d) => partOf(d));
  for (const p of parts)
    if (p?.kind === 'register' && Array.isArray(p.body.fields))
      for (const f of p.body.fields)
        if (isMap(f) && typeof f.id === 'string' && (f.type === 'person' || f.type === 'ref' || f.type === 'refs')) pointing.add(f.id);

  /**
   * What a literal on `field` names, or `null` when anybody's record could hold it (a state, a word, a date). `filters`
   * is a filter's value or a field's default, where the field is known; anywhere else a key is only a key (`by: kind`,
   * `person: owner`), so only a literal's own shape names something.
   */
  const namesOf = (field: string, value: string, filters: boolean): ScrubNames | null => {
    const v = value.trim();
    if (v === '' || v.includes('{{') || NO_VALUE.has(v)) return null;
    if (ADDRESS.test(v)) return 'address';
    if (LINK.test(v)) return HOST_KEYS.has(field) ? null : 'link';
    const each = v.split(/\s+or\s+|\s*,\s*/u);
    if (each.every((p) => PERSON.test(p))) return 'person';
    if (each.every((p) => ROW.test(p))) return 'row';
    if (!filters) return null;
    if (field === 'project') return 'project';
    return pointing.has(field) ? (PERSON_FIELDS.has(field) ? 'person' : 'row') : null;
  };

  /** The setting a literal is read back as, made the first time it is seen. */
  const placed = (field: string, value: string, at: string, filters: boolean): string => {
    const v = value.trim();
    const names = namesOf(field, v, filters);
    if (names === null) return value;
    let key = byLiteral.get(v);
    if (key === undefined) {
      const base = field.toLowerCase().replaceAll(/[^a-z0-9_]/gu, '_').replace(/^[^a-z]+/u, '').slice(0, 28) || 'value';
      key = base;
      for (let n = 2; settings.some((s) => s.key === key); n++) key = `${base}_${n}`;
      const kept = names !== 'address' && names !== 'link';
      settings.push({ key, label: wordsOf(field).toLowerCase(), at, value: kept ? v : '', names });
      byLiteral.set(v, key);
    }
    return `{{config:${key}}}`;
  };

  const sentence = (text: string, at: string): string =>
    text.replace(CLAUSE, (all: string, lead: string, gap: string, field: string, verb: string, value: string) => {
      const out = placed(field, value.trim(), at, true);
      return out === value.trim() ? all : `${lead}${gap}${field}${verb}${out}${value.slice(value.trimEnd().length)}`;
    });

  /** A string where it stands: kept, read back as a setting, or dropped with the reason (`undefined`). */
  const text = (s: string, key: string, at: string, kind: string, filters: boolean): string | undefined => {
    if (looksLikeCredential(s)) return drop(at, scrubWords.key);
    /* A TICKED ROW GOES AS THE PERSON TICKED IT, but for a key, an address, a link or a person of this record in it. */
    if (kind === 'row') {
      if (ADDRESS_IN.test(s)) return drop(at, scrubWords.address);
      if (LINK_IN.test(s)) return drop(at, scrubWords.link);
      if (s.split(/\s+or\s+|\s*,\s*/u).some((p) => PERSON.test(p.trim()))) return drop(at, scrubWords.person);
      return s;
    }
    if (s.includes('{{config:')) return s;
    if (kind === 'ingest' && DOOR_KEYS.has(key)) return drop(at, scrubWords.door);
    if (key === 'where' || key === 'filter') return sentence(s, at);
    const out = placed(key, s, at, filters);
    if (out !== s || key === 'source' || HOST_KEYS.has(key)) return out;
    if (ADDRESS_IN.test(s)) return drop(at, scrubWords.address);
    if (LINK_IN.test(s)) return drop(at, scrubWords.link);
    return s;
  };

  /* ONE WALK A DECLARATION. `key` is the name the value sits under, and the field a literal is read against. */
  const walk = (node: unknown, key: string, at: string, kind: string, filters = false): unknown => {
    if (typeof node === 'string') return text(node, key, at, kind, filters);
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      node.forEach((v, i) => {
        const one = walk(v, key, `${at}.${i}`, kind, filters);
        if (one !== undefined) out.push(one);
      });
      return out;
    }
    if (!isMap(node)) return node;
    const out: Body = {};
    const leaf = typeof node.field === 'string' ? node.field : null;
    const own = typeof node.id === 'string' ? node.id : null;
    const skill = typeof node.skill === 'string';
    for (const [k, v] of Object.entries(node)) {
      const here = `${at}.${k}`;
      if (secretKey(k) && v !== null && v !== '') {
        drop(here, scrubWords.token);
        continue;
      }
      if (looksLikeCredential(k)) {
        drop(at, scrubWords.key);
        continue;
      }
      if (skill && SKILL_TEXT.has(k)) {
        drop(here, scrubWords.skill);
        continue;
      }
      if (k === 'default' && [node.type, node.of].some((t) => t === 'secret' || t === 'file')) {
        drop(here, scrubWords.secret);
        continue;
      }
      /* A leaf of a filter tree reads its value against its field; a list's field reads its default against its own id. */
      const filter = leaf !== null && LEAF_OPS.has(k);
      const fieldDefault = !filter && own !== null && k === 'default';
      /* A DOOR'S CONNECT RECIPE WAS READ AS PROSE, so Gmail's script was taken out of the panel it is pasted from and its
         hosts became blank settings. `names` read as hosts, a file's `text` as a script's `source`. */
      const recipe = kind === 'ingest' && key === 'connect' ? (k === 'names' ? 'hosts' : k === 'files' ? CONNECT_FILES : null) : null;
      const code = kind === 'ingest' && key === CONNECT_FILES && k === 'text' ? 'source' : null;
      const one = walk(v, filter ? leaf : fieldDefault ? own : (recipe ?? code ?? k), here, kind, filter || fieldDefault);
      if (one !== undefined) out[k] = one;
    }
    return out;
  };

  const ticked = options.rows ?? {};
  const out: Body[] = [];
  parts.forEach((p, i) => {
    const at = `declarations.${i}`;
    if (p === null) return void drop(at, scrubWords.unknown);
    if (p.row !== null) {
      const [, list, n] = ROW.exec(p.row) ?? [];
      if (list === undefined || !(ticked[list] ?? []).includes(Number(n))) return void drop(at, scrubWords.row);
      rows.push(walk(p.body, 'row', at, 'row') as Body);
      return;
    }
    if (p.kind === 'skill') return void drop(at, scrubWords.skill);
    if (p.kind === null) return void drop(at, scrubWords.unknown);
    const name = typeof p.body[p.kind] === 'string' ? `${p.kind}.${String(p.body[p.kind])}` : at;
    const body = walk(p.body, '', name, p.kind) as Body;
    out.push(p.wrapped ? { id: p.wrapped.id, kind: p.kind, body } : body);
  });

  if (settings.length > SETTINGS_MOST) return no('OUT_OF_BOUNDS', scrubWords.tooMany(settings.length), { at: 'config' });

  const config: Record<string, Json> = {};
  for (const s of settings)
    config[s.key] =
      s.value === ''
        ? { type: 'text', label: wordsOf(s.label), note: scrubWords.fillNote }
        : { type: 'text', default: s.value, label: wordsOf(s.label), note: scrubWords.settingNote };
  return ok({ declarations: out, config, settings, dropped, rows });
}

/** One entry of the set, read: its kind, its body, the row it is (when it is one), and the record's own wrapper. */
type Part = { kind: string | null; body: Body; row: string | null; wrapped: { id: string } | null };

function partOf(entry: unknown): Part | null {
  if (!isMap(entry)) return null;
  /* AS THE RECORD HOLDS ONE: `{ id, kind, body }`, the body an object or its canonical JSON. */
  if (typeof entry.kind === 'string' && typeof entry.id === 'string' && entry.body !== undefined) {
    let body: unknown = entry.body;
    if (typeof body === 'string')
      try {
        body = JSON.parse(body);
      } catch {
        return null;
      }
    if (!isMap(body)) return null;
    const known = (KINDS as readonly string[]).includes(entry.kind);
    return { kind: known || entry.kind === 'skill' ? entry.kind : null, body, row: null, wrapped: { id: entry.id } };
  }
  /* A ROW: its qualified id, or an example row written as a seed (`register` and `values`, and no fields). */
  if (typeof entry.id === 'string' && ROW.test(entry.id) && kindOf(entry) === null) return { kind: null, body: entry, row: entry.id, wrapped: null };
  if (isMap(entry.values) && entry.fields === undefined && typeof entry.register === 'string')
    return { kind: null, body: entry, row: typeof entry.row === 'string' ? entry.row : '', wrapped: null };
  if (typeof entry.skill === 'string') return { kind: 'skill', body: entry, row: null, wrapped: null };
  return { kind: kindOf(entry), body: entry, row: null, wrapped: null };
}
