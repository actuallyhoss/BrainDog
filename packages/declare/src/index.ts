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

import type { Conflict, Refusal, Result } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import { credentialKey as credential, credentialValue } from './credentials.ts';
import { KINDS, configReads, configValue, digest, egressOf as egressOfBody, fillConfig, jcs, readConfig, type ConfigDecl, type DeclKind, type Egress, type Json } from '@braindog/kernel';

/**
 * What one declaration sends out of the record, or `null` when it sends nothing: every host, how often, the key by label
 * and the fields. The same reading the record stores on a proposal, so a plan and a proposal print the same lines.
 */
export const egressOf = (decl: { kind: string; body: unknown }): Egress | null => (decl.kind === 'ingest' ? egressOfBody(decl.body) : null);
export type { Egress };

/* A use case: a pack with a front, its modules, signals and voice (`loop/research-spark.md` §2.1). */
export { SHARED_MOST_BYTES, SHARED_SUFFIX, exampleFields, exportUseCase, nextVersion, readShared, sharedFileName, unfilled, type ExportParts, type Shared } from './shared.ts';
export { looksLikeCredential } from './credentials.ts';
export { AUDIENCES, LABEL_KEY, MODULES, VOICE_KEYS, labelSetting, labelsOf, normaliseUseCase, packIdOf, useCasePack, voiceOf, voiceSetting, type Audience, type UseCase, type VoiceKey } from './usecase.ts';

/* ── the grammars, and they are `34-GRAMMARS` §4's ───────────────────────── */

const PACK_ID = /^[a-z][a-z0-9-]{1,63}$/;
/** The most example rows a pack gives one list (`42 §5.2` step 5). */
export const SEEDS_PER_REGISTER = 8;

/** A pack's example rows counted per list, in the order the lists are first seeded. */
const seedRows = (seeds: readonly { register: string }[]): { register: string; rows: number }[] => {
  const rows = new Map<string, number>();
  for (const s of seeds) rows.set(s.register, (rows.get(s.register) ?? 0) + 1);
  return [...rows].map(([register, n]) => ({ register, rows: n }));
};
/**
 * A REGISTER'S NAME BECOMES SQL AND EVERY OTHER NAME BECOMES AN ADDRESS, and that is the whole of
 * why there are two grammars here rather than one.
 *
 * A register id is inlined into an index name and a `json_extract` path — the one place in this
 * product where an identifier is not a bound parameter — so its grammar is a security boundary and
 * a hyphen has no business in it. A page, a metric, a rule and a digest are addressed by name in a
 * URL and in a document, never in SQL, and every example in the corpus writes them with hyphens:
 * `due-30d`, `spend-by-channel`, `mean-days-to-pay`. One grammar for both would have to pick, and
 * picking the strict one would refuse the product's own pages.
 */
const REGISTER_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const NAME = /^[a-z][a-z0-9_-]{0,63}$/;
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
  /**
   * The settings a person can change without editing the file, by name. Absent when the pack declares none.
   *
   * A CLOSED SUBSET OF THE FIELD TYPES (text, enum, bool, money, day and duration), each with an optional
   * default. A declaration reads one as `{{config:<key>}}`, and the value is written into the
   * declaration when the pack is planned and installed. `readConfig` in the kernel checks the map.
   */
  config?: Record<string, ConfigDecl>;
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
  /**
   * The settings somebody chose, by pack id: `pack.manifest.config_values` for each pack that has any.
   *
   * OPTIONAL, because a record with no pack settings, and every caller written before settings
   * existed, has nothing to say here. A missing map plans every setting at its default.
   */
  config?: Record<string, Record<string, Json>>;
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
  /**
   * Every scheduled action that would leave the record: a `pull`, a `call` or a `poll`, with the host it
   * calls, how often, and the key it sends by label. `line` is the diff's own sentence for it, and it
   * reads `CALLS OUT <host> · every <n> · grant "<label>"` (`04 §7`, `loop/DIRECTION.md` §0b).
   */
  calls_out: {
    ingest: string;
    channel: string;
    method: 'GET' | 'POST';
    host: string | null;
    /** The interval, or empty for a call only a rule runs. */
    every: string;
    /** `schedule`, `rule` or `both`. */
    trigger: 'schedule' | 'rule' | 'both';
    /** The most rule-fired calls a day, or `null` when no rule runs it. */
    per_day: number | null;
    grant: string | null;
    /** The fields that leave with a rule-fired call, each `register.field`. */
    sends: string[];
    project: string | null;
    line: string;
    /** The project action's own approval line, when it sends a key (a key is not kept per project yet). */
    key_line: string | null;
    /** Against what is installed: a new action, one whose host, key or fields differ, or the same. */
    change: 'new' | 'changed' | 'same';
  }[];
  /**
   * The lines installing this plan asks the owner to approve: each `new` or `changed` action's `line`, then its
   * `key_line` when it has one. Empty when it calls nothing new, so an install that only keeps what was approved
   * before asks for nothing. `install` arms none of them unless the same lines come back with it.
   */
  approve: string[];
  /** Rules that would interrupt somebody rather than wait for the digest. */
  interrupts: string[];
  /** By construction: a pack declares shape and seeds examples, and has no verb that reads a row. */
  touches: { rows_read: 0; rows_written: 0 };
  /** Rows that would be left under a retired register. Above zero is a refusal at install. */
  orphans: number;
  /**
   * Field changes this upgrade cannot make, because the register already holds rows.
   *
   * REPORTED HERE AND REFUSED BY `install`, which is `WOULD_ORPHAN`'s shape and the one `42 §5.3`
   * gives every class-D rule: the plan names everything that is wrong in one screen and refuses
   * nothing, and the install is where the answer is no. Both are empty on a first install, on a
   * register with no rows, and on any change that leaves the rows readable.
   */
  retypes: { id: string; field: string; from: string; to: string; rows: number }[];
  newly_required: { id: string; field: string; rows: number }[];
  /**
   * A retire and an add that are one declaration under two ids. Reported here, refused by `install`.
   *
   * `42 §5.3·10`'s rule, which is exact on purpose: the same kind, and the two bodies equal once the
   * key that carries the id is taken out. A fuzzier match is `42 §10`'s ledgered ceiling.
   */
  renames: { from: string; to: string; rows: number }[];
  warnings: { at: string; say: string }[];
  /**
   * Each setting the pack declares and the value this install writes into its declarations.
   *
   * `kept` is a value somebody set on the installed version that is still legal for this one,
   * `default` is this version's default, and `none` is a setting with neither, which no declaration
   * reads, because `normalise` refuses a placeholder whose setting has no default.
   */
  config: { key: string; type: string; value: Json; from: 'kept' | 'default' | 'none' }[];
  /**
   * The lists this pack points at that the record does not hold and the pack does not declare.
   * Reported here, refused by `install` and by the record's `planPack` as `REGISTER_UNRESOLVED`.
   * `provider` is the first-party pack that declares the list, when there is one.
   */
  unresolved: { register: string; at: string; provider: string | null }[];
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
  /**
   * Validate and hash the batch, and hand back the write as a synchronous function.
   *
   * TWO CALLS RATHER THAN ONE, because the write has to happen inside the transaction below it.
   * Hashing is the only asynchronous part of an install, and an install that hashed inside its own
   * transaction could not be joined to the retire, the seeds and the pack row — which is how a
   * refused install left one declaration retired and another live.
   */
  stage: (batch: readonly { id: string; kind: string; body: Json; pack?: string }[]) => Promise<Result<() => Result<unknown>>>;
  /** The caller's transaction. A throw inside it rolls back; a returned value commits. */
  transaction: <T>(fn: () => T) => T;
  /** Rebuild whatever the host caches from the declarations, once the transaction has committed. */
  reload: () => void;
  retire: (ids: readonly string[]) => Result<unknown>;
  seed: (register: string, fields: Record<string, Json>, note: string | undefined) => Result<unknown>;
  /**
   * The `pack` row, and the ids it claims — read on uninstall. `approved` is the calls-out lines the owner approved
   * with this install, word for word, when it asked for any.
   */
  remember: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string; approved?: readonly string[] }) => void;
  forget: (id: string) => void;
  claimed: (pack: string) => string[];
  /**
   * Whether the vault holds a key by this label or id. OPTIONAL: a host without a vault checks nothing, and a record
   * refuses an approved call whose key is missing, because arming it would pause it on its first run.
   */
  keyHeld?: (name: string) => boolean;
};

/* ── reading the document ────────────────────────────────────────────────── */

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A list-valued key off a declaration body, and never a throw.
 *
 * WHAT IS IN A PACK IS A STRANGER'S TEXT. Every reader of `fields` and `then` reached for `.map`,
 * `.filter` or `.some` on whatever was under the key, and a document is free to put a string there.
 * A key that is not a list is nothing to walk, which is the answer that lets `plan` finish and say
 * what it does know rather than answering 500.
 */
const listOf = (body: unknown, key: string): readonly unknown[] => {
  const value = isObject(body) ? body[key] : undefined;
  return Array.isArray(value) ? value : [];
};

const malformed = <T>(fix: string, at?: string): Result<T> =>
  no<T>('PACK_MALFORMED', fix, at === undefined ? {} : { at });


/** Keys that name an appearance, which only a theme may. `42 §5.3·11`. */
const PAINTS = new Set(['colour', 'color']);

/**
 * `42 §4.2`'s `Colour`: the whole value, trimmed. Module constants, never built from pack text (`42 §8`).
 *
 * THE FUNCTION NAMES FOLD CASE, because CSS reads `RGB(` as `rgb(` and a check that did not would
 * pass the one spelling a person copying from an old stylesheet writes.
 */
const HEX = /^#[0-9a-fA-F]{3,8}$/u;
const CSS_COLOUR = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/iu;

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
  /* A DEPENDENCY'S RANGE IS TEXT, AND THIS TOOK THE AUTHOR'S WORD FOR IT. The map was cast whole
     (`requires.packs as Record<string, string>`) over values nobody had looked at, and `satisfies`
     then called `.trim()` on whatever was there: a pack whose `requires.packs` held a number threw a
     TypeError out of `plan`, which is the READ somebody runs to decide whether to trust a file from
     a stranger. A refusal is a value here and 500 is not an answer. */
  const needs: Record<string, string> = {};
  if (isObject(requires.packs))
    for (const [dependency, range] of Object.entries(requires.packs)) {
      if (typeof range !== 'string')
        return malformed(
          `${id} requires ${dependency} at ${JSON.stringify(range)}, and a version range is text like >=1.0.0.`,
          'requires.packs',
        );
      needs[dependency] = range;
    }
  /* A PACK'S SETTINGS ARE CHECKED BEFORE ANYTHING READS THEM, with the kernel's own coercion, so a
     money default is minor units and a currency here exactly as it is in a row. */
  const settings = readConfig(doc.config);
  if (!settings.ok) return settings as Result<Pack>;
  const manifest: Manifest = {
    pack: id,
    version,
    summary: doc.summary as string,
    author: doc.author as string,
    license: doc.license as string,
    requires: {
      format: Number(requires.format ?? 0) || 0,
      primitives: Number(requires.primitives ?? 0) || 0,
      packs: needs,
    },
    provides: [],
    ...(typeof doc.note === 'string' ? { note: doc.note } : {}),
    /* ONLY WHEN THERE ARE SETTINGS, so a pack written before `config:` existed keeps its checksum. */
    ...(Object.keys(settings.value).length > 0 ? { config: settings.value } : {}),
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
    const grammar = kind === 'register' ? REGISTER_NAME : NAME;
    if (typeof name !== 'string' || !grammar.test(name))
      return malformed(
        kind === 'register'
          ? `${String(name)} is not a register id: lower-case letters, digits and single underscores. A register id becomes SQL.`
          : `${String(name)} is not a ${kind} id: lower-case letters, digits, underscores and hyphens.`,
        kind,
      );

    const wrong = credential(body);
    if (wrong)
      return no<Pack>('SECRET_IN_PACK', `${kind}.${name} carries a ${wrong}, and a pack is a file people share.`, {
        at: wrong,
      });
    /* AND A VALUE THAT IS ONE, whatever key it sits under (`credentials.ts`). */
    const shaped = credentialValue(body);
    if (shaped)
      return no<Pack>('SECRET_IN_PACK', `${kind}.${name} holds what looks like a credential at ${shaped}, and a pack is a file people share.`, {
        at: `${kind}.${name}.${shaped}`,
      });

    /**
     * AND A COLOUR IS NEVER IN ONE THAT IS NOT A THEME, AND NOTHING LOOKED.
     *
     * `credential` walks every body for a key that holds a secret, and no walk anywhere looked for
     * one that holds a colour. Driven through this function:
     *
     *     block.invoice-card, colour: '#E11D48'      ACCEPTED
     *     page block, color: 'red'                   ACCEPTED
     *     page block, tone: 'oklch(0.6 0.2 20)'      ACCEPTED
     *
     * `42 §5.3·11` is the rule, class B and one body alone: *"in every non-theme declaration: a key
     * named colour/color, or a string value matching Colour"*. `04 §5`'s sentence gives the reason:
     * a block names an intent and the theme names appearance. A colour written anywhere else is one
     * the theme a person chose cannot change, and `CONTRAST_FLOOR`, which is a theme's check, never
     * measures it. Seeds are rows and are not looked at: a hex value in an example row is data.
     */
    if (kind !== 'theme') {
      const painted = colour(body);
      if (painted)
        return no<Pack>(
          'COLOUR_OUTSIDE_THEME',
          `${kind}.${name} sets ${painted.at} to ${painted.value}. A ${kind} names an intent (good, warn, bad or info), and the theme names the colour.`,
          { at: `${kind}.${name}.${painted.at}` },
        );
    }

    const declId = `${kind}.${name}`;
    if (seen.has(declId)) return malformed(`${id} declares ${declId} twice.`, declId);
    seen.add(declId);

    /* A REGISTER'S `fields` AND A RULE'S `then` ARE LISTS OF OBJECTS, and neither was ever checked.
       `plan` walks both of them to say what a pack would DO before anybody installs it: how many
       fields, which rules spawn rows, which ones interrupt somebody. It walked them with `.map`,
       `.filter` and `.some`, so `fields` written as a string, as a mapping or as `[null]`, and `then`
       written as a string, as a mapping or carrying a null action, each passed this function and
       then threw a TypeError out of the preview. `plan` is the read somebody runs to decide whether
       to trust a file from a stranger, which makes it the worst place in this module for a crash,
       and `PACK_MALFORMED` naming the key is the answer the format already has. */
    const list = kind === 'register' ? 'fields' : kind === 'rule' ? 'then' : null;
    const items = list === null ? undefined : body[list];
    if (list !== null && items !== undefined && (!Array.isArray(items) || items.some((item) => !isObject(item))))
      return malformed(`${declId} writes its ${list} as something other than a list of objects.`, `${declId}.${list}`);

    /* A REGISTER SAYS `id` ONCE IT IS STORED, and every other kind keeps its own word. That is the
       kernel's convention and it is a good one — a page carrying its own name twice would have a
       copy that drifts — but a register is the one whose word is the same as the kind, so the
       document says `register: obligations` and the record stores `id: obligations`. Normalising it
       here is what this function is called. */
    const { register: _named, ...rest } = body as Record<string, Json>;
    const stored = kind === 'register' ? ({ id: name, ...rest } as Record<string, Json>) : body;
    const canonical = canonicalise(stored);
    if (canonical === null) return malformed(`${declId} holds something this record cannot write down.`, declId);
    declarations.push({ kind, id: declId, body: stored, canonical });
  }

  /* EVERY PLACEHOLDER NAMES A SETTING THIS PACK DECLARES, AND THAT SETTING HAS A DEFAULT. The first
     install of a pack has no chosen values yet, so a placeholder with no default would reach the
     kernel unfilled. A money value is an object, so it fills a whole value and never a piece of text. */
  for (const d of declarations)
    for (const read of configReads(d.body)) {
      const where = `${d.id}.${read.at}`;
      const setting = Object.hasOwn(settings.value, read.key) ? settings.value[read.key] : undefined;
      if (setting === undefined)
        return no<Pack>('FIELD_UNKNOWN', `${d.id} reads the setting ${read.key}, and ${id} declares no setting by that name.`, {
          at: where,
          allowed: Object.keys(settings.value),
        });
      if (setting.default === undefined)
        return no<Pack>(
          'REQUIRED_MISSING',
          `${d.id} reads the setting ${read.key}, so ${read.key} needs a default for the first install.`,
          { at: `config.${read.key}.default` },
        );
      if (setting.type === 'money' && !read.whole)
        return no<Pack>(
          'VALUE_MALFORMED',
          `${where} puts the money setting ${read.key} inside longer text. A money setting fills a whole value on its own.`,
          { at: where },
        );
    }

  const registers = new Map(declarations.filter((d) => d.kind === 'register').map((d) => [d.body.id as string, d.body]));
  const seeds: Seed[] = [];
  /* A FEW EXAMPLES PER LIST, NOT ONE. A guide opens on the six stages a project passes and a board on more than one
     ticket, so one row per list made a use case open half told. The ceiling keeps an example set an example. */
  const seeded = new Map<string, number>();
  /* A MAPPING IS THE NATURAL YAML MISTAKE, and treating it as no seeds at all meant an install that
     quietly planted nothing while the plan reported `seeds: 0` and looked correct. */
  if (doc.seeds !== undefined && !Array.isArray(doc.seeds))
    return malformed(`Seeds are a list of examples, at most ${SEEDS_PER_REGISTER} per register.`, 'seeds');
  for (const seed of Array.isArray(doc.seeds) ? doc.seeds : []) {
    if (!isObject(seed) || typeof seed.register !== 'string' || !isObject(seed.fields))
      return malformed('A seed is a register and the fields of one example row.', 'seeds');
    /* ITS OWN REGISTERS ONLY. A pack that could seed somebody else's register could put a row in
       the middle of a business it does not describe. */
    if (!registers.has(seed.register))
      return malformed(`${id} seeds ${seed.register}, which it does not declare.`, 'seeds');
    const count = (seeded.get(seed.register) ?? 0) + 1;
    if (count > SEEDS_PER_REGISTER)
      return malformed(`${id} seeds ${seed.register} ${count} times, and a list takes at most ${SEEDS_PER_REGISTER} example rows.`, 'seeds');
    seeded.set(seed.register, count);

    /* A SEEDED REGISTER DECLARES `tags`, or its examples cannot be told from its real rows — and
       nobody deletes what they cannot identify. The `example` marker is a value in that field
       rather than a column, so the field has to exist before the marker can. */
    /* AND THE FIELD LIST IS READ THROUGH `listOf`, because this cast a stranger's `fields` to an
       array of objects and then mapped over it: a register declaring `fields: "what"` alongside a
       seed threw a TypeError out of `normalise` itself. The declaration loop above refuses that
       document now; this reads it the safe way regardless, because a cast is not a check. */
    const fields = listOf(registers.get(seed.register), 'fields').map((f) => (isObject(f) ? String(f.id ?? '') : ''));
    if (!fields.includes('tags'))
      return no<Pack>(
        'FIELD_UNKNOWN',
        `${seed.register} has an example row and no tags field, so its examples could not be told from its real rows.`,
        { at: 'tags' },
      );
    /* AND A SEED IS LOOKED AT TOO. The declarations were checked and the seeds were not, so a
       `token:` in an example row went into the pack's own checksum — shared with the file — and
       landed as a live row. The guard is about what is in the pack, not about where in it. */
    const leaked = credential(seed.fields);
    if (leaked)
      return no<Pack>('SECRET_IN_PACK', `${seed.register}'s example row carries a ${leaked}, and a pack is a file people share.`, {
        at: leaked,
      });
    const shapedSeed = credentialValue(seed.fields);
    if (shapedSeed)
      return no<Pack>('SECRET_IN_PACK', `${seed.register}'s example row holds what looks like a credential in ${shapedSeed}, and a pack is a file people share.`, {
        at: `seeds.${seed.register}.${shapedSeed}`,
      });

    seeds.push({
      register: seed.register,
      fields: seed.fields,
      ...(typeof seed.note === 'string' ? { note: seed.note } : {}),
    });
  }

  /**
   * `provides` IS DERIVED, AND A WRITTEN-OUT ONE HAS TO AGREE WITH THE DERIVATION.
   *
   * IT WAS ASSIGNED OVER. `04 §5` line 92 is explicit: *"derived. It may be written out for a
   * reader, and if it is, it must equal the derived list, `PROVIDES_MISMATCH` otherwise"*, with the
   * sentence to say when it does not: *"provides lists register.fx; no declaration provides it"*.
   * This computed the derivation and overwrote whatever the manifest said, so a pack could claim to
   * provide something it does not and the claim was deleted rather than refused.
   *
   * WHAT THAT COSTS IS THE ONE THING `provides` IS FOR. `04 §5` states it one heading down:
   * *"`provides` is `kind.id`, and that is what makes conflict detectable"*. A person reads the
   * manifest to decide whether to install a pack, and the list they read is the list the code was
   * throwing away: the reader is told what will land, and the record installs whatever the file
   * happens to contain. The two are the same on an honest pack and differ on exactly the one that
   * matters.
   *
   * DERIVED IS STILL WHAT IS STORED, so the checksum and the conflict check are unchanged: the
   * written-out list is checked and then replaced by the list it had to equal.
   */
  const derived = declarations.map((d) => d.id).sort();
  /* `doc.provides` AND NOT `manifest.provides`. The manifest above is built with `provides: []`
     because the type requires the key, so asking it whether the AUTHOR wrote one is asking a
     question it always answers the same way. The document is the only thing that knows. */
  if (Array.isArray(doc.provides)) {
    const said = [...(doc.provides as unknown[])].map(String).sort();
    const missing = said.filter((id) => !derived.includes(id));
    const extra = derived.filter((id) => !said.includes(id));
    if (missing.length > 0 || extra.length > 0)
      return no<Pack>(
        'PROVIDES_MISMATCH',
        missing.length > 0
          ? `provides lists ${missing.join(', ')}; no declaration provides ${missing.length === 1 ? 'it' : 'them'}.`
          : `${extra.join(', ')} ${extra.length === 1 ? 'is' : 'are'} declared here and provides does not list ${extra.length === 1 ? 'it' : 'them'}.`,
        { at: 'provides', allowed: derived },
      );
  }
  manifest.provides = derived;
  /* `provides` IS OMITTED FROM THE HASH because it is derived from the declarations that are
     already in it — hashing both would let one pack have two checksums for one file. */
  const { provides: _provides, ...hashed } = manifest;
  const canonical = canonicalise({ manifest: hashed, declarations: declarations.map((d) => d.body), seeds });
  if (canonical === null) return malformed('This pack holds something the record cannot write down.');
  return ok({ manifest, declarations, seeds, canonical, checksum: await digest(canonical), source });
}

/**
 * The first colour in a declaration body, by key or by value, with the path to it; or `null`.
 *
 * A SEEN-SET, for `credential`'s reason: a caller in this process can hand `normalise` a body that
 * points at itself, and a stack overflow out of a function that returns a `Result` is the one thing
 * this package promises does not happen.
 */
function colour(body: Json, path = '', seen: WeakSet<object> = new WeakSet()): { at: string; value: string } | null {
  if (typeof body === 'string') {
    const said = body.trim();
    return HEX.test(said) || CSS_COLOUR.test(said) ? { at: path, value: said } : null;
  }
  if (typeof body !== 'object' || body === null) return null;
  if (seen.has(body)) return null;
  seen.add(body);
  if (Array.isArray(body)) {
    for (const [i, item] of body.entries()) {
      const found = colour(item, `${path}[${i}]`, seen);
      if (found) return found;
    }
    return null;
  }
  for (const [key, value] of Object.entries(body)) {
    const at = path === '' ? key : `${path}.${key}`;
    if (PAINTS.has(key.toLowerCase())) return { at, value: typeof value === 'string' ? value : JSON.stringify(value) };
    const found = colour(value, at, seen);
    if (found) return found;
  }
  return null;
}

/** `jcs`, and a body it cannot serialise is a malformed pack rather than a throw. */
function canonicalise(value: unknown): string | null {
  try {
    return jcs(value as Json);
  } catch {
    return null;
  }
}

/* ── the plan ────────────────────────────────────────────────────────────── */

/**
 * Who owns a declaration that no pack owns, said in a way a person reads.
 *
 * A CONFLICT NAMES THE OWNER, and the owner here is the record itself. `pack` is a string because
 * every other conflict names a pack id, and a `null` in it would be a second shape every reader of a
 * diff would have to know about to render one line.
 */
const OWN = '(this record)';

/** `1.2.3` against `>=1.0.0`, `^1.2.0`, `1.x` or an exact version. Absent or `*` is anything. */
export function satisfies(version: string | null, range: string): boolean {
  if (!version) return false;
  /* AND A RANGE THAT IS NOT TEXT IS NOT A RANGE. `range.trim()` threw for anything else, and this is
     reached from `plan`, which answers about a document a stranger wrote. `normalise` refuses that
     document at the door now; this is the second half of the same fact, for a `Pack` built by hand. */
  const want = String(range ?? '').trim();
  if (!want || want === '*' || want === 'x') return true;

  /* A SPACE-SEPARATED RANGE IS EVERY COMPARATOR, AND ALL OF THEM MUST HOLD. `>=1.0.0 <2.0.0` fell
     into the `>=` branch whole, and `parts()` read `1.0.0 <2.0.0` as `1.0.0` — so the upper bound
     vanished and 3.0.0 satisfied it. That is a dependency check admitting the major version the
     range exists to exclude. */
  /* THE SPACE INSIDE A COMPARATOR IS NOT A SEPARATOR. Splitting on every space turned `>= 1.0.0`
     into `>=` and `1.0.0` — so a range written with a space after the operator, which is legal and
     common, blocked every version that satisfies it. The lookbehind splits only where a version
     ends, which is the only place a second comparator can begin. */
  const spaced = want.split(/(?<=[\d.xX*])\s+/).filter(Boolean);
  if (spaced.length > 1) return spaced.every((piece) => satisfies(version, piece));
  /* AND A LONE COMPARATOR KEEPS ITS SPACE REMOVED, so `>= 1.0.0` reaches the `>=` branch as
     `>=1.0.0` rather than falling through to an exact compare against `1.0.0`. */
  const one = (spaced[0] ?? want).replace(/\s+/g, '');
  if (one !== want) return satisfies(version, one);

  const has = parts(version);
  const cmp = (a: string): number => order(has, parts(a));

  if (want.startsWith('>=')) return cmp(want.slice(2)) >= 0;
  if (want.startsWith('<=')) return cmp(want.slice(2)) <= 0;
  if (want.startsWith('>')) return cmp(want.slice(1)) > 0;
  if (want.startsWith('<')) return cmp(want.slice(1)) < 0;
  if (want.startsWith('^')) {
    /* CARET IS "COMPATIBLE", and below 1.0.0 that means the MINOR is the compatibility boundary:
       `^0.1.0` does not admit `0.9.0`, because nothing below one promises anything across minors. */
    const floor = parts(want.slice(1));
    if (cmp(want.slice(1)) < 0) return false;
    return floor[0] === 0 ? has[0] === 0 && has[1] === floor[1] : has[0] === floor[0];
  }
  if (want.startsWith('~')) {
    const floor = parts(want.slice(1));
    if (cmp(want.slice(1)) < 0) return false;
    return has[0] === floor[0] && has[1] === floor[1];
  }

  /* `x` IS A WILDCARD IN THE POSITION IT SITS IN, and every position before it must match. This
     compared the MAJOR only, so `1.2.x` meant `1.x` and admitted 1.9.0 — a range written to pin a
     minor, pinning nothing. */
  if (/^\d+(\.\d+)*(\.x)+$/.test(want) || want.endsWith('.x')) {
    const wanted = want.split('.');
    return wanted.every((piece, i) => piece === 'x' || Number(piece) === has[i]);
  }

  /* AND A RANGE THIS DOES NOT UNDERSTAND IS NOT A VERSION. Falling through to an exact compare read
     `~1.2.0` as the version `0.2.0` — refusing the right dependency and accepting the wrong one. */
  if (!/^\d/.test(want)) return false;
  return cmp(want) === 0;
}

/**
 * A version as its three numbers and its prerelease identifiers.
 *
 * THE CORE ENDS AT THE FIRST HYPHEN. `v.split('-')` destructured the second element, so `1.0.0-rc-1`
 * and `1.0.0-rc-2` both became the tag `rc` and compared EQUAL — two different prereleases the check
 * could not tell apart.
 *
 * AND THE IDENTIFIERS ARE COMPARED ONE AT A TIME, numerically where they are numbers. As a single
 * string, `alpha.10 < alpha.9` — so a `>=1.0.0-alpha.9` range refused `alpha.10`, which is the
 * later version. Semver says so in as many words; comparing the tags as strings does not.
 */
const parts = (v: string): [number, number, number, string[]] => {
  const at = v.indexOf('-');
  const core = at < 0 ? v : v.slice(0, at);
  const tag = at < 0 ? '' : v.slice(at + 1);
  const [a, b, c] = core.split('.');
  return [Number(a) || 0, Number(b) || 0, Number(c) || 0, tag === '' ? [] : tag.split('.')];
};

/** Which of two parsed versions is earlier. A prerelease sorts below its own release. */
function order(a: [number, number, number, string[]], b: [number, number, number, string[]]): number {
  const core = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (core !== 0) return core;

  /* NO PRERELEASE OUTRANKS ANY PRERELEASE, which is the rule stripping the tag used to break: it
     made `1.0.0-alpha` satisfy `>=1.0.0`, a check admitting the version somebody marked not ready. */
  if (a[3].length === 0 && b[3].length === 0) return 0;
  if (a[3].length === 0) return 1;
  if (b[3].length === 0) return -1;

  for (let i = 0; i < Math.max(a[3].length, b[3].length); i++) {
    const x = a[3][i];
    const y = b[3][i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    /* A NUMERIC IDENTIFIER IS BELOW AN ALPHANUMERIC ONE, and two numerics compare as numbers. */
    if (nx !== null && ny !== null) {
      if (nx !== ny) return nx - ny;
    } else if (nx !== null) return -1;
    else if (ny !== null) return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Which of two versions is later. Prerelease sorts below its own release. */
/* ONE ORDERING, AND IT IS `order` ABOVE. This held a second copy with the same two defects the
   first had — a core split on every hyphen, and prerelease tags compared as strings — so "which of
   two versions is later" and "does this version satisfy that range" could disagree about the same
   pair. */
const newer = (a: string, b: string): number => order(parts(a), parts(b));

/**
 * What installing this pack would do to this record.
 *
 * IT REFUSES NOTHING. A plan of a pack that cannot be installed is the most useful thing here: it
 * names the conflict, the missing dependency and the rows that would be orphaned in one screen,
 * instead of failing on the first and making somebody find the rest one round trip at a time.
 */
export async function plan(given: Pack, installed: Installed): Promise<Diff> {
  /* THE BODIES ARE COMPARED AS THEY WOULD BE STORED, with every setting filled in. The installed body
     is the filled one, so comparing it with the file's text would report a change on every plan of
     a pack that reads a setting, and would miss the one a changed setting really makes. */
  const config = settingsFor(given, installed);
  const pack = filledWith(given, config);
  const live = new Map(installed.declarations.map((d) => [d.id, d]));
  const mine = pack.manifest.pack;
  const was = installed.packs.find((p) => p.id === mine)?.version ?? null;

  const adds: Diff['adds'] = [];
  const changes: Diff['changes'] = [];
  const conflicts: Diff['conflicts'] = [];
  const retypes: Diff['retypes'] = [];
  const newlyRequired: Diff['newly_required'] = [];
  const added: PackDeclaration[] = [];
  for (const decl of pack.declarations) {
    const already = live.get(decl.id);
    if (!already) {
      adds.push({ id: decl.id, summary: summarise(decl) });
      added.push(decl);
      continue;
    }
    /* ANOTHER PACK'S DECLARATION IS NOT YOURS TO CHANGE. Two packs owning one register is two
       upgrades that undo each other, quietly, on whichever installs second. */
    /* AND NEITHER IS ONE SOMEBODY WROTE IN THE APP. The test was `already.pack_id && …`, which is
       falsy when `pack_id` is `null`, and `null` is exactly what `setDeclaration` writes. So a
       hand-written page fell through to `changes`: the plan said "1 change", the owner approved a
       diff with that one line in it, the install rewrote their page, and `uninstall` later DELETED
       it, because after the install the row is claimed by the pack. `record/src/index.ts` states
       both halves of what that breaks in as many words: "IT BELONGS TO NO PACK. `pack_id` is null,
       so a later `uninstall` of anything cannot take it, and a pack that claims the same id is a
       `PROVIDES_CONFLICT` rather than a silent overwrite." The comparison is against `mine` now, so
       the only declarations a pack may change are its own. */
    if (already.pack_id !== mine) {
      conflicts.push({ id: decl.id, pack: already.pack_id ?? OWN });
      continue;
    }
    if (already.body !== decl.canonical) {
      changes.push({ id: decl.id, from_version: already.version, summary: summarise(decl) });
      /* AND WHAT THE CHANGE DOES TO THE ROWS UNDER IT. This compared the two bodies for INEQUALITY
         and wrote down a summary; it never looked inside them, so an upgrade that moved a field's
         type or made one required was reported as "1 change" and installed. */
      const rows = decl.id.startsWith('register.') ? (installed.rows[decl.id.slice('register.'.length)] ?? 0) : 0;
      if (rows > 0) unreadable(decl, already.body, rows, retypes, newlyRequired);
    }
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

  /* A RETIRE AND AN ADD OF ONE BODY ARE ONE DECLARATION UNDER TWO IDS. Both lists were built in this
     function from one `Installed` and never compared, so a rename was planned as two unrelated moves;
     `install` says what that cost. A body that will not parse is not a finding, for `unreadable`'s
     reason. */
  const renames: Diff['renames'] = [];
  for (const decl of added) {
    const now = unnamed(decl.kind, decl.body);
    if (now === null) continue;
    for (const gone of installed.declarations) {
      if (gone.pack_id !== mine || keeping.has(gone.id) || gone.kind !== decl.kind) continue;
      if (renames.some((r) => r.from === gone.id)) continue;
      let was: unknown;
      try {
        was = JSON.parse(gone.body);
      } catch {
        continue;
      }
      if (unnamed(gone.kind, was) !== now) continue;
      renames.push({ from: gone.id, to: decl.id, rows: retires.find((r) => r.id === gone.id)?.rows ?? 0 });
      break;
    }
  }

  const unresolved = unresolvedOf(pack, installed, retires);

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
  const calls = callsOf(pack, installed);

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
    direction: was === null ? 'install' : was === pack.manifest.version ? 'reinstall' : newer(pack.manifest.version, was) > 0 ? 'upgrade' : 'downgrade',
    requires: { format, primitives, packs: needs },
    adds,
    changes,
    retires,
    conflicts,
    seeds: { count: seedsFor(pack, adds).length, registers: seedRows(seedsFor(pack, adds)) },
    spawns: spawnsOf(pack),
    calls_out: calls,
    approve: calls.flatMap((c) => (c.change === 'same' ? [] : c.key_line === null ? [c.line] : [c.line, c.key_line])),
    interrupts: interruptsOf(pack),
    touches: { rows_read: 0, rows_written: 0 },
    orphans,
    retypes,
    newly_required: newlyRequired,
    renames,
    warnings: warningsOf(pack),
    config,
    unresolved,
    base,
    /* THE INTEGER HALF CATCHES A RECORD THAT MOVED and the hash half catches a PACK that was edited
       between the plan and the install — which no version number can see, and which is exactly what
       happens when the thing being approved is a file in somebody's editor. */
    planHash: `${installed.record_version}.${await digest(
      jcs({ pack: pack.checksum, base, ...(config.length > 0 ? { config } : {}) } as unknown as Json),
    )}`,
  };
}

/**
 * The example rows this install writes: those for a list it adds.
 *
 * AN UPDATE DID NOT ASK WHETHER THE LIST WAS ALREADY THERE, so every newer version of a pack wrote its examples again
 * beside the ones the first install wrote, and a use case updated twice held three copies of each example. A list the
 * record already holds has had its examples, and a person may have deleted them on purpose.
 */
function seedsFor(pack: Pack, adds: readonly { id: string }[]): Seed[] {
  const added = new Set(adds.map((a) => a.id));
  return pack.seeds.filter((s) => added.has(`register.${s.register}`));
}

/* ── settings, and the lists a pack points at ────────────────────────────── */

/**
 * The value each of a pack's settings takes in this install: the one somebody chose, when the new
 * version still accepts it, or else this version's default.
 */
function settingsFor(pack: Pack, installed: Installed): Diff['config'] {
  const declared = pack.manifest.config ?? {};
  const chosen = installed.config?.[pack.manifest.pack] ?? {};
  return Object.entries(declared).map(([key, setting]) => {
    if (Object.hasOwn(chosen, key)) {
      const still = configValue(key, setting, chosen[key]);
      if (still.ok) return { key, type: setting.type, value: still.value, from: 'kept' as const };
    }
    if (setting.default !== undefined) return { key, type: setting.type, value: setting.default, from: 'default' as const };
    return { key, type: setting.type, value: null, from: 'none' as const };
  });
}

/** The pack with every `{{config:<key>}}` in its declarations filled from `config`. The same pack when there is nothing to fill. */
function filledWith(pack: Pack, config: Diff['config']): Pack {
  const values = Object.fromEntries(config.filter((c) => c.from !== 'none').map((c) => [c.key, c.value]));
  if (Object.keys(values).length === 0) return pack;
  const declarations = pack.declarations.map((d) => {
    if (configReads(d.body).length === 0) return d;
    const body = fillConfig(d.body, values) as Record<string, Json>;
    return { ...d, body, canonical: canonicalise(body) ?? d.canonical };
  });
  return { ...pack, declarations };
}

/**
 * The first-party pack that declares each list, so a refusal can name what to install.
 *
 * WRITTEN OUT HERE, because this package cannot import the seed that builds those packs. A test in
 * `test/pack.test.ts` reads the seed's own manifests and fails when this map drifts from them.
 */
export const FIRST_PARTY_LISTS: ReadonlyMap<string, string> = new Map([
  ['things', 'portfolio'],
  ['people', 'people'],
  ['accounts', 'money-core'],
  ['obligations', 'money-core'],
  ['services', 'estate'],
  ['tasks', 'work'],
  ['tracks', 'work'],
  ['updates', 'work'],
]);

/** The kernel's own lists, which migration 2 seats in every record and no pack declares. */
const KERNEL_LISTS = new Set(['session']);

/** Every list a declaration points at, with where: a field's `to:`, a page's `requires` and block sources, a metric's `source`. */
function pointsAt(decl: PackDeclaration): { register: string; at: string }[] {
  const out: { register: string; at: string }[] = [];
  const add = (value: unknown, at: string, prefixed: boolean) => {
    if (typeof value !== 'string') return;
    if (prefixed && !value.startsWith('register.')) return;
    const register = value.replace(/^register\./, '');
    if (register) out.push({ register, at });
  };
  const body = decl.body;
  if (decl.kind === 'register')
    for (const f of listOf(body, 'fields'))
      if (isObject(f) && (f.type === 'ref' || (f.type === 'list' && f.of === 'ref'))) add(f.to, `${decl.id}.fields.${String(f.id)}.to`, false);
  if (decl.kind === 'page') {
    for (const r of listOf(body, 'requires')) add(r, `${decl.id}.requires`, true);
    listOf(body, 'blocks').forEach((b, i) => {
      if (isObject(b)) add(b.source, `${decl.id}.blocks[${i}].source`, true);
    });
  }
  if (decl.kind === 'metric') add(body.source, `${decl.id}.source`, true);
  return out;
}

/**
 * The lists this pack points at that nothing will hold once it is installed.
 *
 * HELD MEANS AFTER THE INSTALL: every live list, less the ones this version drops, plus the ones it
 * declares. A list another pack declares but that is switched off is not held, because its
 * declaration is retired while it is off.
 */
function unresolvedOf(pack: Pack, installed: Installed, retires: Diff['retires']): Diff['unresolved'] {
  const dropped = new Set(retires.map((r) => r.id));
  const held = new Set(KERNEL_LISTS);
  for (const d of installed.declarations)
    if (d.kind === 'register' && !dropped.has(d.id)) held.add(d.id.slice('register.'.length));
  for (const d of pack.declarations) if (d.kind === 'register') held.add(d.id.slice('register.'.length));
  const out: Diff['unresolved'] = [];
  for (const d of pack.declarations)
    for (const lean of pointsAt(d)) {
      if (held.has(lean.register) || out.some((u) => u.register === lean.register)) continue;
      out.push({ ...lean, provider: FIRST_PARTY_LISTS.get(lean.register) ?? null });
    }
  return out;
}

const joined = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * `REGISTER_UNRESOLVED` for a plan whose pack points at a list nothing holds, or `null`.
 *
 * ONE SENTENCE THAT NAMES THE LIST AND THE REPAIR. When every missing list is one a first-party pack
 * declares, the repair names those packs; otherwise it is to install whatever declares the list, or
 * to declare it in this pack.
 */
export function unresolvedFault(diff: Pick<Diff, 'pack' | 'unresolved'>): Refusal | null {
  const first = diff.unresolved[0];
  if (!first) return null;
  const id = diff.pack.id;
  const lists = diff.unresolved.map((u) => u.register);
  const others = lists.slice(1);
  const providers = [...new Set(diff.unresolved.map((u) => u.provider))];
  const named = providers.filter((p): p is string => p !== null && p !== id);
  const repair =
    named.length > 0 && named.length === providers.length
      ? `Install ${joined(named)} first: ${named.length === 1 ? 'it declares' : 'they declare'} ${joined(lists)}.`
      : `Install the pack that declares ${joined(lists)} first, or declare ${lists.length === 1 ? 'it' : 'them'} in ${id}.`;
  return {
    code: 'REGISTER_UNRESOLVED',
    fix: `${id} points at the ${first.register} list (${first.at}), which this record does not hold and ${id} does not declare.${
      others.length > 0 ? ` It also points at ${joined(others)}.` : ''
    } ${repair}`,
    at: first.at,
    allowed: lists,
  };
}

/**
 * The two ways an upgrade leaves the rows already in a register in the wrong.
 *
 * A REINSTALL CORRUPTED A POPULATED REGISTER IN SILENCE, and both halves were driven against a
 * record holding one row:
 *
 *     before ->                       [{"what":"Invoice 41","amount":"four hundred and eighty"}]
 *     reinstall amount text -> money  ACCEPTED
 *     after ->                        [{"what":"Invoice 41","amount":"four hundred and eighty"}]
 *     money predicate over it ->      rows=0
 *
 *     add required vat ->             ACCEPTED
 *     later create without vat ->     REQUIRED_MISSING: obligations needs vat.
 *     rows now ->                     [{"what":"A"}]
 *
 * Nothing refused, nothing migrated, nothing logged. The register declares `amount` a `money` and
 * holds a string; `{ gt: { amount: 1, currency: 'GBP' } }` returns nothing over a register that has
 * a row. And `vat` is required forwards and violated backwards for ever, with no count of how many
 * rows are in the wrong. `02 §7` and `04 §5` both refuse the first outright — *"does not exist in
 * v1: retire the field and add a new one"* — and `42 §5.3·9` and `·31` give the two rules their
 * inputs: a persisting field id whose `type` (or `of`) differs, and a `required: true` with no
 * `default` where the installed body had neither, both with `installed.rows[register] > 0`.
 *
 * A BODY THAT WILL NOT PARSE IS NOT A FINDING. `already.body` is canonical JSON this record wrote,
 * and a caller who hands `plan` something else must get the plan they always got rather than a
 * throw out of a function whose whole contract is that it answers.
 */
function unreadable(
  decl: PackDeclaration,
  was: string,
  rows: number,
  retypes: Diff['retypes'],
  newlyRequired: Diff['newly_required'],
): void {
  if (decl.kind !== 'register') return;
  let old: unknown;
  try {
    old = JSON.parse(was);
  } catch {
    return;
  }
  const fieldsOf = (body: unknown): Map<string, Record<string, unknown>> => {
    const list = (body as { fields?: unknown })?.fields;
    const out = new Map<string, Record<string, unknown>>();
    if (!Array.isArray(list)) return out;
    for (const raw of list) {
      const f = raw as { id?: unknown };
      if (isObject(raw as Json) && typeof f.id === 'string') out.set(f.id, f as Record<string, unknown>);
    }
    return out;
  };

  const before = fieldsOf(old);
  for (const [id, now] of fieldsOf(decl.body)) {
    const then = before.get(id);

    /* THE ELEMENT TYPE COUNTS AS THE TYPE. `42 §5.3·31` says *"a different `type` (or `of.type`)"*,
       and a `list<text>` that becomes a `list<int>` reads every row it holds as the wrong thing
       exactly as `text → money` does. */
    const said = (f: Record<string, unknown> | undefined): string =>
      f === undefined ? '' : `${String(f.type ?? '')}${f.of === undefined ? '' : `<${JSON.stringify(f.of)}>`}`;
    if (then !== undefined && said(then) !== said(now)) retypes.push({ id: decl.id, field: id, from: said(then), to: said(now), rows });

    /* A `default` IS THE ANSWER FOR THE ROWS THAT HAVE NONE, which is why `04 §5`'s sentence names
       it as the repair: *"Ship a default or a fill rule."* */
    const demanded = now.required === true && now.default === undefined;
    if (demanded && then?.required !== true) newlyRequired.push({ id: decl.id, field: id, rows });
  }
}

/**
 * A body with the key that carries its id taken out, as the text two bodies are compared by.
 *
 * `42 §5.3·10` says *"minus its kind key"*, and a register's is the one that moves: `normalise`
 * stores `register: obligations` as `id: obligations`, so a register's id key is `id` and every
 * other kind's is its own word.
 */
function unnamed(kind: DeclKind, body: unknown): string | null {
  if (!isObject(body as Json)) return null;
  const { [kind === 'register' ? 'id' : kind]: _named, ...rest } = body as Record<string, Json>;
  return canonicalise(rest);
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
      const body = d.body as { rule?: string; when?: unknown };
      /* `then` AND EVERY ACTION IN IT ARE A STRANGER'S TEXT. This read `(body.then ?? []).filter(…)`
         and then `a.create!.register`: a `then` written as a string or a mapping threw out of
         `.filter`, and `then: [{ create: null }]` threw on the `!`, both out of `plan`. An action
         with no legible `create` spawns nothing, so it is listed as nothing, and the install refuses
         the declaration on the kernel's own terms. */
      return listOf(d.body, 'then')
        .flatMap((a) => (isObject(a) && isObject(a.create) ? [a.create] : []))
        .map((create) => ({
          rule: String(body.rule ?? d.id),
          register: String(create.register ?? ''),
          bound: Number(create.bound) || 0,
          when: typeof body.when === 'string' ? body.when : jcs((body.when ?? null) as Json),
        }));
    });

/**
 * The host an address names, as the diff prints it: `new URL`'s host, or the authority as written when the
 * address will not parse, so a declaration the kernel is about to refuse still says where it pointed.
 */
const hostOf = (address: unknown): string | null => {
  if (typeof address !== 'string' || address === '') return null;
  try {
    return new URL(address).host;
  } catch {
    return address.replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0] || null;
  }
};

const callsOf = (pack: Pack, installed: Installed): Diff['calls_out'] =>
  pack.declarations.flatMap((d) => {
    const e = egressOf(d);
    if (e === null) return [];
    const body = d.body as { ingest?: string; url?: unknown; fetch?: { base?: unknown } };
    /* EVERY HOST, STATICALLY. A `call` and a `poll` say `url:`, and a `pull` says `url:` or `fetch.base`. */
    const host = e.host ?? (isObject(body.fetch) ? hostOf(body.fetch.base) : null);
    const line = host === e.host ? e.line : e.line.replace('CALLS OUT no host declared', `CALLS OUT ${host}`);
    /* WHAT THE OWNER HAS ALREADY APPROVED IS WHAT IS INSTALLED. A new action, or a new host, key or field on one, is
       what this install asks for. */
    const was = installed.declarations.find((i) => i.id === d.id);
    let before: Egress | null = null;
    if (was !== undefined)
      try {
        before = egressOf({ kind: was.kind, body: JSON.parse(was.body) as unknown });
      } catch {
        before = null;
      }
    const change: 'new' | 'changed' | 'same' =
      was === undefined || before === null
        ? 'new'
        : before.host !== e.host || before.key !== e.key || before.sends.join('\n') !== e.sends.join('\n')
          ? 'changed'
          : 'same';
    return [
      {
        ingest: e.ingest || String(body.ingest ?? d.id),
        channel: e.channel,
        method: e.method,
        host,
        every: e.every ?? '',
        trigger: e.trigger,
        per_day: e.per_day,
        grant: e.key,
        sends: e.sends,
        project: e.project,
        line,
        key_line: e.key_line,
        change,
      },
    ];
  });

const interruptsOf = (pack: Pack): string[] =>
  pack.declarations
    /* THROUGH `listOf` FOR THE REASON `spawnsOf` GIVES: `.some` on a `then` that is a string threw
       out of the preview, and the optional chaining only ever guarded the action, not the list. */
    .filter(
      (d) =>
        d.kind === 'rule' &&
        listOf(d.body, 'then').some((a) => isObject(a) && isObject(a.notify) && a.notify.urgent === true),
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
  /* THE FIELD IDS WERE READ INTO A VARIABLE NOTHING READS. `const fields = ((body as …).fields ?? [])
     .map((f) => f.id)` stood in this loop assigned and never spent, so the only thing that line
     could do was throw: a `fields` written as a string or holding a null crashed `plan()` from a
     statement whose value was discarded on the next line. What the loop is about is which registers
     arrive with nothing in them. */
  const registers = pack.declarations.filter((d) => d.kind === 'register').map((d) => String(d.body.id ?? ''));
  const seeded = new Set(pack.seeds.map((s) => s.register));

  for (const id of registers)
    if (!seeded.has(id)) out.push({ at: `register.${id}`, say: `${id} arrives empty, so nothing on a page that reads it will draw.` });
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
export async function install(pack: Pack, diff: Diff, host: Host, planHash: string, approve: readonly string[] = []): Promise<Result<Applied>> {
  if (planHash !== diff.planHash)
    return no<Applied>(
      'PLAN_STALE',
      'This record has moved, or the pack has, since the plan you approved. Read the plan again.',
      { at: 'planHash' },
    );

  if (diff.conflicts.length) {
    const first = diff.conflicts[0]!;
    /* AND THE REMEDY IS NOT THE SAME FOR THE TWO OWNERS. A declaration another pack owns is freed by
       uninstalling that pack; one somebody wrote in the app is freed by retiring it, and telling
       them to uninstall a pack that does not exist would send them looking for it. */
    return no<Applied>(
      'PROVIDES_CONFLICT',
      first.pack === OWN
        ? `${first.id} was written in this record, and installing ${diff.pack.id} would take it over. Retire it first if you want the pack to own it.`
        : `${first.id} belongs to ${first.pack}, and two packs cannot own one declaration.`,
      { at: first.id },
    );
  }

  /**
   * EACH HAS ITS OWN CODE, and both said `OUT_OF_BOUNDS`.
   *
   * `04 §5` gives them separate rows with separate repairs, and the difference is not cosmetic:
   * `FORMAT_OUT_OF_RANGE` is *"requires format 2; this record is format 1. Update BrainDog"*, and
   * `PRIMITIVES_OUT_OF_RANGE` is *"requires primitives 2; this record renders primitives 1. Update
   * BrainDog, or ask the author for a primitives-1 build"*. The second repair has a second half,
   * because a pack author can ship a primitives-1 build and cannot ship a format-1 one.
   *
   * `OUT_OF_BOUNDS` IS THE CODE FOR A NUMBER OUTSIDE ITS RANGE, which is true of both and is what
   * makes it the wrong answer: an agent branching on it learns that something was too big. `30 §6`
   * publishes two codes for this and both were emitted by nothing, which is how it was found.
   *
   * A MISSING PACK KEEPS `OUT_OF_BOUNDS` below, because `04 §5` gives that case no code of its own.
   */
  /* WRITTEN OUT RATHER THAN LOOPED, so the code sits where `refusals.mjs` reads one: a literal
     handed to the constructor. In a tuple it is a string in an array and the gate that counts what
     the product emits sees nothing, which is how both of these came to be published in `30 §6` and
     emitted by nothing. Two calls, four lines, and the sentences can differ. */
  if (!diff.requires.format.ok)
    return no<Applied>(
      'FORMAT_OUT_OF_RANGE',
      `${diff.pack.id} needs format ${diff.requires.format.wanted} and this record is at ${diff.requires.format.has}. Update BrainDog.`,
      { at: 'requires.format' },
    );

  if (!diff.requires.primitives.ok)
    return no<Applied>(
      'PRIMITIVES_OUT_OF_RANGE',
      `${diff.pack.id} needs primitives ${diff.requires.primitives.wanted} and this record renders ${diff.requires.primitives.has}. Update BrainDog, or ask the author for a build against the primitives this record renders.`,
      { at: 'requires.primitives' },
    );

  const missing = diff.requires.packs.find((p) => !p.ok);
  if (missing)
    return no<Applied>(
      'OUT_OF_BOUNDS',
      `${diff.pack.id} needs ${missing.id} ${missing.range}, and this record has ${missing.installed ?? 'none'}.`,
      { at: `requires.packs.${missing.id}` },
    );

  /* A LIST NOTHING HOLDS IS REFUSED BEFORE ANYTHING IS STAGED. A field pointing at it would be a ref
     no row can satisfy, and a page requiring it would draw an empty table under a heading that
     promises one. */
  const unheld = unresolvedFault(diff);
  if (unheld) return { ok: false, refusal: unheld };

  /**
   * A RENAME IS REFUSED BEFORE THE ORPHAN IT ALSO IS, because it is the truer sentence.
   *
   * `plan` built its adds and its retires in one function and never compared them, so a pack that
   * renamed something was planned as one add and one retire. Driven end to end through the record's
   * `planPack` and `installPack`:
   *
   *     register.obligations -> register.bills, 0 rows   ACCEPTED; list obligations -> REGISTER_UNKNOWN
   *     register.obligations -> register.bills, 2 rows   WOULD_ORPHAN "... there are 2 rows in it. Move them first."
   *     page.money -> page.finance, same body            ACCEPTED
   *
   * The first dropped the id every page, rule and note pointing at it was written against, and said
   * nothing. The second told an author who had renamed a register to go and move its rows, when the
   * rows were fine and the new id was the mistake. `04 §5` and `02 §2` both say it the other way
   * round: ids are stable for ever and there is no alias key, so the repair is to keep the old id and
   * change the name, which is a label and moves nothing.
   */
  const renamed = diff.renames[0];
  if (renamed)
    return no<Applied>(
      'ID_RENAMED',
      `${renamed.from} → ${renamed.to} renames ${
        renamed.rows > 0
          ? `a spoken id, so ${renamed.from.slice(renamed.from.indexOf('.') + 1)}#<n> in a note would stop resolving`
          : `an id, so anything written against ${renamed.from} would stop resolving`
      }. Ids are stable for ever: keep ${renamed.from} and change its name instead.`,
      { at: renamed.to },
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

  /* AND NEITHER IS A ROW LEFT UNREADABLE UNDER A REGISTER THAT KEEPS ITS NAME. `WOULD_ORPHAN`
     above covers the register that goes away; these two cover the one that stays and stops
     describing what is in it. `02 §7`: a type change *"does not exist in v1"*, and the repair is
     the author's — retire the field, add another — not a migration this record can guess.

     TWO CALLS AND NOT A LOOP, so each code sits as a literal after its own constructor: `42 §9`
     greps for exactly that, and a code chosen into one call is a code the gate that counts what
     this product emits cannot see. */
  const retyped = diff.retypes[0];
  if (retyped)
    return no<Applied>(
      'FIELD_TYPE_CHANGED',
      `${retyped.id}.${retyped.field}: ${retyped.from} → ${retyped.to} changes a type, and ${retyped.rows} rows were written under the old one. Retire the field and add a new one.`,
      { at: `${retyped.id}.fields.${retyped.field}.type` },
    );

  const demanded = diff.newly_required[0];
  if (demanded)
    return no<Applied>(
      'REQUIRED_ON_POPULATED',
      `${demanded.id}.${demanded.field} is required and ${demanded.rows} rows were written before it. Ship a default or a fill rule.`,
      { at: `${demanded.id}.fields.${demanded.field}.required` },
    );

  /* WHAT IT CALLS OUT IS APPROVED IN THE SAME PRESS, OR NOTHING IS ARMED (`loop/research-scheduled-actions.md` §5).
     A new action, or a new host, key or field on one, installs only beside the exact lines the plan printed for it.
     An action that is the same as the installed one was approved already and asks for nothing. Nothing is written
     before this, so a missing or different approval leaves the record as it was, the rest of the pack included. */
  if (diff.approve.length > 0 && approve.length === 0)
    return no<Applied>(
      'REQUIRED_MISSING',
      `${diff.pack.id} calls other services. Approve the ${diff.approve.length === 1 ? 'line' : `${diff.approve.length} lines`} its plan calls out, then install.`,
      { at: 'approve' },
    );
  if (approve.length !== diff.approve.length || approve.some((line, i) => line !== diff.approve[i]))
    return no<Applied>(
      'PLAN_STALE',
      'What you approved is not what this install would call out. Read the plan again.',
      { at: 'approve' },
    );
  if (host.keyHeld)
    for (const c of diff.calls_out) {
      if (c.change === 'same' || c.grant === null || host.keyHeld(c.grant)) continue;
      return no<Applied>('REQUIRED_MISSING', `Add the key called "${c.grant}" to the vault, then install.`, { at: 'approve' });
    }

  /* THE SETTINGS ARE WRITTEN IN HERE, from the plan that was approved, so the bodies staged are the
     bodies the plan compared. A text setting is a value a person chose after `normalise` looked, so
     the colour rule is asked again of every body a setting filled. */
  const filled = filledWith(pack, diff.config);
  for (const d of filled.declarations) {
    if (d.kind === 'theme' || d === pack.declarations.find((o) => o.id === d.id)) continue;
    const painted = colour(d.body);
    if (painted)
      return no<Applied>(
        'COLOUR_OUTSIDE_THEME',
        `${d.id} sets ${painted.at} to ${painted.value} from a setting. A ${d.kind} names an intent (good, warn, bad or info), and the theme names the colour.`,
        { at: `${d.id}.${painted.at}` },
      );
  }
  const staged = await host.stage(
    filled.declarations.map((d) => ({ id: d.id, kind: d.kind, body: d.body, pack: pack.manifest.pack })),
  );
  if (!staged.ok) return staged;

  /* ONE TRANSACTION, AND A REFUSAL ROLLS IT BACK. Declarations, retires, seeds and the pack row
     land together or not at all. Four separate commits meant a seed the register refused left the
     record at the new shape with the ledger still saying the old version — and the next plan of the
     identical document then reported an upgrade with an empty diff, which is the most confident
     wrong answer this module can give. */
  const { provides: _provides, ...manifest } = pack.manifest;
  const kept = diff.config.filter((c) => c.from === 'kept').map((c) => [c.key, c.value] as const);
  try {
    return host.transaction((): Result<Applied> => {
      const put = staged.value();
      if (!put.ok) throw new Rolled(put);
      /* THE CACHE IS REBUILT BEFORE THE SEEDS, and inside the transaction: a seed is a write like
         any other, and the write path refuses a register it has not been told about yet. */
      host.reload();

      if (diff.retires.length) {
        const gone = host.retire(diff.retires.map((r) => r.id));
        if (!gone.ok) throw new Rolled(gone);
      }

      /* THE SEEDS GO THROUGH THE WRITE PATH, so a seed the register would refuse is refused here
         rather than becoming a row nothing else in the product could have made. */
      for (const seed of seedsFor(pack, diff.adds)) {
        const made = host.seed(seed.register, seed.fields, seed.note);
        if (!made.ok) throw new Rolled(made);
      }

      host.remember({
        id: pack.manifest.pack,
        version: pack.manifest.version,
        source: pack.source.kind,
        ref: pack.source.ref ?? null,
        /* THE CHOSEN SETTINGS TRAVEL WITH THE PACK ROW, and only the ones this version still accepts. */
        manifest: jcs({ ...manifest, ...(kept.length > 0 ? { config_values: Object.fromEntries(kept) } : {}) } as unknown as Json),
        checksum: pack.checksum,
        ...(diff.approve.length > 0 ? { approved: diff.approve } : {}),
      });

      return ok({
        pack: pack.manifest.pack,
        version: pack.manifest.version,
        declarations: pack.declarations.length,
        seeds: seedsFor(pack, diff.adds).length,
        retired: diff.retires.length,
      });
    });
  } catch (e) {
    if (e instanceof Rolled) return e.answer;
    throw e;
  } finally {
    /* THE CACHE IS REBUILT EITHER WAY. On success it holds what landed; on a rollback it has to
       forget what it saw during the attempt, or the write path answers about registers that were
       undone. */
    host.reload();
  }
}

/**
 * Thrown so the caller's transaction rolls back, and turned back into the answer outside it.
 *
 * IT CARRIES THE WHOLE ANSWER, not the refusal inside it. Unwrapping to a `Refusal` and rebuilding
 * the envelope on the way out silently drops any arm the rebuild does not know about, and there are
 * three; an install that ever meets a conflict would have come back as a refusal with `undefined`
 * where its sentence goes.
 */
class Rolled extends Error {
  /* A FIELD AND NOT A PARAMETER PROPERTY: `erasableSyntaxOnly` is on, and this file is stripped
     rather than compiled. */
  answer: { ok: false; refusal: Refusal } | { ok: false; conflict: Conflict };
  constructor(answer: { ok: false; refusal: Refusal } | { ok: false; conflict: Conflict }) {
    super(refused(answer) ? answer.refusal.code : 'VERSION_STALE');
    this.answer = answer;
  }
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

  /* ONE TRANSACTION, LIKE `install`. `retire` and `forget` each opened their own, and nothing
     wrapped the pair — so a failure between them left the declarations retired and the `pack` row
     alive: `listPacks` still showed a pack whose registers were gone, and retrying was impossible
     because `claimed` filters on `retired = 0`, so the second attempt answered "not installed". An
     uninstall that can leave the record in a state no command can reach is not an uninstall. */
  try {
    return host.transaction((): Result<Retired> => {
      const gone = host.retire(claimed);
      if (!gone.ok) throw new Rolled(gone);
      host.forget(id);
      return ok({ pack: id, declarations: claimed.length, rows_kept: kept });
    });
  } catch (e) {
    /* THE ROLLBACK HAPPENED; THE ANSWER COMES BACK WHOLE. `Rolled` carries the envelope rather than
       the refusal inside it, for the reason its own note gives: rebuilding one by hand drops
       whichever arm the rebuild does not know about, and there are three. */
    if (e instanceof Rolled) return e.answer as Result<Retired>;
    throw e;
  } finally {
    host.reload();
  }
}
