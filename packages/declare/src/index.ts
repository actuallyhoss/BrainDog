/**
 * A pack: a business's shape as a file somebody can read, share and take back out.
 *
 * THE PLAN IS THE PRODUCT. Installing a pack changes what a record is — its registers, its pages,
 * the rules that will run while nobody is looking — and the honest way to do that is to say exactly
 * what will change and let a person approve it. Every product that installs first and explains
 * afterwards is a product people install once and then stop trusting.
 *
 * SO `plan` REFUSES NOTHING AND `install` REFUSES EVERYTHING. A plan of a pack that cannot be
 * installed is the most useful thing this module produces: it names the conflict, the missing
 * dependency and the rows that would be orphaned, in one screen, instead of failing on the first of
 * them and making somebody discover the rest one round trip at a time.
 *
 * AND THE PLAN IS A PROMISE ABOUT ONE MOMENT. `planHash` is `<record_version>.<sha256 of the pack
 * and the declaration state it was planned against>`: the integer half catches a record that moved,
 * and the hash half catches a pack that was edited between the plan and the install — which no
 * version number can see. Approving a diff and installing a different one is the failure this
 * prevents, and it is not hypothetical when the thing being approved is a file in an editor.
 *
 * A PACK CANNOT READ A ROW, and `touches` says so by construction rather than by measurement. It
 * declares shape and it seeds examples; it has no verb that reads what is already there. That is
 * what makes a pack safe to install from a stranger, and it is why the checks below are all about
 * what a pack DECLARES rather than about what it might do.
 */

import type { Result } from '@braindog/ports';
import { no, ok } from '@braindog/ports';
import { KINDS, digest, jcs, type DeclKind, type Json } from '@braindog/kernel';

/* ── the grammars, and they are `34-GRAMMARS` §4's ───────────────────────── */

const PACK_ID = /^[a-z][a-z0-9-]{1,63}$/;
const NAME = /^[a-z][a-z0-9_]{0,31}$/;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/;

export const PACK_SOURCES = ['kennel', 'url', 'git', 'paste', 'local'] as const;
export type PackSource = { kind: (typeof PACK_SOURCES)[number]; ref?: string };

export type PackDeclaration = { kind: DeclKind; id: string; body: Record<string, Json>; canonical: string };
export type Seed = { register: string; fields: Record<string, Json>; note?: string };

export type Manifest = {
  pack: string;
  version: string;
  summary: string;
  author: string;
  license: string;
  requires: { format: number; primitives: number; packs: Record<string, string> };
  /** Every id this pack claims. Derived, never declared — a list that can disagree with the file. */
  provides: string[];
  note?: string;
};

export type Pack = {
  manifest: Manifest;
  declarations: PackDeclaration[];
  seeds: Seed[];
  /** `jcs` of the manifest without `provides`, the declaration bodies and the seeds. */
  canonical: string;
  checksum: string;
  /** Where it came from. Metadata, and never hashed: one pack from two places is one pack. */
  source: PackSource;
};

export type Installed = {
  format: number;
  primitives: number;
  record_version: number;
  packs: { id: string; version: string }[];
  declarations: { id: string; version: number; kind: DeclKind; pack_id: string | null; body: string; checksum: string }[];
  rows: Record<string, number>;
};

export type Diff = {
  pack: { id: string; version: string; author: string; license: string; summary: string; checksum: string; source: PackSource };
  installed_version: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  requires: {
    format: { wanted: number; has: number; ok: boolean };
    primitives: { wanted: number; has: number; ok: boolean };
    packs: { id: string; range: string; installed: string | null; ok: boolean }[];
  };
  adds: { id: string; summary: string }[];
  changes: { id: string; from_version: number; summary: string }[];
  retires: { id: string; rows: number }[];
  conflicts: { id: string; pack: string }[];
  seeds: { count: number; registers: { register: string; rows: number }[] };
  /** Every rule that would generate rows, with the ceiling it declares. */
  spawns: { rule: string; register: string; bound: number; when: string }[];
  /** Every connector that would leave the record, and what it would open. */
  calls_out: { ingest: string; every: string; grant: string | null }[];
  /** Rules that would interrupt somebody rather than wait for the digest. */
  interrupts: string[];
  /** By construction: a pack declares shape and seeds examples, and has no verb that reads a row. */
  touches: { rows_read: 0; rows_written: 0 };
  /** Rows that would be left under a retired register. Above zero is a refusal at install. */
  orphans: number;
  warnings: { at: string; say: string }[];
  base: { format: number; primitives: number; packs: [string, string][]; declarations: [string, number, string][] };
  planHash: string;
};

export type Applied = { pack: string; version: string; declarations: number; seeds: number; retired: number };
export type Retired = { pack: string; declarations: number; rows_kept: Record<string, number> };

/**
 * The kernel's declaration methods, with the caller already bound.
 *
 * A PORT AND NOT AN IMPORT, because this module decides WHAT to install and the kernel decides
 * whether it may. Handing it the four functions it needs keeps the permission check in one place
 * and makes every branch below testable against an object literal.
 */
export type Host = {
  count: (register: string) => number;
  install: (batch: readonly { id: string; kind: string; body: Json; pack?: string }[]) => Promise<Result<unknown>>;
  retire: (ids: readonly string[]) => Result<unknown>;
  seed: (register: string, fields: Record<string, Json>, note: string | undefined) => Result<unknown>;
  /** The `pack` row, and the ids it claims — read on uninstall. */
  remember: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string }) => void;
  forget: (id: string) => void;
  claimed: (pack: string) => string[];
};

/* ── reading the document ────────────────────────────────────────────────── */

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

const malformed = <T>(fix: string, at?: string): Result<T> =>
  no<T>('PACK_MALFORMED', fix, at === undefined ? {} : { at });

/** Keys whose value is a credential by any reading. A pack is a file people share. */
const SECRETS = new Set(['secret', 'token', 'password', 'api_key', 'apikey', 'ciphertext', 'private_key', 'bearer']);

/**
 * A document becomes a pack, or does not.
 *
 * THE KIND IS THE KEY THAT IS THERE. A declaration is `{ register: 'obligations', … }` or
 * `{ rule: 'chase', … }` — the word is both the kind and the name, which is what makes a pack
 * readable as a document rather than as a serialisation. Two of them is a declaration that is two
 * things, and guessing which would be guessing.
 *
 * AND A CREDENTIAL IS NEVER IN ONE. A pack is a file people email each other; a `token:` inside one
 * has been published to everybody who has ever had a copy. Refused at the door, by key name, before
 * anything is stored.
 */
export async function normalise(doc: unknown, source: PackSource = { kind: 'local' }): Promise<Result<Pack>> {
  if (!isObject(doc)) return malformed('A pack is a document with a `pack` and a `version` in it.');

  const id = doc.pack;
  if (typeof id !== 'string' || !PACK_ID.test(id))
    return malformed(`${String(id)} is not a pack id: lower-case letters, digits and hyphens.`, 'pack');

  const version = doc.version;
  if (typeof version !== 'string' || !SEMVER.test(version))
    return malformed(`${String(version)} is not a version. Write 1.0.0.`, 'version');

  for (const key of ['summary', 'author', 'license'] as const)
    if (typeof doc[key] !== 'string' || !(doc[key] as string).trim())
      return malformed(`A pack says its ${key}, because somebody has to decide whether to trust it.`, key);

  const requires = isObject(doc.requires) ? doc.requires : {};
  const manifest: Manifest = {
    pack: id,
    version,
    summary: doc.summary as string,
    author: doc.author as string,
    license: doc.license as string,
    requires: {
      format: Number(requires.format ?? 0) || 0,
      primitives: Number(requires.primitives ?? 0) || 0,
      packs: isObject(requires.packs) ? (requires.packs as Record<string, string>) : {},
    },
    provides: [],
    ...(typeof doc.note === 'string' ? { note: doc.note } : {}),
  };

  const raw = doc.declarations;
  if (!Array.isArray(raw) || raw.length === 0)
    return malformed(`${id} declares nothing, so installing it would change nothing.`, 'declarations');

  const declarations: PackDeclaration[] = [];
  const seen = new Set<string>();
  for (const body of raw) {
    if (!isObject(body)) return malformed('A declaration is an object whose key is its kind.', 'declarations');

    /* THE KIND IS THE FIRST KEY, and it has to be: a rule names the register it is about, so
       `{ rule: 'chase', register: 'obligations' }` has two of the eight words in it and only the
       order says which one it IS. A mapping keeps its order in YAML and in JSON, and that order is
       the declaration's own sentence — `rule: chase` first, and everything after it is about the
       rule. */
    const first = Object.keys(body)[0] ?? '';
    const kind = KINDS.find((k) => k === first);
    if (!kind)
      return malformed(
        `A declaration begins with its kind: one of ${KINDS.join(', ')}. This one begins with ${first || '(nothing)'}.`,
        'declarations',
      );
    const name = body[kind];
    if (typeof name !== 'string' || !NAME.test(name))
      return malformed(`${String(name)} is not a ${kind} id: lower-case letters, digits and single underscores.`, kind);

    const wrong = credential(body);
    if (wrong)
      return no<Pack>('SECRET_IN_PACK', `${kind}.${name} carries a ${wrong}, and a pack is a file people share.`, {
        at: wrong,
      });

    const declId = `${kind}.${name}`;
    if (seen.has(declId)) return malformed(`${id} declares ${declId} twice.`, declId);
    seen.add(declId);

    /* A REGISTER SAYS `id` ONCE IT IS STORED, and every other kind keeps its own word. That is the
       kernel's convention and it is a good one — a page carrying its own name twice would have a
       copy that drifts — but a register is the one whose word is the same as the kind, so the
       document says `register: obligations` and the record stores `id: obligations`. Normalising it
       here is what this function is called. */
    const { register: _named, ...rest } = body as Record<string, Json>;
    const stored = kind === 'register' ? ({ id: name, ...rest } as Record<string, Json>) : body;
    declarations.push({ kind, id: declId, body: stored, canonical: jcs(stored) });
  }

  const registers = new Set(declarations.filter((d) => d.kind === 'register').map((d) => d.body.id as string));
  const seeds: Seed[] = [];
  const seeded = new Set<string>();
  for (const seed of Array.isArray(doc.seeds) ? doc.seeds : []) {
    if (!isObject(seed) || typeof seed.register !== 'string' || !isObject(seed.fields))
      return malformed('A seed is a register and the fields of one example row.', 'seeds');
    /* ITS OWN REGISTERS ONLY. A pack that could seed somebody else's register could put a row in
       the middle of a business it does not describe. */
    if (!registers.has(seed.register))
      return malformed(`${id} seeds ${seed.register}, which it does not declare.`, 'seeds');
    if (seeded.has(seed.register)) return malformed(`${id} seeds ${seed.register} twice.`, 'seeds');
    seeded.add(seed.register);
    seeds.push({
      register: seed.register,
      fields: seed.fields,
      ...(typeof seed.note === 'string' ? { note: seed.note } : {}),
    });
  }

  manifest.provides = declarations.map((d) => d.id).sort();
  /* `provides` IS OMITTED FROM THE HASH because it is derived from the declarations that are
     already in it — hashing both would let one pack have two checksums for one file. */
  const { provides: _provides, ...hashed } = manifest;
  const canonical = jcs({ manifest: hashed as unknown as Json, declarations: declarations.map((d) => d.body), seeds } as Json);
  return ok({ manifest, declarations, seeds, canonical, checksum: await digest(canonical), source });
}

/** The first credential-shaped key anywhere in a declaration, or `null`. */
function credential(body: Json): string | null {
  if (Array.isArray(body)) {
    for (const item of body) {
      const found = credential(item);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(body)) return null;
  for (const [key, value] of Object.entries(body)) {
    if (SECRETS.has(key.toLowerCase()) && typeof value === 'string' && value.trim()) return key;
    const found = credential(value);
    if (found) return found;
  }
  return null;
}

/* ── the plan ────────────────────────────────────────────────────────────── */

/** `1.2.3` against `>=1.0.0`, `^1.2.0`, `1.x` or an exact version. Absent or `*` is anything. */
export function satisfies(version: string | null, range: string): boolean {
  if (!version) return false;
  const want = range.trim();
  if (!want || want === '*' || want === 'x') return true;

  const parts = (v: string): number[] => v.split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const [ma, mi, pa] = parts(version);
  const cmp = (a: string): number => {
    const [x, y, z] = parts(a);
    return ma! - x! || mi! - y! || pa! - z!;
  };

  if (want.startsWith('>=')) return cmp(want.slice(2)) >= 0;
  if (want.startsWith('>')) return cmp(want.slice(1)) > 0;
  if (want.startsWith('<=')) return cmp(want.slice(2)) <= 0;
  if (want.startsWith('<')) return cmp(want.slice(1)) < 0;
  if (want.startsWith('^')) {
    const [x] = parts(want.slice(1));
    return ma === x && cmp(want.slice(1)) >= 0;
  }
  if (want.endsWith('.x')) return ma === parts(want)[0];
  return cmp(want) === 0;
}

const order = (a: string, b: string): number => {
  const pa = a.split('-')[0]!.split('.').map(Number);
  const pb = b.split('-')[0]!.split('.').map(Number);
  return (pa[0]! - pb[0]!) || (pa[1]! - pb[1]!) || (pa[2]! - pb[2]!);
};

/**
 * What installing this pack would do to this record.
 *
 * IT REFUSES NOTHING. A plan of a pack that cannot be installed is the most useful thing here: it
 * names the conflict, the missing dependency and the rows that would be orphaned in one screen,
 * instead of failing on the first and making somebody find the rest one round trip at a time.
 */
export async function plan(pack: Pack, installed: Installed): Promise<Diff> {
  const live = new Map(installed.declarations.map((d) => [d.id, d]));
  const mine = pack.manifest.pack;
  const was = installed.packs.find((p) => p.id === mine)?.version ?? null;

  const adds: Diff['adds'] = [];
  const changes: Diff['changes'] = [];
  const conflicts: Diff['conflicts'] = [];
  for (const decl of pack.declarations) {
    const already = live.get(decl.id);
    if (!already) {
      adds.push({ id: decl.id, summary: summarise(decl) });
      continue;
    }
    /* ANOTHER PACK'S DECLARATION IS NOT YOURS TO CHANGE. Two packs owning one register is two
       upgrades that undo each other, quietly, on whichever installs second. */
    if (already.pack_id && already.pack_id !== mine) {
      conflicts.push({ id: decl.id, pack: already.pack_id });
      continue;
    }
    if (already.body !== decl.canonical) changes.push({ id: decl.id, from_version: already.version, summary: summarise(decl) });
  }

  const keeping = new Set(pack.declarations.map((d) => d.id));
  const retires: Diff['retires'] = [];
  let orphans = 0;
  for (const decl of installed.declarations) {
    if (decl.pack_id !== mine || keeping.has(decl.id)) continue;
    const register = decl.id.startsWith('register.') ? decl.id.slice('register.'.length) : null;
    const rows = register ? (installed.rows[register] ?? 0) : 0;
    retires.push({ id: decl.id, rows });
    orphans += rows;
  }

  const format = { wanted: pack.manifest.requires.format, has: installed.format, ok: installed.format >= pack.manifest.requires.format };
  const primitives = {
    wanted: pack.manifest.requires.primitives,
    has: installed.primitives,
    ok: installed.primitives >= pack.manifest.requires.primitives,
  };
  const needs = Object.entries(pack.manifest.requires.packs).map(([id, range]) => {
    const has = installed.packs.find((p) => p.id === id)?.version ?? null;
    return { id, range, installed: has, ok: satisfies(has, range) };
  });

  const base: Diff['base'] = {
    format: installed.format,
    primitives: installed.primitives,
    packs: installed.packs.map((p) => [p.id, p.version] as [string, string]).sort((a, b) => a[0].localeCompare(b[0])),
    declarations: installed.declarations
      .map((d) => [d.id, d.version, d.checksum] as [string, number, string])
      .sort((a, b) => a[0].localeCompare(b[0])),
  };

  return {
    pack: {
      id: mine,
      version: pack.manifest.version,
      author: pack.manifest.author,
      license: pack.manifest.license,
      summary: pack.manifest.summary,
      checksum: pack.checksum,
      source: pack.source,
    },
    installed_version: was,
    direction: was === null ? 'install' : was === pack.manifest.version ? 'reinstall' : order(pack.manifest.version, was) > 0 ? 'upgrade' : 'downgrade',
    requires: { format, primitives, packs: needs },
    adds,
    changes,
    retires,
    conflicts,
    seeds: { count: pack.seeds.length, registers: pack.seeds.map((s) => ({ register: s.register, rows: 1 })) },
    spawns: spawnsOf(pack),
    calls_out: callsOf(pack),
    interrupts: interruptsOf(pack),
    touches: { rows_read: 0, rows_written: 0 },
    orphans,
    warnings: warningsOf(pack),
    base,
    /* THE INTEGER HALF CATCHES A RECORD THAT MOVED and the hash half catches a PACK that was edited
       between the plan and the install — which no version number can see, and which is exactly what
       happens when the thing being approved is a file in somebody's editor. */
    planHash: `${installed.record_version}.${await digest(jcs({ pack: pack.checksum, base } as unknown as Json))}`,
  };
}

const summarise = (decl: PackDeclaration): string => {
  const body = decl.body as Record<string, unknown>;
  if (decl.kind === 'register') return `${(body.fields as unknown[])?.length ?? 0} fields`;
  if (decl.kind === 'page') return `${(body.blocks as unknown[])?.length ?? 0} blocks`;
  if (decl.kind === 'rule') return `${(body.then as unknown[])?.length ?? 0} actions`;
  return decl.kind;
};

const spawnsOf = (pack: Pack): Diff['spawns'] =>
  pack.declarations
    .filter((d) => d.kind === 'rule')
    .flatMap((d) => {
      const body = d.body as { rule?: string; when?: unknown; then?: { create?: { register: string; bound: number } }[] };
      return (body.then ?? [])
        .filter((a) => a && typeof a === 'object' && 'create' in a)
        .map((a) => ({
          rule: String(body.rule ?? d.id),
          register: a.create!.register,
          bound: Number(a.create!.bound) || 0,
          when: typeof body.when === 'string' ? body.when : jcs((body.when ?? null) as Json),
        }));
    });

const callsOf = (pack: Pack): Diff['calls_out'] =>
  pack.declarations
    .filter((d) => d.kind === 'ingest' && typeof (d.body as { every?: unknown }).every === 'string')
    .map((d) => {
      const body = d.body as { ingest?: string; every?: string; grant?: string };
      return { ingest: String(body.ingest ?? d.id), every: String(body.every), grant: body.grant ?? null };
    });

const interruptsOf = (pack: Pack): string[] =>
  pack.declarations
    .filter(
      (d) =>
        d.kind === 'rule' &&
        ((d.body as { then?: { notify?: { urgent?: boolean } }[] }).then ?? []).some((a) => a?.notify?.urgent === true),
    )
    .map((d) => String((d.body as { rule?: string }).rule ?? d.id));

/**
 * What is worth saying out loud without refusing.
 *
 * A REGISTER WITH A SEED AND NO `tags` FIELD is the one that matters: the `example` marker IS the
 * value `example` in a `list<text>` field called `tags`, so a seeded register without one is a
 * record whose examples cannot be told from its real rows — and nobody deletes what they cannot
 * identify.
 */
function warningsOf(pack: Pack): { at: string; say: string }[] {
  const out: { at: string; say: string }[] = [];
  const registers = new Map(
    pack.declarations.filter((d) => d.kind === 'register').map((d) => [d.body.id as string, d.body]),
  );
  const seeded = new Set(pack.seeds.map((s) => s.register));

  for (const [id, body] of registers) {
    const fields = ((body as { fields?: { id?: string; type?: string }[] }).fields ?? []).map((f) => f.id);
    if (seeded.has(id) && !fields.includes('tags'))
      out.push({ at: `register.${id}`, say: `${id} has an example row and no tags field, so its examples cannot be told from its real rows.` });
    if (!seeded.has(id)) out.push({ at: `register.${id}`, say: `${id} arrives empty, so nothing on a page that reads it will draw.` });
  }
  return out;
}

/* ── the install ─────────────────────────────────────────────────────────── */

/**
 * Apply the plan, or say why not.
 *
 * EVERY REFUSAL FIRST, AND THEN ONE TRANSACTION. Half a pack is a record whose pages name registers
 * it does not have, and the way to not have half a pack is to check everything before writing
 * anything and to write it all in one go.
 */
export async function install(pack: Pack, diff: Diff, host: Host, planHash: string): Promise<Result<Applied>> {
  if (planHash !== diff.planHash)
    return no<Applied>(
      'PLAN_STALE',
      'This record has moved, or the pack has, since the plan you approved. Read the plan again.',
      { at: 'planHash' },
    );

  if (diff.conflicts.length) {
    const first = diff.conflicts[0]!;
    return no<Applied>('PROVIDES_CONFLICT', `${first.id} belongs to ${first.pack}, and two packs cannot own one declaration.`, {
      at: first.id,
    });
  }

  for (const need of [
    ['format', diff.requires.format] as const,
    ['primitives', diff.requires.primitives] as const,
  ])
    if (!need[1].ok)
      return no<Applied>(
        'OUT_OF_BOUNDS',
        `${diff.pack.id} needs ${need[0]} ${need[1].wanted} and this record is at ${need[1].has}.`,
        { at: `requires.${need[0]}` },
      );

  const missing = diff.requires.packs.find((p) => !p.ok);
  if (missing)
    return no<Applied>(
      'OUT_OF_BOUNDS',
      `${diff.pack.id} needs ${missing.id} ${missing.range}, and this record has ${missing.installed ?? 'none'}.`,
      { at: `requires.packs.${missing.id}` },
    );

  /* ROWS ARE NEVER THE PRICE OF AN UPGRADE. A pack that dropped a register somebody has been
     writing into for a year would take the year with it, and there is no `--force` in v1 because
     there is no sentence that makes that a good idea. */
  if (diff.orphans > 0) {
    const at = diff.retires.find((r) => r.rows > 0)!;
    return no<Applied>(
      'WOULD_ORPHAN',
      `${diff.pack.id} ${diff.direction}s away ${at.id}, and there are ${at.rows} rows in it. Move them first.`,
      { at: at.id },
    );
  }

  const put = await host.install(pack.declarations.map((d) => ({ id: d.id, kind: d.kind, body: d.body, pack: pack.manifest.pack })));
  if (!put.ok) return { ok: false, refusal: put.refusal };

  if (diff.retires.length) {
    const gone = host.retire(diff.retires.map((r) => r.id));
    if (!gone.ok) return { ok: false, refusal: gone.refusal };
  }

  /* THE SEEDS GO THROUGH THE WRITE PATH, so a seed that the register would refuse is refused here
     rather than becoming a row nothing else in the product could have made. */
  for (const seed of pack.seeds) {
    const made = host.seed(seed.register, seed.fields, seed.note);
    if (!made.ok) return { ok: false, refusal: made.refusal };
  }

  const { provides: _provides, ...manifest } = pack.manifest;
  host.remember({
    id: pack.manifest.pack,
    version: pack.manifest.version,
    source: pack.source.kind,
    ref: pack.source.ref ?? null,
    manifest: jcs(manifest as unknown as Json),
    checksum: pack.checksum,
  });

  return ok({
    pack: pack.manifest.pack,
    version: pack.manifest.version,
    declarations: pack.declarations.length,
    seeds: pack.seeds.length,
    retired: diff.retires.length,
  });
}

/**
 * Take a pack back out.
 *
 * THE ROWS STAY. A register retired is a shape nobody writes to any more, not a year of somebody's
 * invoices deleted because they changed their mind about a pack. What goes is the declaration, its
 * indexes and the pack row; what is left is data, and it is reported by register so nobody has to
 * wonder what is still there.
 */
export function uninstall(id: string, host: Host): Result<Retired> {
  const claimed = host.claimed(id);
  if (claimed.length === 0) return no<Retired>('OUT_OF_BOUNDS', `${id} is not installed.`, { at: 'id' });

  const kept: Record<string, number> = {};
  for (const declId of claimed)
    if (declId.startsWith('register.')) {
      const register = declId.slice('register.'.length);
      kept[register] = host.count(register);
    }

  const gone = host.retire(claimed);
  if (!gone.ok) return { ok: false, refusal: gone.refusal };
  host.forget(id);
  return ok({ pack: id, declarations: claimed.length, rows_kept: kept });
}
