/**
 * A use case as a file somebody hands to somebody else (`loop/research-spark.md` §5, S14).
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
 * `SECRET_IN_PACK` for a credential, `KIND_UNKNOWN` for a kind nothing draws.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { validateDeclaration } from '@braindog/kernel';

import { credentialKey, credentialValue } from './credentials.ts';
import { normalise, SEEDS_PER_REGISTER, type Pack, type PackSource } from './index.ts';
import { normaliseUseCase, packIdOf, useCasePack, type Audience, type UseCase, type VoiceKey } from './usecase.ts';

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
};

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
    return no('PACK_MALFORMED', 'This is not a use-case file: it has no usecase in it. An add-on is installed from its own screen.', { at: 'usecase' });

  const key = credentialKey(doc);
  if (key) return no('SECRET_IN_PACK', `This file carries a ${key}. A shared use case never carries a credential; take it out and share it again.`, { at: key });
  const shaped = credentialValue(doc);
  if (shaped)
    return no('SECRET_IN_PACK', `This file holds what looks like a credential at ${shaped}. A shared use case never carries one; take it out and share it again.`, {
      at: shaped,
    });

  const u = normaliseUseCase(doc);
  if (!u.ok) return u as Result<Shared>;
  const carried = useCasePack(u.value);
  if (carried === null) return ok({ usecase: u.value, pack: null, doc: null, bytes });
  const pack = await normalise(carried, source);
  if (!pack.ok) return pack as Result<Shared>;
  for (const decl of pack.value.declarations) {
    const fault = validateDeclaration({ id: decl.id, kind: decl.kind, body: decl.body });
    if (fault?.code === 'KIND_UNKNOWN') return { ok: false, refusal: { ...fault, at: `${decl.id}${fault.at ? `.${fault.at}` : ''}` } };
  }
  return ok({ usecase: u.value, pack: pack.value, doc: carried, bytes });
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
  voice: Partial<Record<VoiceKey, string>>;
  labels: Record<string, string>;
  /** The carried pack's declarations, in a pack document's own shape: `{ register: 'courses', ... }`. */
  declarations: readonly Record<string, unknown>[];
  /** Example rows the person picked, each already cut to what a seed may hold (`exampleFields`). */
  examples: readonly { register: string; fields: Record<string, unknown> }[];
  skills?: readonly { name: string; trigger: string }[];
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
  };
  const checked = normaliseUseCase(doc);
  if (!checked.ok) return checked as Result<Record<string, unknown>>;
  return ok(doc);
}

/** The next version to share an arrangement as: the patch after `was`, or 1.0.0 for one that has none. */
export function nextVersion(was: string | null | undefined): string {
  const m = /^(\d+)\.(\d+)\.(\d+)/u.exec(was ?? '');
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : '1.0.0';
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
 * voice or label setting's value, now or by default, is written back as its placeholder. Only a whole string, so a
 * sentence that happens to contain the word is left as it was.
 */
export function unfilled(body: unknown, settings: ReadonlyMap<string, string>): unknown {
  if (typeof body === 'string') return settings.has(body) ? `{{config:${settings.get(body)}}}` : body;
  if (Array.isArray(body)) return body.map((v) => unfilled(v, settings));
  if (isMap(body)) return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, unfilled(v, settings)]));
  return body;
}
