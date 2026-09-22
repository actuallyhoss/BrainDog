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
import { credentialKey as credential, credentialValue, NESTED_MOST, nestedPast } from './credentials.ts';
import { FIRST_PARTY_LISTS } from './usecase.ts';
import { KINDS, approvalLines, configReads, configValue, digest, egressChanged, egressOf as egressOfBody, fillConfig, jcs, readConfig, widens, type ConfigDecl, type DeclKind, type Egress, type Json } from '@braindog/kernel';

/**
 * What one declaration sends out of the record, or `null` when it sends nothing: every host, how often, the key by label
 * and the fields. The same reading the record stores on a proposal, so a plan and a proposal print the same lines.
 */
export const egressOf = (decl: { kind: string; body: unknown }, nameOf?: (project: string) => string | null): Egress | null =>
  decl.kind === 'ingest' || decl.kind === 'script' ? egressOfBody(decl.body, nameOf) : null;
export type { Egress };

/* A use case: a pack with a front, its modules, signals and voice (`loop/research-spark.md` §2.1). */
export { SHARED_MOST_BYTES, SHARED_SUFFIX, exampleFields, exportUseCase, kindUnknownSentence, laterVersion, nextVersion, readShared, sharedFileName, unfilled, type ExportParts, type Shared, type VersionStep } from './shared.ts';
export { looksLikeCredential } from './credentials.ts';
export { AUDIENCES, FIRST_PARTY_LISTS, LABEL_KEY, MODULES, MODULE_LISTS, SHARED_VERSION, SPEAKS, VOICE_KEYS, labelKeyOf, labelSetting, labelsOf, speakingPack, voiceWhenAdding, voiceWrites, normaliseUseCase, packIdOf, useCasePack, voiceOf, voiceSetting, type Audience, type ExampleLink, type ModuleId, type SpeakingState, type UseCase, type VoiceKey } from './usecase.ts';

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
  /**
   * The declarations this version stops declaring and gives to another pack, by id: `{ 'register.holdings': 'holdings' }`.
   * Absent when it hands nothing.
   *
   * WITHOUT IT A LIST WITH ROWS COULD NEVER LEAVE A PACK (`loop/research-shell-seed-next.md` N1). The owner's update
   * dropping it was `WOULD_ORPHAN`, and the pack declaring it was `PROVIDES_CONFLICT` for as long as the owner held it,
   * so both orders were refused and "move them first" had nowhere to move them to.
   *
   * `hands` AND NOT `moves`, `to` OR A KEY ON THE RECEIVING PACK. Only the pack that owns a declaration can let it go,
   * so the word belongs in the old pack's file and reads there as the sentence it is: money-core hands holdings to
   * holdings. A receiving pack that could claim a declaration would be any stranger's file claiming anybody's list, and
   * `moves` reads as though the rows move, when they are the one thing that stays exactly where it was.
   */
  hands?: Record<string, string>;
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
  /**
   * The live declarations somebody changed in the app that a pack wrote first, by id: `was` is that pack and `body` its
   * last version, the one the edit started from (the kernel's `detached()`).
   *
   * OPTIONAL, as `config` is, so every caller that builds an `Installed` keeps compiling. Without it every live row with
   * `pack_id` null is somebody's own, which is what `plan` believed before it could ask.
   */
  detached?: Record<string, { was: string; body: string }>;
  /**
   * The title of the row an id names, so an action's key line says the project by name and not by a row id.
   * OPTIONAL: without it the id is said as the declaration wrote it.
   */
  nameOf?: (ref: string) => string | null;
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
  /**
   * `handed` IS A DECLARATION ANOTHER PACK HANDED THIS ONE, which is live already, under this pack's name, while this
   * pack is not installed. It is new to the pack and not to the record, so it plants no example rows, and its rows and
   * their history stay as they are.
   */
  adds: { id: string; summary: string; handed?: true }[];
  changes: { id: string; from_version: number; summary: string }[];
  /**
   * What this version stops declaring. `to` IS THE PACK IT HANDS THE DECLARATION TO (the manifest's `hands`): it is not
   * retired and orphans nothing, it is staged again under `to` with `body`, the live body as JCS text with `pack` set to
   * `to`, and it stays live until and after that pack is installed.
   */
  retires: { id: string; rows: number; to?: string; body?: string }[];
  /**
   * Declarations the record will hold and this plan will not stage, each named once for `conflictFault`.
   *
   * `reads` IS A DECLARATION THE OWNER CHANGED THAT READS ONE THIS PLAN RETIRES, and `changed` is a list the owner changed
   * that this version changes too. Both are the owner's own rows, so `pack` is `(this record)`, and both would install
   * without a word if they were not here: the probes measured a page drawing a tile for a retired figure, and a metric
   * summing a field its list did not have.
   *
   * `field` IS ONE FIELD OF THE LIST `reads` NAMES that this version takes off, or gives another type when `retyped` is
   * there, and the owner's declaration reads it. The list itself stays, so `reads` alone would say it was gone. The two
   * types travel in `retyped` because `conflictFault` sees only the conflicts, and its sentence names both.
   *
   * `relabelled` IS A LABEL THE UPDATE CHANGES on a field the owner's `where` names by that label, and `value` an enum
   * value the update takes out of a field the owner's declaration asks for or writes. Both leave the field on the list,
   * and both fail at read time all the same, because `parseWhere` matches a label and a value when the sentence is read.
   *
   * `by` IS THE MIRROR: `id` is a list the owner changed and kept, and `by` is a declaration this version stages that
   * reads `field` as the pack's list has it and the owner's does not (taken off, `retyped`, `relabelled`, or without
   * `value`). The audit of batch twenty measured it on `fx.source`: a plan with no conflicts, then `FIELD_UNKNOWN`.
   *
   * `changed` WITH `field` AND NOTHING ELSE is a list the owner added `field` to, and this version brings a field of its
   * own under the same id. Two fields cannot share an id, and the rows already written under the owner's would be read
   * as the pack's, so it stays refused where every other addition is rebased.
   */
  conflicts: {
    id: string;
    pack: string;
    reads?: string;
    field?: string;
    retyped?: { from: string; to: string };
    relabelled?: { from: string; to: string };
    value?: string;
    by?: string;
    changed?: true;
  }[];
  /**
   * The pack's own declarations somebody changed in the app, which this install leaves as they are and does not stage.
   *
   * NAMED AND NOT HIDDEN, because the update does not rewrite what the owner wrote, and an edit that carried the old
   * version's window keeps it: on the probe, `spent-30d` stayed at `-31d` while `received-30d` moved to `-30d`.
   *
   * `rebased` IS A LIST THE OWNER ONLY ADDED TO, which this version changes all the same: the update's body with the
   * owner's fields and enum values laid over it, as JCS text, and `adds` names what was laid over (`domains`, or
   * `lane.sold` for a value). `install` stages the update's body as the pack's and this one after it as the owner's, so
   * the owner's row stays detached from the pack's newest body and the next update is asked the same question.
   */
  kept: { id: string; adds?: string[]; rebased?: string }[];
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
    /** Whether it pages, which decides which of the record's two data keys has to open its credential (`12 §6`). */
    paged: boolean;
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

/** `handed` is how many declarations this install gave to another pack, and is absent when it gave none. */
export type Applied = { pack: string; version: string; declarations: number; seeds: number; retired: number; handed?: number };
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
  /**
   * Retire declarations. `by` is who, when the caller knows better than the host's own bound caller; a host writes the
   * `declare` line under it, or under its bound caller when it is left out (`loop/research-batch-thirty-two-audit.md` §8).
   */
  retire: (ids: readonly string[], by?: { actor: string; suggestion?: string }) => Result<unknown>;
  seed: (register: string, fields: Record<string, Json>, note: string | undefined) => Result<unknown>;
  /**
   * The `pack` row, and the ids it claims — read on uninstall. `approved` is the calls-out lines the owner approved
   * with this install, word for word, when it asked for any.
   */
  remember: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string; approved?: readonly string[] }) => void;
  forget: (id: string) => void;
  claimed: (pack: string) => string[];
  /**
   * Whether this key is one the install can actually be approved on: `null` when the vault holds it AND a scheduled
   * run could open it, otherwise the sentence to show. OPTIONAL: a host without a vault checks nothing.
   *
   * TWO FAILURES, ONE ANSWER. A key that is missing and a key sealed for a person rather than a connector end the
   * same way — an install approved and an action that never runs — and the record is the only party that knows
   * either, so it says which and what to do about it.
   */
  keyReady?: (name: string, paged: boolean) => { code: 'REQUIRED_MISSING' | 'OUT_OF_BOUNDS'; fix: string } | null;
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
  /* BEFORE ANY WALK, because the walks recurse and a document a hundred thousand levels deep threw out of them. */
  if (nestedPast(doc)) return malformed(`This pack nests deeper than ${NESTED_MOST} levels, and no declaration does.`);

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

  /* WHAT IT HANDS IS READ ONCE WHAT IT DECLARES IS KNOWN, because a pack that still declares an id cannot also give it
     away: the plan would stage it under two owners in one batch. Kept in the manifest and so in the checksum, since two
     files that hand differently install differently. */
  if (doc.hands !== undefined) {
    if (!isObject(doc.hands))
      return malformed('`hands` maps a declaration id to the pack that takes it over, like register.holdings: holdings.', 'hands');
    const hands: Record<string, string> = {};
    for (const [handed, to] of Object.entries(doc.hands)) {
      const at = `hands.${handed}`;
      const dot = handed.indexOf('.');
      const kind = KINDS.find((k) => k === handed.slice(0, dot));
      if (dot < 0 || !kind || !(kind === 'register' ? REGISTER_NAME : NAME).test(handed.slice(dot + 1)))
        return malformed(`${handed} is not a declaration id: its kind, a full stop and its name, like register.holdings.`, at);
      if (typeof to !== 'string' || !PACK_ID.test(to))
        return malformed(`${id} hands ${handed} to ${String(to)}, which is not a pack id.`, at);
      if (to === id) return malformed(`${id} hands ${handed} to itself.`, at);
      if (seen.has(handed))
        return malformed(`${id} declares ${handed} and hands it to ${to}. A pack hands over only what it has stopped declaring.`, at);
      hands[handed] = to;
    }
    if (Object.keys(hands).length > 0) manifest.hands = hands;
  }

  /**
   * EVERY PLACEHOLDER NAMES A SETTING THIS PACK DECLARES, AND THAT SETTING HAS A DEFAULT. The first
   * install of a pack has no chosen values yet, so a placeholder with no default would reach the
   * kernel unfilled. A money value is an object, so it fills a whole value and never a piece of text.
   *
   * WRITTEN AS ONE FUNCTION BECAUSE A SEED IS READ BY IT TOO, and it was not. The loop below ran over
   * the declarations alone, so an example row saying `{{config:nobody_declares_this}}` passed
   * `normalise`, passed `plan` and was planted as a live row whose text read
   * `Due {{config:nobody_declares_this}} and {{config:fee}}` — measured on a record here, with both
   * braces in the stored field. The identical string in a declaration is refused at the door, by this
   * check and again by the kernel's `validate`; a seed goes through the write path, which has no
   * opinion about braces in a piece of text, so nothing anywhere caught it.
   */
  const placeholderFault = (subject: string, body: unknown, pathTo: (at: string) => string, asText = false): Result<Pack> | null => {
    for (const read of configReads(body)) {
      const where = pathTo(read.at);
      /* A NOTE IS A LINE OF TEXT AND HAS NO VALUE TO FILL, so `whole` buys a money setting nothing
         there. Driven before this line existed: `note: '{{config:fee}}'` was accepted, `filledWith`
         called `String()` on the `{ amount, currency }` it filled with, and the planted row carried
         the note `[object Object]`. */
      const fillsWholeValue = read.whole && !asText;
      const setting = Object.hasOwn(settings.value, read.key) ? settings.value[read.key] : undefined;
      if (setting === undefined)
        return no<Pack>('FIELD_UNKNOWN', `${subject} reads the setting ${read.key}, and ${id} declares no setting by that name.`, {
          at: where,
          allowed: Object.keys(settings.value),
        });
      if (setting.default === undefined)
        return no<Pack>(
          'REQUIRED_MISSING',
          `${subject} reads the setting ${read.key}, so ${read.key} needs a default for the first install.`,
          { at: `config.${read.key}.default` },
        );
      if (setting.type === 'money' && !fillsWholeValue)
        return no<Pack>(
          'VALUE_MALFORMED',
          asText
            ? `${where} reads the money setting ${read.key} into a line of text. A money setting fills a whole value on its own, and a note is text.`
            : `${where} puts the money setting ${read.key} inside longer text. A money setting fills a whole value on its own.`,
          { at: where },
        );
    }
    return null;
  };

  for (const d of declarations) {
    const fault = placeholderFault(d.id, d.body, (at) => `${d.id}.${at}`);
    if (fault) return fault;
  }

  /* A FIGURE'S TARGET MAY NAME A SETTING IT IS HELD TO, read live (`liveTarget`): one this pack declares, a sum or a number. */
  for (const d of declarations) {
    const target = d.kind === 'metric' ? (d.body.target as Record<string, unknown> | undefined) : undefined;
    if (target === undefined || target === null || typeof target !== 'object' || target.setting === undefined) continue;
    const key = target.setting;
    const setting = typeof key === 'string' && Object.hasOwn(settings.value, key) ? settings.value[key] : undefined;
    if (setting === undefined)
      return no<Pack>('FIELD_UNKNOWN', `${d.id}'s target is held to the setting ${String(key)}, and ${id} declares no setting by that name.`, {
        at: `${d.id}.target.setting`,
        allowed: Object.keys(settings.value),
      });
    if (setting.type !== 'money' && setting.type !== 'number')
      return no<Pack>('VALUE_MALFORMED', `${d.id}'s target is held to ${key}, which is a ${setting.type}. A target is held to a money or a number setting.`, {
        at: `${d.id}.target.setting`,
      });
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

    /* AND ITS PLACEHOLDERS ARE READ LIKE A DECLARATION'S, both in the fields and in the note. */
    const inFields = placeholderFault(`${seed.register}'s example row`, seed.fields, (at) => `seeds.${seed.register}.${at}`);
    if (inFields) return inFields;
    if (typeof seed.note === 'string') {
      const inNote = placeholderFault(`${seed.register}'s example row`, seed.note, () => `seeds.${seed.register}.note`, true);
      if (inNote) return inNote;
    }

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
  const kept: Diff['kept'] = [];
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
    /* A DECLARATION HANDED TO THIS PACK BEFORE IT WAS INSTALLED is live under its name already (the handing install
       staged it so), and this install takes it over. Nothing else puts a live row under a pack with no `pack` row: an
       uninstall retires what it claimed and a disable keeps the row. Planned as an add, because it is new to this pack
       and the owner reads it that way, and not asked about as a change of the pack's own body. */
    if (already.pack_id === mine && was === null) {
      adds.push({ id: decl.id, summary: summarise(decl), handed: true });
      if (decl.kind !== 'register') continue;
      /* WHAT THE RECORD'S LIST HOLDS AND THIS BODY LACKS STAYS, as the record's own addition, exactly as a rebase keeps
         `lane.sold` (`plan-additive.test.ts`): the pack that takes `holdings` may ship without `gold`, and a row written
         under `gold` must still read. The pack cannot see a row, so everything the list had is kept, used or not. */
      const over = carried(already.body, decl.body);
      if (over !== null) kept.push({ id: decl.id, adds: over.adds, rebased: over.body });
      const rows = installed.rows[decl.id.slice('register.'.length)] ?? 0;
      if (rows > 0) unreadable(over === null ? decl : { ...decl, body: JSON.parse(over.body) as Record<string, Json> }, already.body, rows, retypes, newlyRequired);
      continue;
    }
    /* BUT ONE THIS PACK WROTE AND THE OWNER THEN CHANGED IS KEPT, and left out of what is staged. Both were `null` to the
       test below, so an owner who had moved one block on Money was refused every later money-core update, and the
       refusal told them to retire their own Money page (`loop/research-pack-update-edited.md`). The superseded row says
       whose the declaration was; a row somebody wrote from nothing has no such row and stays a conflict, because the
       pack's pages would then read a stranger's figure under their own name. */
    const edited = already.pack_id === null ? installed.detached?.[decl.id] : undefined;
    if (edited?.was === mine) {
      /* EXCEPT A LIST THIS VERSION CHANGES. Kept, it lacks whatever the update adds to it, and nothing else notices: the
         checker's probe kept an edited `register.fx` under a version adding a `spread` field and a metric summing it, and
         the install went through with the metric summing a field the list did not have. The kernel took `sum: 'nosuch'`
         as well. One comparison with the body the edit started from closes it. */
      if (decl.kind !== 'register' || edited.body === decl.canonical) {
        kept.push({ id: decl.id });
        continue;
      }
      /* UNLESS ALL THE OWNER DID WAS ADD. The arm above locked a list against its pack for good the moment somebody added
         a field to it: `loop/research-shell-seed.md` M1 measured `domains` on `register.things` refusing every later
         portfolio that touched `things`, and §22 makes adding a field the ordinary way a record grows. An edit that is
         the body it started from plus fields and enum values that body lacks has nothing the update could undo, so the
         update's body is staged as the pack's and the additions are laid over it as the owner's row. */
      const over = rebased(edited.body, already.body, decl.body);
      if (over === null) conflicts.push({ id: decl.id, pack: OWN, changed: true });
      else if ('clash' in over) conflicts.push({ id: decl.id, pack: OWN, changed: true, field: over.clash });
      else {
        kept.push({ id: decl.id, adds: over.adds, rebased: over.body });
        /* THE UPDATE'S OWN CHANGES STILL MEET THE ROWS: a field it retypes under rows is refused here as it is for a list
           nobody edited, asked of what will be live, so the owner's additions are never mistaken for the update's. */
        const rows = installed.rows[decl.id.slice('register.'.length)] ?? 0;
        if (rows > 0) unreadable({ ...decl, body: JSON.parse(over.body) as Record<string, Json> }, already.body, rows, retypes, newlyRequired);
      }
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
  const hands = pack.manifest.hands ?? {};
  for (const decl of installed.declarations) {
    if (decl.pack_id !== mine || keeping.has(decl.id)) continue;
    const register = decl.id.startsWith('register.') ? decl.id.slice('register.'.length) : null;
    const rows = register ? (installed.rows[register] ?? 0) : 0;
    /* A DECLARATION THIS VERSION HANDS ON IS NOT RETIRED, SO IT ORPHANS NOTHING. It is staged again under the pack it
       goes to, and `pack` in its body says the same thing, because the kernel reads the same bytes as the same version
       and keeps the owner it had: a restage of the unchanged body left money-core owning the list. The line still sits
       among the retires, since this pack no longer declares it, and names where it went, which is what the owner reads:
       the plan he approved for money-core 1.8.0 said twelve ingests retire and never which pack to install for them
       (`loop/research-batch-thirty-two-audit.md` §3). */
    /* BUT ONLY TO A PACK THE RECORD DOES NOT HAVE YET. Handed to an installed pack whose file does not declare it, the
       list sat under that pack's name and every later update of it, a reinstall of the same file included, was
       `WOULD_ORPHAN` (`handover.test.ts`), so one pack's `hands` could stop another from ever updating. Taking over
       is what a pack's first install does, so a handover to one already installed is the retire it would otherwise be. */
    const to = Object.hasOwn(hands, decl.id) && !installed.packs.some((p) => p.id === hands[decl.id]) ? hands[decl.id] : undefined;
    const body = to === undefined ? null : handedBody(decl.body, to);
    if (to !== undefined && body !== null) {
      retires.push({ id: decl.id, rows, to, body });
      continue;
    }
    retires.push({ id: decl.id, rows });
    orphans += rows;
  }
  /* WHAT IS HANDED STAYS LIVE, so nothing below may treat it as gone: not a figure that reads it, not a list a field
     points at, and not half of a rename. */
  const handed = new Set(retires.filter((r) => r.to !== undefined).map((r) => r.id));

  /* A RETIRE AND AN ADD OF ONE BODY ARE ONE DECLARATION UNDER TWO IDS. Both lists were built in this
     function from one `Installed` and never compared, so a rename was planned as two unrelated moves;
     `install` says what that cost. A body that will not parse is not a finding, for `unreadable`'s
     reason. */
  const renames: Diff['renames'] = [];
  for (const decl of added) {
    const now = unnamed(decl.kind, decl.body);
    if (now === null) continue;
    for (const gone of installed.declarations) {
      if (gone.pack_id !== mine || keeping.has(gone.id) || handed.has(gone.id) || gone.kind !== decl.kind) continue;
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

  /* A DECLARATION THE OWNER CHANGED MAY READ ONE THIS VERSION DROPS, and the install used to say nothing: `p2` kept an
     edited Money page, dropped `metric.cash-now`, which its first tile reads, and the install answered `ok` with the page
     still drawing that tile. The conflict above hid it until now. Every edit of this pack's declarations is asked, kept
     or not shipped any more, because the owner's page reads the figure either way. */
  /* AND ONE THAT READS A FIELD THIS VERSION TAKES OFF A LIST THAT STAYS, which the loop above could not see because the
     list is not gone. The checker of `9b0d8184` measured it: an edited `spent-30d`, a money-core without `transfer`, a
     plan with no conflicts, and then `FIELD_UNKNOWN` on every read of the figure, because its `where` still says
     `transfer is false`. A retyped field is the same failure one step later: a sum over a field that is now text. */
  const moved = new Map<string, { fields: Map<string, Record<string, unknown>>; moved: Moved[] }>();
  for (const change of changes) {
    const decl = pack.declarations.find((d) => d.id === change.id);
    const was = live.get(change.id)?.body;
    if (decl?.kind !== 'register' || was === undefined) continue;
    const found = movedFields(was, decl.body);
    if (found !== null && found.moved.length > 0) moved.set(change.id, found);
  }
  /* A REBASED LIST IS CHANGED TOO, by whatever the update did to the pack's fields, and the owner's other edits may read
     one it takes off. Asked of the rebased body, which is what will be live, so the owner's own additions never count. */
  for (const k of kept) {
    const was = live.get(k.id)?.body;
    if (k.rebased === undefined || was === undefined) continue;
    const found = movedFields(was, JSON.parse(k.rebased));
    if (found !== null && found.moved.length > 0) moved.set(k.id, found);
  }
  const gone = new Set(retires.filter((r) => r.to === undefined).map((r) => r.id));
  for (const [id, edited] of Object.entries(installed.detached ?? {})) {
    if (edited.was !== mine || conflicts.some((c) => c.id === id)) continue;
    const body = live.get(id)?.body;
    if (body === undefined) continue;
    const reads = [...gone].find((r) => readsId(body, r));
    if (reads !== undefined) {
      conflicts.push({ id, pack: OWN, reads });
      continue;
    }
    if (live.get(id)?.kind === 'register') continue;
    for (const [list, { fields, moved: these }] of moved) {
      const hit = readsField(body, list, fields, these);
      if (hit === undefined) continue;
      conflicts.push({ id, pack: OWN, reads: list, ...hit });
      break;
    }
  }

  /* AND THE MIRROR: A LIST THE OWNER CHANGED AND THIS VERSION KEEPS, read by something this version stages. The loop above
     asks the owner's declarations about the pack's lists and never the pack's declarations about the owner's list. The
     audit of batch twenty measured the gap on a real record: the owner retired `fx.source`, the update added a figure
     counting it, the plan said no conflicts, and the figure answered `FIELD_UNKNOWN` on every read. A kept list's pack
     body is the one the edit started from (a changed one is the conflict above), so the difference between the two is
     exactly what the owner did, and only what this version stages is asked: a pack declaration it leaves as it was was
     already reading the owner's list before this update. */
  const staged = new Set([...adds, ...changes].map((c) => c.id));
  for (const { id, rebased: over } of kept) {
    const decl = pack.declarations.find((d) => d.id === id);
    /* A REBASED LIST IS ASKED AS IT WILL STAND, the update's fields and the owner's. Asked as it stands now, an update
       adding `launched` and a page showing it was refused as `{ field: 'launched', by: 'page.projects' }`, because the
       owner's row is older than the update and so lacks the update's own field (`plan-additive.test.ts`). */
    const theirs = over ?? live.get(id)?.body;
    if (decl?.kind !== 'register' || theirs === undefined || conflicts.some((c) => c.id === id)) continue;
    let owner: unknown;
    try {
      owner = JSON.parse(theirs);
    } catch {
      continue;
    }
    const found = movedFields(decl.canonical, owner);
    if (found === null || found.moved.length === 0) continue;
    for (const d of pack.declarations) {
      if (!staged.has(d.id) || d.kind === 'register') continue;
      const hit = readsField(d.canonical, id, found.fields, found.moved);
      if (hit === undefined) continue;
      conflicts.push({ id, pack: OWN, ...hit, by: d.id });
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
    kept,
    seeds: { count: seedsFor(pack, adds).length, registers: seedRows(seedsFor(pack, adds)) },
    spawns: spawnsOf(pack),
    calls_out: calls,
    approve: approvalLines(calls.filter((c) => c.change !== 'same').map((c) => ({ key: c.grant, line: c.line, key_line: c.key_line }))),
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
 * record already holds has had its examples, and a person may have deleted them on purpose. A list handed to this pack
 * is one of those, so it is left out as well.
 */
function seedsFor(pack: Pack, adds: readonly { id: string; handed?: true }[]): Seed[] {
  const added = new Set(adds.filter((a) => a.handed === undefined).map((a) => a.id));
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

/**
 * The pack with every `{{config:<key>}}` in its declarations and its example rows filled from
 * `config`. The same pack when there is nothing to fill.
 *
 * THE EXAMPLE ROWS WERE NOT FILLED, and that was the half of this that nothing checked. A seed
 * carrying `{{config:heading}}` was planted with the braces in it: measured on a record here, the
 * planted row's text read `{{config:heading}}` where the register's own name, filled from the same
 * setting, read `Sample invoices`. A declaration that misses its fill is caught by the kernel's
 * `validate`; a row is written through the write path, which reads it as text and stores it.
 *
 * THE CHECKSUM IS NOT TOUCHED, here or on the declarations: it identifies the file, and the file is
 * what was written before anybody chose a value.
 */
function filledWith(pack: Pack, config: Diff['config']): Pack {
  const values = Object.fromEntries(config.filter((c) => c.from !== 'none').map((c) => [c.key, c.value]));
  if (Object.keys(values).length === 0) return pack;
  const declarations = pack.declarations.map((d) => {
    if (configReads(d.body).length === 0) return d;
    const body = fillConfig(d.body, values) as Record<string, Json>;
    return { ...d, body, canonical: canonicalise(body) ?? d.canonical };
  });
  const seeds = pack.seeds.map((seed) => {
    if (configReads(seed.fields).length === 0 && (seed.note === undefined || configReads(seed.note).length === 0)) return seed;
    return {
      ...seed,
      fields: fillConfig(seed.fields, values) as Record<string, Json>,
      ...(seed.note === undefined ? {} : { note: String(fillConfig(seed.note, values)) }),
    };
  });
  return { ...pack, declarations, seeds };
}

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
  const dropped = new Set(retires.filter((r) => r.to === undefined).map((r) => r.id));
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

/**
 * `PROVIDES_CONFLICT` for a plan whose first conflict is a declaration the owner changed, or `null` for any other plan.
 *
 * THE SENTENCE KEEPS THE EDIT. The one sentence there was told the owner to retire what they wrote, which for an arranged
 * Money page is their Money page; these name what the update would break and offer staying on the version they have.
 * `names` says an id the way the caller's reader knows it (a pack by its title, a page by the owner's own title), and
 * says the id itself without it.
 */
export function conflictFault(diff: Pick<Diff, 'pack' | 'installed_version' | 'conflicts'>, names: (id: string) => string = (id) => id): Refusal | null {
  const first = diff.conflicts[0];
  if (!first || (first.reads === undefined && !first.changed && first.by === undefined)) return null;
  const pack = names(diff.pack.id);
  const stay = diff.installed_version === null ? `leave ${pack} as it is` : `leave ${pack} at ${diff.installed_version}`;
  const who = names(first.id);
  /* AN INGEST WRITES WHAT IT NAMES, and a sentence that said it reads the field would send the owner looking for a filter
     their pattern does not have. */
  const does = first.id.startsWith('ingest.') ? 'writes' : 'reads';
  /* AND IN THE MIRROR THE ONE THAT READS OR WRITES IS `by`, not the list: an update's ingest over a field the owner took
     off was told as "reads note", the sentence the line above exists to avoid. */
  const writer = first.by?.startsWith('ingest.') === true;
  const fix =
    first.by !== undefined && first.field !== undefined
      ? `You changed ${who}, and ${pack} ${diff.pack.version}’s ${names(first.by)} ${
          first.retyped !== undefined
            ? `${writer ? 'writes' : 'reads'} ${first.field} as ${an(first.retyped.from)}, which your list now has as ${an(first.retyped.to)}. Make ${first.field} ${an(first.retyped.from)} again on ${who} first`
            : first.relabelled !== undefined
              ? `calls ${first.field} "${first.relabelled.from}", which your list now calls "${first.relabelled.to}". Name ${first.field} "${first.relabelled.from}" again on ${who} first`
              : first.value !== undefined
                ? `${writer ? `writes ${first.value} to ${first.field}` : `asks ${first.field} for ${first.value}`}, which your list no longer allows. Put ${first.value} back on ${first.field} in ${who} first`
                : `${writer ? 'writes' : 'reads'} ${first.field}, which your list no longer has. Put ${first.field} back on ${who} first`
        }, or ${stay}.`
      : first.reads !== undefined && first.field !== undefined && first.relabelled !== undefined
      ? `${pack} ${diff.pack.version} renames ${first.field} on ${names(first.reads)} from "${first.relabelled.from}" to "${first.relabelled.to}", and ${who}, which you changed, calls it "${first.relabelled.from}". Write ${first.field} in ${who} by its id or its new name first, or ${stay}.`
      : first.reads !== undefined && first.field !== undefined && first.value !== undefined
      ? `${pack} ${diff.pack.version} takes ${first.value} off the values of ${first.field} on ${names(first.reads)}, and ${who}, which you changed, ${
          does === 'writes' ? 'writes it' : 'asks for it'
        }. Change what ${who} ${does === 'writes' ? 'writes to' : 'asks of'} ${first.field} first, or ${stay}.`
      : first.reads !== undefined && first.field !== undefined
      ? `${pack} ${diff.pack.version} ${
          first.retyped === undefined
            ? `takes ${first.field} off ${names(first.reads)}, and ${who}, which you changed, ${does} it.`
            : `makes ${first.field} on ${names(first.reads)} ${an(first.retyped.to)}, and ${who}, which you changed, ${does} it as ${an(first.retyped.from)}.`
        } Take ${first.field} off ${who} first, or ${stay}.`
      : first.reads !== undefined
      ? `${pack} ${diff.pack.version} no longer has ${first.reads}, and ${names(first.id)}, which you changed, reads it. Take ${first.reads} off ${names(first.id)} first, or ${stay}.`
      : first.changed && first.field !== undefined
      ? `${pack} ${diff.pack.version} adds a field called ${first.field} to ${who}, and you added one with that id already. Two fields cannot share an id, so for now, ${stay}.`
      : `${pack} ${diff.pack.version} changes ${names(first.id)}, which you changed: kept as you left it, it would lack what the update adds to it. For now, ${stay}.`;
  return { code: 'PROVIDES_CONFLICT', fix, at: first.id };
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

/** A list body's fields by id, in the order it declares them. Anything that is not a list body has none. */
function fieldsOf(body: unknown): Map<string, Record<string, unknown>> {
  const list = (body as { fields?: unknown } | null)?.fields;
  const out = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    const f = raw as { id?: unknown };
    if (isObject(raw as Json) && typeof f.id === 'string') out.set(f.id, f as Record<string, unknown>);
  }
  return out;
}

/* THE ELEMENT TYPE COUNTS AS THE TYPE. `42 §5.3·31` says *"a different `type` (or `of.type`)"*, and a `list<text>` that
   becomes a `list<int>` reads every row it holds as the wrong thing exactly as `text → money` does. */
const typeSaid = (f: Record<string, unknown>): string => `${String(f.type ?? '')}${f.of === undefined ? '' : `<${JSON.stringify(f.of)}>`}`;

/** A type said with its article, as the refusal reads it: `a text`, `an enum`. */
const an = (type: string): string => `${/^[aeiou]/iu.test(type) ? 'an' : 'a'} ${type}`;

/**
 * A field an update takes off a list, or gives another type when `retyped` is there, or another label when `relabelled`
 * is, or one whose values lose `value`. The last two leave the field on the list and matter only to a declaration that
 * names the field by that label or asks for that value.
 */
type Moved = { field: string; retyped?: { from: string; to: string }; relabelled?: { from: string; to: string }; value?: string };

/** Words as `parseWhere` compares them: spaces and underscores one space, case folded. */
const fold = (t: string): string => t.replace(/[\s_]+/gu, ' ').trim().toLowerCase();

/**
 * What an update does to one list's fields: each it takes off, retypes, relabels or takes a value from, in the order the
 * installed list declares them, with the installed fields the owner's declarations were written against. `null` for a
 * stored body that will not parse, for `unreadable`'s reason.
 */
function movedFields(was: string, now: unknown): { fields: Map<string, Record<string, unknown>>; moved: Moved[] } | null {
  let old: unknown;
  try {
    old = JSON.parse(was);
  } catch {
    return null;
  }
  const fields = fieldsOf(old);
  const after = fieldsOf(now);
  const moved: Moved[] = [];
  for (const [id, then] of fields) {
    const next = after.get(id);
    if (next === undefined) {
      moved.push({ field: id });
      continue;
    }
    if (typeSaid(then) !== typeSaid(next)) {
      moved.push({ field: id, retyped: { from: typeSaid(then), to: typeSaid(next) } });
      continue;
    }
    /* A LABEL IS A NAME `parseWhere` ANSWERS TO, and only while the list still says it. `between your own accounts is
       false` resolves to `transfer` by the label, and under a list that calls the field `Internal` it is FIELD_UNKNOWN. */
    const label = typeof then.label === 'string' ? then.label : '';
    const renamed = typeof next.label === 'string' && next.label !== '' ? next.label : id;
    if (label !== '' && fold(label) !== fold(renamed)) moved.push({ field: id, relabelled: { from: label, to: renamed } });
    /* AND A VALUE IS A WORD `resolve` ANSWERS TO: `direction is out` over values that no longer hold `out` is
       ENUM_VALUE_UNKNOWN on every read. */
    const kept = new Set(Array.isArray(next.values) ? next.values : []);
    if (Array.isArray(then.values))
      for (const v of then.values) if (typeof v === 'string' && !kept.has(v)) moved.push({ field: id, value: v });
  }
  return { fields, moved };
}

/**
 * The update's list body with the owner's additions laid over it, when `mine` is `from` plus fields and enum values
 * `from` lacks and nothing else; `null` for any other edit, and `clash` for an added field id `now` brings as well.
 *
 * NOTHING BUT ADDITIONS, AND IN PLACE. Every key of `from` but `fields` is the same, every field of `from` is there in
 * its order and its shape, and an enum field may carry more `values` after its own (with `labels` for the new ones
 * only). A renamed list, a retyped field or a value taken off is an edit the update would undo or be undone by, so it
 * stays the conflict it was. The owner's fields go after the update's, and their values after the update's values.
 */
function rebased(from: string, mine: string, now: Record<string, Json>): { body: string; adds: string[] } | { clash: string } | null {
  let was: Record<string, unknown>;
  let theirs: Record<string, unknown>;
  try {
    was = JSON.parse(from) as Record<string, unknown>;
    theirs = JSON.parse(mine) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!isObject(was as Json) || !isObject(theirs as Json) || !Array.isArray(was.fields) || !Array.isArray(theirs.fields)) return null;
  const rest = (b: Record<string, unknown>) => canonicalise({ ...b, fields: null });
  if (rest(was) !== rest(theirs)) return null;

  const before = fieldsOf(was);
  const after = fieldsOf(theirs);
  if (before.size !== was.fields.length || after.size !== theirs.fields.length) return null;
  const order = [...after.keys()].filter((id) => before.has(id));
  if (order.length !== before.size || order.some((id, i) => id !== [...before.keys()][i])) return null;

  const values = new Map<string, { values: string[]; labels: Record<string, unknown> }>();
  for (const [id, then] of before) {
    const f = after.get(id)!;
    const plain = (x: Record<string, unknown>) => canonicalise({ ...x, values: null, labels: null });
    if (plain(then) !== plain(f)) return null;
    const old = Array.isArray(then.values) ? (then.values as unknown[]) : null;
    const got = Array.isArray(f.values) ? (f.values as unknown[]) : null;
    if ((old === null) !== (got === null)) return null;
    const more = got === null ? [] : got.filter((v) => !old!.includes(v));
    if (old !== null && canonicalise(got!.filter((v) => old.includes(v))) !== canonicalise(old)) return null;
    if (more.some((v) => typeof v !== 'string')) return null;
    const oldLabels = isObject(then.labels as Json) ? (then.labels as Record<string, unknown>) : {};
    const gotLabels = isObject(f.labels as Json) ? (f.labels as Record<string, unknown>) : {};
    if (then.labels !== undefined && !isObject(then.labels as Json)) return null;
    for (const [k, v] of Object.entries(gotLabels))
      if (k in oldLabels ? canonicalise(v) !== canonicalise(oldLabels[k]) : !more.includes(k)) return null;
    if (Object.keys(oldLabels).some((k) => !(k in gotLabels))) return null;
    if (more.length > 0)
      values.set(id, { values: more as string[], labels: Object.fromEntries(Object.entries(gotLabels).filter(([k]) => more.includes(k))) });
  }
  const added = [...after.values()].filter((f) => !before.has(f.id as string));
  if (added.length === 0 && values.size === 0) return null;

  const next = Array.isArray(now.fields) ? (structuredClone(now.fields) as Record<string, unknown>[]) : null;
  if (next === null) return null;
  const at = new Map(next.filter((f) => isObject(f as Json)).map((f) => [f.id, f]));
  const clash = added.find((f) => at.has(f.id));
  if (clash) return { clash: clash.id as string };
  for (const [id, more] of values) {
    /* A FIELD THE OWNER GAVE VALUES TO AND THE UPDATE TAKES OFF OR MAKES SOMETHING ELSE has nowhere to put them. */
    const f = at.get(id);
    if (f === undefined || !Array.isArray(f.values)) return null;
    f.values = [...f.values, ...more.values.filter((v) => !(f.values as unknown[]).includes(v))];
    const labels = isObject(f.labels as Json) ? (f.labels as Record<string, unknown>) : {};
    const extra = Object.fromEntries(Object.entries(more.labels).filter(([k]) => !(k in labels)));
    if (Object.keys(extra).length > 0) f.labels = { ...labels, ...extra };
  }
  const body = canonicalise({ ...now, fields: [...next, ...added] });
  if (body === null) return null;
  return { body, adds: [...added.map((f) => f.id as string), ...[...values].flatMap(([id, v]) => v.values.map((x) => `${id}.${x}`))] };
}

/** A live body as JCS text with `pack` set to `to`, which is what a handover stages; `null` for one that will not parse. */
function handedBody(live: string, to: string): string | null {
  try {
    const body = JSON.parse(live) as unknown;
    return isObject(body as Json) ? canonicalise({ ...(body as Record<string, Json>), pack: to }) : null;
  } catch {
    return null;
  }
}

/**
 * The receiving pack's list body with what the record's list holds and it lacks laid over it: each field it does not
 * declare, after its own, and each enum value a field of the same id does not list, after its own values with the
 * label the record had for it. `null` when there is nothing to carry, or a body will not parse.
 *
 * `rebased` ABOVE ASKS MORE, and cannot be used here. It holds the owner's list to the body the edit started from, in
 * its order and its shape, because a pack's next version is a new body of the same list. A handover is a different
 * pack's body of that list, which may order, label or describe it differently, and whatever it says wins; the one
 * thing it may not do is take away a field or a value rows were written under, because it never saw those rows.
 */
function carried(live: string, now: Record<string, Json>): { body: string; adds: string[] } | null {
  let was: unknown;
  try {
    was = JSON.parse(live);
  } catch {
    return null;
  }
  const next = Array.isArray(now.fields) ? (structuredClone(now.fields) as Record<string, unknown>[]) : null;
  if (next === null) return null;
  const at = new Map(next.filter((f) => isObject(f as Json)).map((f) => [f.id, f]));
  const fields: Record<string, unknown>[] = [];
  const adds: string[] = [];
  for (const [id, f] of fieldsOf(was)) {
    const theirs = at.get(id);
    if (theirs === undefined) {
      fields.push(structuredClone(f));
      adds.push(id);
      continue;
    }
    if (!Array.isArray(f.values) || !Array.isArray(theirs.values)) continue;
    const more = f.values.filter((v): v is string => typeof v === 'string' && !(theirs.values as unknown[]).includes(v));
    if (more.length === 0) continue;
    theirs.values = [...theirs.values, ...more];
    const said = isObject(f.labels as Json) ? (f.labels as Record<string, unknown>) : {};
    const labels = isObject(theirs.labels as Json) ? (theirs.labels as Record<string, unknown>) : {};
    const extra = Object.fromEntries(more.filter((v) => v in said && !(v in labels)).map((v) => [v, said[v]]));
    if (Object.keys(extra).length > 0) theirs.labels = { ...labels, ...extra };
    adds.push(...more.map((v) => `${id}.${v}`));
  }
  if (adds.length === 0) return null;
  const body = canonicalise({ ...now, fields: [...next, ...fields] } as Json);
  return body === null ? null : { body, adds };
}

/**
 * The declared value a written word means on an enum field, as `@braindog/where`'s `resolve` reads it: a value's label
 * first, then the value in the words a screen shows. `null` for a word the field does not declare, or a field with no
 * values, which is `resolve`'s refusal and none of this check's business.
 */
function valueSaid(f: Record<string, unknown>, said: string): string | null {
  const values = Array.isArray(f.values) ? f.values.filter((v): v is string => typeof v === 'string') : [];
  if (values.length === 0) return null;
  const labels = isObject(f.labels as Json) ? (f.labels as Record<string, unknown>) : {};
  const labelled = Object.entries(labels).find(([, l]) => typeof l === 'string' && fold(l) === fold(said));
  if (labelled && values.includes(labelled[0])) return labelled[0];
  const wanted = said.replace(/\s+/gu, '_').toLowerCase();
  return values.find((v) => v.toLowerCase() === wanted || v.replace(/_/gu, ' ').toLowerCase() === said.toLowerCase()) ?? null;
}

/** Keys whose text is for a person or names the declaration itself, and is never a field it reads. */
const NOT_A_FIELD = new Set(['name', 'title', 'heading', 'label', 'summary', 'description', 'note', 'say', 'kind', 'format', 'source', 'register', 'metric', 'page', 'rule']);
/** Keys whose text is a `where` sentence, read clause by clause. */
const SENTENCES = new Set(['where', 'when', 'filter']);

/**
 * The first of `moved` that a stored body reads on the list `list` names: a field written whole as a value (a metric's
 * `sum`, a column's `field`, a structured predicate's leaf), or the field a clause of a `where` or `when` sentence
 * begins with, by id or by label as `@braindog/where`'s `parseWhere` finds it.
 *
 * SCOPED BY LIST, because a field is a field of one list. A metric's `source`, a block's `source` and a rule's `register`
 * set the list for everything under them, and `note` on another list is not `note` on this one.
 *
 * THE CLAUSE RULE IS COPIED AND NOT IMPORTED. `declare` depends on `kernel` and `ports` only, and the graph gate refuses
 * an undeclared import; the rule is small (split on the comma, the id exactly, else the longest label the clause starts
 * with) and a false yes here costs a refusal naming both, where a false no costs a figure that fails on every read.
 *
 * AND WHAT THE CLAUSE SAYS AFTER THE FIELD, because two of the ways a kept `where` fails are not about the field being
 * there: the label it was named by may change (`relabelled` counts only for a field named by its label), and the value
 * after `is`, `has` or `lacks` may leave the field's values (`value` counts only for a value somebody asks for).
 *
 * AN INGEST READS NO FIELD AND WRITES SEVERAL, and they are the keys of its `extract` or its `map`, never a value in
 * them: `extract: { note: { after: 'ref ' } }` writes `note`. A kept pattern that writes a field the update takes off
 * refuses every message it matches; one whose `enum.map` writes a value the field no longer has refuses the same way.
 */
function readsField(body: string, list: string, fields: Map<string, Record<string, unknown>>, moved: readonly Moved[]): Moved | undefined {
  const name = list.slice(list.indexOf('.') + 1);
  const read = new Set<string>();
  const byLabel = new Set<string>();
  const asked = new Map<string, Set<string>>();
  const ask = (field: string, value: string | null): void => {
    if (value === null) return;
    const had = asked.get(field) ?? new Set<string>();
    had.add(value);
    asked.set(field, had);
  };
  const clause = (said: string): void => {
    const words = said.trim().split(/\s+/u);
    let field: string | null = fields.has(words[0] ?? '') ? (words[0] ?? null) : null;
    let after = 1;
    if (field === null) {
      const folded = fold(said);
      let best = '';
      let label = false;
      for (const [id, f] of fields)
        for (const n of [typeof f.label === 'string' ? f.label : '', id]) {
          const key = fold(n);
          if (!key || key.length <= best.length) continue;
          if (folded === key || folded.startsWith(`${key} `)) {
            best = key;
            field = id;
            /* A LABEL THAT FOLDS TO THE ID NAMES THE FIELD BY ITS ID: `which way is out` finds `which_way` by the id
               whatever the label becomes, and counting it as a label refused a relabel nothing was hurt by. */
            label = key !== fold(id);
          }
        }
      if (field === null) return;
      if (label) byLabel.add(field);
      after = best.split(' ').length;
    }
    read.add(field);
    const verb = words[after] ?? '';
    const rest = words.slice(after + 1).join(' ');
    if (verb !== 'is' && verb !== 'has' && verb !== 'lacks') return;
    const negated = rest === 'not' || rest.startsWith('not ');
    const wanted = (negated ? rest.slice(3) : rest).trim();
    const f = fields.get(field)!;
    for (const one of verb === 'is' ? wanted.split(/ or /iu) : [wanted]) ask(field, valueSaid(f, one.trim()));
  };
  /* A STRUCTURED LEAF NAMES ITS VALUE UNDER THE OPERATOR, as the sentence names it after the verb. */
  const LEAF_VALUES = ['is', 'not', 'in', 'not_in', 'has', 'lacks'];
  const walk = (v: unknown, key: string | null, on: string | null): void => {
    if (typeof v === 'string') {
      if (on !== name || key === null || NOT_A_FIELD.has(key)) return;
      if (SENTENCES.has(key)) for (const c of v.split(',')) clause(c);
      else if (fields.has(v)) read.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, key, on);
      return;
    }
    if (!isObject(v as Json)) return;
    const o = v as Record<string, unknown>;
    const at = typeof o.source === 'string' && o.source.startsWith('register.') ? o.source : typeof o.register === 'string' ? o.register : null;
    const here = at === null ? on : at.startsWith('register.') ? at.slice('register.'.length) : at;
    if (here === name && typeof o.field === 'string' && fields.has(o.field))
      for (const op of LEAF_VALUES)
        for (const said of [o[op]].flat()) if (typeof said === 'string') ask(o.field, said);
    for (const [k, x] of Object.entries(o)) walk(x, k, here);
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  const ingest = isObject(parsed as Json) ? (parsed as Record<string, unknown>) : {};
  const writes = isObject(ingest.writes as Json) ? (ingest.writes as Record<string, unknown>).register : undefined;
  if (typeof writes === 'string' && writes.replace(/^register\./u, '') === name)
    for (const form of [ingest.extract, ingest.map])
      if (isObject(form as Json))
        for (const [field, how] of Object.entries(form as Record<string, unknown>)) {
          if (!fields.has(field)) continue;
          read.add(field);
          const map = (how as { enum?: { map?: unknown } } | null)?.enum?.map;
          if (isObject(map as Json)) for (const out of Object.values(map as Record<string, unknown>)) if (typeof out === 'string') ask(field, out);
        }
  walk(parsed, null, null);
  const hit = moved.find((m) =>
    m.value !== undefined ? asked.get(m.field)?.has(m.value) === true : m.relabelled !== undefined ? byLabel.has(m.field) : read.has(m.field),
  );
  return hit === undefined ? undefined : { ...hit };
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
  const before = fieldsOf(old);
  for (const [id, now] of fieldsOf(decl.body)) {
    const then = before.get(id);
    /* A WIDENING IS NOT A RETYPE: every stored value reads back unchanged, and the kernel answers the same (`widen.ts`). */
    if (then !== undefined && typeSaid(then) !== typeSaid(now) && !widens(then, now)) retypes.push({ id: decl.id, field: id, from: typeSaid(then), to: typeSaid(now), rows });

    /* A `default` IS THE ANSWER FOR THE ROWS THAT HAVE NONE, which is why `04 §5`'s sentence names
       it as the repair: *"Ship a default or a fill rule."* */
    const demanded = now.required === true && now.default === undefined;
    if (demanded && then?.required !== true) newlyRequired.push({ id: decl.id, field: id, rows });
  }
}

/**
 * Whether a stored body reads the declaration `id` names: the id written whole (`register.fx`, as a metric's `source`), or
 * its bare name under its own kind's key (`"metric": "cash-now"`, as a page's tile), or a list's bare name as a field's
 * `to` or a block's `register`.
 *
 * WIDE ON PURPOSE. It decides whether an update may go ahead over a declaration the owner changed, and a false yes costs
 * a refusal that names both ids, where a false no costs a page drawing a figure that no longer exists.
 */
function readsId(body: string, id: string): boolean {
  const at = id.indexOf('.');
  const kind = id.slice(0, at);
  const name = id.slice(at + 1);
  const walk = (v: unknown, key: string | null): boolean => {
    if (typeof v === 'string')
      return v === id || (v === name && (key === kind || (kind === 'register' && (key === 'to' || key === 'register'))));
    if (Array.isArray(v)) return v.some((x) => walk(x, key));
    return isObject(v) && Object.entries(v).some(([k, x]) => walk(x, k));
  };
  try {
    return walk(JSON.parse(body), null);
  } catch {
    return false;
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
    const e = egressOf(d, installed.nameOf);
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
        : egressChanged(before, e)
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
        paged: e.paged,
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
    const edited = conflictFault(diff);
    if (edited) return { ok: false, refusal: edited };
    /* AND THE REMEDY IS NOT THE SAME FOR THE TWO OWNERS. A declaration another pack owns is freed by
       uninstalling that pack; one somebody wrote in the app is freed by retiring it, and telling
       them to uninstall a pack that does not exist would send them looking for it. */
    /* AND A PACK THAT ASKS FOR A LATER VERSION OF THE OWNER IS TOLD TO INSTALL THAT FIRST. A list or an ingest moves
       from one pack to another by the owner's update handing it over, so the pack that takes it is refused until that
       update has landed, and "two packs cannot own one declaration" read as a dead end: measured on `bank-hsbc-eg`
       beside money-core 1.7.0 and on a `holdings` pack beside money-core 1.8.0, both with the step they needed sitting
       unread in `requires`. */
    const step = first.pack === OWN ? undefined : diff.requires.packs.find((p) => p.id === first.pack && !p.ok);
    return no<Applied>(
      'PROVIDES_CONFLICT',
      first.pack === OWN
        ? `${first.id} was written in this record, and installing ${diff.pack.id} would take it over. Retire it first if you want the pack to own it.`
        : step !== undefined
          ? `${first.id} belongs to ${first.pack}${step.installed === null ? '' : ` ${step.installed}`}, and ${diff.pack.id} needs ${first.pack} ${step.range}. Update ${first.pack} first, then install ${diff.pack.id}.`
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
  if (host.keyReady)
    for (const c of diff.calls_out) {
      if (c.change === 'same' || c.grant === null) continue;
      const why = host.keyReady(c.grant, c.paged);
      if (why === null) continue;
      /* MISSING READS `REQUIRED_MISSING` AND UNOPENABLE READS `OUT_OF_BOUNDS`: one is a key to add,
         the other is a key to add AGAIN, under the connector, and a caller that collapsed them
         would tell somebody to deposit a key they have already deposited. */
      return no<Applied>(why.code, why.fix, { at: 'approve' });
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
  /* WHAT THE OWNER CHANGED IS NOT STAGED, so it stands at its own version with `pack_id` null, and a later uninstall of
     this pack still cannot take it. */
  const keep = new Set(diff.kept.filter((k) => k.rebased === undefined).map((k) => k.id));
  /* A REBASED LIST IS STAGED TWICE IN ONE BATCH: the update's body as the pack's, then the owner's additions over it with
     no pack. The kernel supersedes the first with the second, so the live row is still the owner's, and `detached()`
     then reads the pack's newest body as the one the edit started from. Staged once as the owner's, measured through
     the record: portfolio one step up went through, and the step after it was refused `{ changed: true, field:
     'launched' }`, because the edit still started from the older body and the first update's own `launched` read as
     the owner's addition. */
  const over = diff.kept.flatMap((k) => (k.rebased === undefined ? [] : [{ id: k.id, kind: 'register', body: JSON.parse(k.rebased) as Json }]));
  /* WHAT THIS VERSION HANDS ON IS STAGED UNDER ITS NEW OWNER IN THE SAME BATCH, so the declaration is never retired: its
     rows stay readable, and a webhook's path token outlives the move, because `heldDigest` keeps a digest while every
     version since the mint is live. Retired and declared again, as money-core 1.8.0 first did, the Shortcut's door
     answered 404 from the update until the new pack was installed, and `none` after it. */
  const handing = diff.retires.flatMap((r) =>
    r.to === undefined || r.body === undefined ? [] : [{ id: r.id, kind: r.id.slice(0, r.id.indexOf('.')), body: JSON.parse(r.body) as Json, pack: r.to }],
  );
  const staged = await host.stage([
    ...filled.declarations.filter((d) => !keep.has(d.id)).map((d) => ({ id: d.id, kind: d.kind, body: d.body, pack: pack.manifest.pack })),
    ...over,
    ...handing,
  ]);
  if (!staged.ok) return staged;

  /* ONE TRANSACTION, AND A REFUSAL ROLLS IT BACK. Declarations, retires, seeds and the pack row
     land together or not at all. Four separate commits meant a seed the register refused left the
     record at the new shape with the ledger still saying the old version — and the next plan of the
     identical document then reported an upgrade with an empty diff, which is the most confident
     wrong answer this module can give. */
  const { provides: _provides, ...manifest } = pack.manifest;
  const kept = diff.config.filter((c) => c.from === 'kept').map((c) => [c.key, c.value] as const);
  /* A LIST THAT ALREADY HOLDS ROWS HAS HAD ITS EXAMPLES. An uninstall keeps the rows, so installing the pack again used
     to plant the examples a second time beside the first ones; counted before anything is written. */
  /* PLANTED FROM THE FILLED PACK, because `plan` counted its seeds off the filled one too: planting
     from `pack` here wrote the example rows with their placeholders still in them. */
  const planted = seedsFor(filled, diff.adds).filter((seed) => host.count(seed.register) === 0);
  try {
    return host.transaction((): Result<Applied> => {
      const put = staged.value();
      if (!put.ok) throw new Rolled(put);
      /* THE CACHE IS REBUILT BEFORE THE SEEDS, and inside the transaction: a seed is a write like
         any other, and the write path refuses a register it has not been told about yet. */
      host.reload();

      const retiring = diff.retires.filter((r) => r.to === undefined);
      if (retiring.length) {
        const gone = host.retire(retiring.map((r) => r.id));
        if (!gone.ok) throw new Rolled(gone);
      }

      /* THE SEEDS GO THROUGH THE WRITE PATH, so a seed the register would refuse is refused here
         rather than becoming a row nothing else in the product could have made. */
      for (const seed of planted) {
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
        declarations: pack.declarations.length - keep.size,
        seeds: planted.length,
        retired: retiring.length,
        ...(handing.length > 0 ? { handed: handing.length } : {}),
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
