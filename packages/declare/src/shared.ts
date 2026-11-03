/**
 * A use case as a file somebody hands to somebody else.
 *
 * WHAT GOES OUT. `exportUseCase` builds the file from the parts of a record's arrangement a person chose to share: the
 * modules it builds on, its own lists and pages, its voice and labels, and the example rows they picked. It never
 * reads a record itself: the record hands it the parts, so what may be read stays the record's decision.
 *
 * WHAT COMES IN. `readShared` is the one door a file from anybody walks through before it is planned, on the record,
 * in the app and in the CLI alike: the size first, before anything is parsed; then JSON; then every key and every
 * value for a credential, anywhere in the file, not only inside declarations; then the use case's own shape; then the
 * pack it carries, through `normalise`, the check a stranger's pack gets; then each declaration through the kernel's
 * context-free check, so a block kind this build does not draw is refused before a plan is shown.
 *
 * Refusals are registered codes: `PACK_OVER_CAP` for the size, `PACK_MALFORMED` for a file that is not one,
 * `SECRET_IN_PACK` for a credential, `KIND_UNKNOWN` for a kind nothing draws, `VALUE_MALFORMED` for a `changes` that is
 * not a short line of text.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { validateDeclaration } from '@braindog/kernel';

import { credentialKey, credentialValue, NESTED_MOST, nestedPast } from './credentials.ts';
import { normalise, SEEDS_PER_REGISTER, type Pack, type PackSource } from './index.ts';
import { CHANGES_MOST, FIRST_PARTY_LISTS, MODULE_LISTS, normaliseUseCase, packIdOf, readChanges, useCasePack, type Audience, type ExampleLink, type UseCase, type VoiceKey } from './usecase.ts';

/** The most a shared use case may weigh, in bytes of its file. The built-in five are each under 40 KB. */
export const SHARED_MOST_BYTES = 256 * 1024;

/** What a shared use case's file is called after its id and version: `student-1.0.1.usecase.json`. */
export const SHARED_SUFFIX = '.usecase.json';
export const sharedFileName = (usecase: string, version: string): string => `${usecase}-${version}${SHARED_SUFFIX}`;

export type Shared = {
  usecase: UseCase;
  /** The pack it carries, normalised, or `null` for one that only names modules. */
  pack: Pack | null;
  /** The document to plan and install for that pack, with the voice and labels as its settings. */
  doc: Record<string, unknown> | null;
  bytes: number;
  /** What this version changed, in its author's words (the file's `changes`), when it says. A catalogue lists it as the version's `notes`. */
  changes?: string;
};

/* `CHANGES_MOST` AND `readChanges` LIVE IN `usecase.ts`, which reads a use case's `changes` itself now and imports nothing
   from here; they are exported from this file as they always were. */
export { CHANGES_MOST, readChanges };

const isMap = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A shared use case, checked all the way through, from its text or from an already-parsed document.
 *
 * A PARSED DOCUMENT IS WEIGHED AS ITS JSON, so a caller that parsed first cannot slip past the size.
 */
export async function readShared(input: unknown, source: PackSource = { kind: 'paste' }): Promise<Result<Shared>> {
  let text: string;
  if (typeof input === 'string') text = input;
  else {
    try {
      text = JSON.stringify(input) ?? '';
    } catch {
      return no('PACK_MALFORMED', 'This is not a use-case file: it cannot be written down as JSON.', { at: 'file' });
    }
  }
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SHARED_MOST_BYTES)
    return no(
      'PACK_OVER_CAP',
      `This file is ${Math.ceil(bytes / 1024)} KB, and a shared use case is at most ${SHARED_MOST_BYTES / 1024} KB. Share fewer example rows, or split it.`,
      { at: 'file' },
    );

  let doc: unknown = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(text);
    } catch {
      return no('PACK_MALFORMED', 'This is not a use-case file: it is not JSON. A use case is shared as a .usecase.json file.', { at: 'file' });
    }
  }
  if (!isMap(doc) || typeof doc.usecase !== 'string')
    return no('PACK_MALFORMED', 'This is not a use-case file: it has no usecase in it. A plugin is installed from its own screen.', { at: 'usecase' });

  if (nestedPast(doc))
    return no('PACK_MALFORMED', `This is not a use-case file: it nests deeper than ${NESTED_MOST} levels, and no use case does.`, { at: 'file' });

  const key = credentialKey(doc);
  if (key) return no('SECRET_IN_PACK', `This file carries a ${key}. A shared use case never carries a credential; take it out and share it again.`, { at: key });
  const shaped = credentialValue(doc);
  if (shaped)
    return no('SECRET_IN_PACK', `This file holds what looks like a credential at ${shaped}. A shared use case never carries one; take it out and share it again.`, {
      at: shaped,
    });

  /* `changes` SAYS WHAT ONE VERSION CHANGED, and the use case reads it as one of its own keys now, so the note
     travels on the pack it carries and a record can show it. A file that says its changes still installs exactly as one
     that does not: the note is kept out of the pack's checksum, as its title is. */
  const u = normaliseUseCase(doc);
  if (!u.ok) return u as Result<Shared>;
  const noted = u.value.changes === undefined ? {} : { changes: u.value.changes };
  const carried = useCasePack(u.value);
  if (carried === null) return ok({ usecase: u.value, pack: null, doc: null, bytes, ...noted });
  const pack = await normalise(carried, source);
  if (!pack.ok) return pack as Result<Shared>;
  for (const decl of pack.value.declarations) {
    /* A FIRST-PARTY MODULE'S LIST IS THE MODULE'S. One declared by a use case that does not install the module would be
       read by the record as the module's own list; one that does install it is refused at install, as a conflict. */
    const list = decl.kind === 'register' ? decl.id.slice('register.'.length) : null;
    const owner = list === null ? undefined : FIRST_PARTY_LISTS.get(list);
    if (owner !== undefined && !u.value.modules.includes(owner))
      return no('PROVIDES_CONFLICT', `This setup declares a list called ${list}, which belongs to the ${MODULE_LISTS[owner].name} module. Name the list something else, or add ${owner} to its modules.`, {
        at: decl.id,
      });
    const fault = validateDeclaration({ id: decl.id, kind: decl.kind, body: decl.body });
    if (fault?.code === 'KIND_UNKNOWN')
      return { ok: false, refusal: { ...fault, fix: kindUnknownSentence(fault.fix), at: `${decl.id}${fault.at ? `.${fault.at}` : ''}` } };
  }
  return ok({ usecase: u.value, pack: pack.value, doc: carried, bytes, ...noted });
}

/**
 * THE KERNEL'S SENTENCE IS FOR SOMEBODY WRITING A PACK (`page.evil.blocks[0]: kind "iframe" is not a kind this build
 * draws, and no block declares it`),
 * and a shared file is read by somebody installing one. The same refusal, the same code and the same `at`, said as what
 * it means to them. A block with no kind at all is said as a block this version cannot read.
 */
export function kindUnknownSentence(authorFix: string): string {
  const named = /kind "([^"]{1,40})"/u.exec(authorFix)?.[1];
  return named
    ? `This setup uses a block this version of BrainDog does not have: ${named}. It cannot be installed here until BrainDog draws that block.`
    : 'This setup has a block that names no kind, so this version of BrainDog cannot draw it. Ask whoever shared it for a new file.';
}

/* ── going out ──────────────────────────────────────────────────────────── */

export type ExportParts = {
  usecase: string;
  version: string;
  title: string;
  summary: string;
  author: string;
  license: string;
  audience: Audience;
  tone: string;
  signals?: readonly string[];
  modules: readonly string[];
  /** The packs this use case cannot stand without, a part of `modules` (`UseCase.needs`). */
  needs?: readonly string[];
  voice: Partial<Record<VoiceKey, string>>;
  labels: Record<string, string>;
  /** The carried pack's declarations, in a pack document's own shape: `{ register: 'courses', ... }`. */
  declarations: readonly Record<string, unknown>[];
  /** Example rows the person picked, each already cut to what a seed may hold (`exampleFields`). */
  examples: readonly { register: string; fields: Record<string, unknown> }[];
  skills?: readonly { name: string; trigger: string }[];
  /** The rail's order, as addresses of the pages and lists this file carries (`UseCase.nav`). */
  nav?: readonly string[];
  /** How the picked examples point at each other, by title (`UseCase.links`). */
  links?: readonly ExampleLink[];
};

/**
 * The file for a use case, from its parts, checked as `normaliseUseCase` checks one coming in.
 *
 * A PACK'S `pack:` KEY IN A DECLARATION NAMES WHERE IT WAS INSTALLED FROM, and the file installs it as this use case's
 * own, so the key is written as the pack this file carries.
 */
export function exportUseCase(parts: ExportParts): Result<Record<string, unknown>> {
  const id = packIdOf(parts.usecase);
  const declarations = parts.declarations.map((d) => ('pack' in d ? { ...d, pack: id } : d));
  const hasPack = declarations.length > 0;
  const perList = new Map<string, number>();
  for (const row of parts.examples) {
    const n = (perList.get(row.register) ?? 0) + 1;
    if (n > SEEDS_PER_REGISTER)
      return no('OUT_OF_BOUNDS', `A use case shares at most ${SEEDS_PER_REGISTER} example rows a list, and ${row.register} has more picked.`, {
        at: `examples.${row.register}`,
      });
    perList.set(row.register, n);
  }
  const doc: Record<string, unknown> = {
    usecase: parts.usecase,
    version: parts.version,
    title: parts.title,
    summary: parts.summary,
    author: parts.author,
    license: parts.license,
    audience: parts.audience,
    tone: parts.tone,
    signals: [...(parts.signals ?? [])],
    modules: [...parts.modules],
    ...(parts.needs !== undefined ? { needs: [...parts.needs] } : {}),
    ...(hasPack && Object.keys(parts.voice).length > 0 ? { voice: parts.voice } : {}),
    ...(hasPack && Object.keys(parts.labels).length > 0 ? { labels: parts.labels } : {}),
    pack: hasPack
      ? {
          pack: id,
          requires: { format: 1, primitives: 1, packs: {} },
          declarations,
          ...(parts.examples.length > 0 ? { seeds: parts.examples.map((e) => ({ register: e.register, fields: e.fields })) } : {}),
        }
      : null,
    skills: (parts.skills ?? []).map((s) => ({ name: s.name, trigger: s.trigger })),
    ...(parts.nav !== undefined && parts.nav.length > 0 ? { nav: [...parts.nav] } : {}),
    ...(parts.links !== undefined && parts.links.length > 0 ? { links: parts.links.map((l) => ({ ...l })) } : {}),
  };
  const checked = normaliseUseCase(doc);
  if (!checked.ok) return checked as Result<Record<string, unknown>>;
  return ok(doc);
}

/** How far a share moves the version: a patch for a changed word or row, a minor for a list or page added. */
export type VersionStep = 'patch' | 'minor';

/** The next version to share an arrangement as: the patch or minor after `was`, or 1.0.0 for one that has none. */
export function nextVersion(was: string | null | undefined, step: VersionStep = 'patch'): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(was ?? '');
  if (!m) return '1.0.0';
  return step === 'minor' ? `${m[1]}.${Number(m[2]) + 1}.0` : `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

/**
 * The later of two versions, by number, ignoring a pre-release tail; `null` when neither is one. A share counts on from
 * whichever is later: the version installed, or the one this record last shared as.
 */
export function laterVersion(a: string | null | undefined, b: string | null | undefined): string | null {
  const parse = (v: string | null | undefined) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(v ?? '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x) return y ? (b as string) : null;
  if (!y) return a as string;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) > (y[i] as number) ? (a as string) : (b as string);
  return a as string;
}

/** Field types a shared example row never carries: a link is to a row the other record does not hold. */
const UNSHARED_TYPES = new Set(['ref', 'file', 'secret']);

/**
 * One row's fields cut to what an example in a shared file may hold, against the list's declaration: no link, no file,
 * nothing empty, and no `tags`, which the install marks itself.
 */
export function exampleFields(register: Record<string, unknown>, fields: Record<string, unknown>): Record<string, unknown> {
  const declared = Array.isArray(register.fields) ? (register.fields as Record<string, unknown>[]) : [];
  const out: Record<string, unknown> = {};
  for (const field of declared) {
    const id = typeof field.id === 'string' ? field.id : null;
    if (id === null || id === 'tags' || UNSHARED_TYPES.has(String(field.type))) continue;
    if (field.type === 'list' && UNSHARED_TYPES.has(String(field.of))) continue;
    const value = fields[id];
    if (value === null || value === undefined || value === '') continue;
    out[id] = value;
  }
  return out;
}

/**
 * An installed declaration body with each setting's value put back as the placeholder it was filled from.
 *
 * THE RECORD STORES A DECLARATION FILLED IN (`{{config:voice_needs_you}}` becomes "Coming up"), so a Home heading
 * exported as it is stored would stop following the voice on the record it is installed on. A string that is exactly a
 * voice setting's value, now or by default, is written back as its placeholder, and only under a block's `heading`: a page
 * title that happens to read Today stays Today. Only a whole string, so a sentence containing the word is left as it was.
 */
export function unfilled(body: unknown, settings: ReadonlyMap<string, string>, keys: ReadonlySet<string> = HEADINGS): unknown {
  if (Array.isArray(body)) return body.map((v) => unfilled(v, settings, keys));
  if (!isMap(body)) return body;
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? (keys.has(k) && settings.has(v) ? `{{config:${settings.get(v)}}}` : v) : unfilled(v, settings, keys)]),
  );
}

/** The keys a voice placeholder is put back under: a block's heading, which is where a use case's Home reads its voice. */
const HEADINGS: ReadonlySet<string> = new Set(['heading']);
