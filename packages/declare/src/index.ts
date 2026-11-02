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
 * AND THE PLAN IS A PROMISE ABOUT ONE MOMENT. `planHash` is `<record_version>.<sha256 of what the
 * plan says, the pack's checksum among it>` (`saysOf`): the integer half catches a record that moved,
 * and the hash half catches a pack that was edited between the plan and the install — which no
 * version number can see — and any change to what the plan would do. Approving a diff and installing a
 * different one is the failure this prevents, and it is not hypothetical when the thing being approved
 * is a file in an editor. `install` asks for both halves; the record's own door asks only for the second
 * (`samePlan`), because a record that moved without moving the plan installs what was read.
 *
 * A PACK CANNOT READ A ROW, and `touches` says so by construction rather than by measurement. It
 * declares shape and it seeds examples; it has no verb that reads what is already there. That is
 * what makes a pack safe to install from a stranger, and it is why the checks below are all about
 * what a pack DECLARES rather than about what it might do.
 */

import type { Conflict, Refusal, Result } from '@braindog/ports';
import { no, ok, refused } from '@braindog/ports';
import { credentialKey as credential, credentialValue, looksLikeCredential, NESTED_MOST, nestedPast } from './credentials.ts';
import { FIRST_PARTY_LISTS, MODULES, readChanges, type ListWords } from './usecase.ts';
import { cardsFault } from './cards.ts';
import { addressFault } from './address.ts';
import { relisted, reworded } from './reworded.ts';
import { columnsFault, readAddColumn, type PageColumnAddition } from './add-column.ts';
export { addressFault, addressFaults, listingFault } from './address.ts';
import { holdsOf, resolveWhen, settleWhen } from './when.ts';
import { scriptSources, type ScriptSource } from './script-source.ts';
import { usesFault, usesSaid } from './uses.ts';
export { USES_MOST, usesFault, usesFilled, usesOf, usesSaid, type Use } from './uses.ts';
import { namerOf, writesLine, writesOf, type Writes } from './calls-out-writes.ts';
export { holdsIn, holdsOf, resolveWhen, settleWhen, type Waiting } from './when.ts';
import { KINDS, approvalLines, configReads, configValue, digest, egressChanged, egressOf as egressOfBody, fillConfig, intervalMs, jcs, misread, readConfig, rowRegisterOf, sentencesOver, validateDeclaration, widens, type ConfigDecl, type DeclKind, type Egress, type Json } from '@braindog/kernel';

/**
 * What one declaration sends out of the record, or `null` when it sends nothing: every host, how often, the key by label
 * and the fields. The same reading the record stores on a proposal, so a plan and a proposal print the same lines.
 */
export const egressOf = (
  decl: { kind: string; body: unknown },
  nameOf?: (project: string) => string | null,
  opensOf?: (label: string) => string | null,
): Egress | null => (decl.kind === 'ingest' || decl.kind === 'script' || decl.kind === 'digest' ? egressOfBody(decl.body, nameOf, opensOf) : null);
export type { Egress };

/* A use case: a pack with a front, its modules, signals and voice. */
export { SHARED_MOST_BYTES, SHARED_SUFFIX, exampleFields, exportUseCase, kindUnknownSentence, laterVersion, nextVersion, readShared, sharedFileName, unfilled, type ExportParts, type Shared, type VersionStep } from './shared.ts';
export { looksLikeCredential } from './credentials.ts';
export { LARGE_SOURCE_BYTES, SHOWN_LINES, changedLines, scriptSources, type ChangedLine, type ScriptSource } from './script-source.ts';
export { namerOf, writesLine, writesOf, type Writes } from './calls-out-writes.ts';
export { takesHold, takesHoldAll, type TakesHold } from './takes-hold.ts';
export { CARDS_FOLD, CARDS_FOLD_MOST, cardsFault } from './cards.ts';
export { AUDIENCES, CORE, CORE_PACK, KEEP_RATES_AT, isCore, MODULE_SHELVES, FIRST_PARTY_LISTS, LABEL_KEY, MODULES, MODULE_LISTS, MODULE_WORDS, SHARED_VERSION, SPEAKS, VOICE_KEYS, VOICE_TAB_CHARS, VOICE_TAB_KEYS, labelKeyOf, labelSetting, labelsOf, overHidden, overSettings, speakingPack, voiceWhenAdding, voiceWrites, normaliseUseCase, packIdOf, useCasePack, voiceOf, voiceSetting, wordsOf, type AddonWords, type Audience, type ExampleLink, type ListWords, type ModuleId, type Over, type SpeakingState, type UseCase, type VoiceKey } from './usecase.ts';

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
/**
 * One example row. `key` is the name the file gives it so another seed can point at it with `{ ref: '<key>' }`; it is
 * the file's own word and never reaches the row. A field may hold `{ day: '+3' }`, a day counted from install day.
 */
export type Seed = { register: string; fields: Record<string, Json>; note?: string; key?: string };

/** One skill a pack gives the record's agents. */
export type PackSkill = { name: string; trigger: string; what?: string; body: string };

/** The most skills one pack gives, and the most characters of a skill's steps. */
export const PACK_SKILLS_MOST = 8;
export const PACK_SKILL_BODY_MOST = 8000;
const SKILL_NAME = /^[a-z][a-z0-9-]{0,62}$/u;

/**
 * A pack's `skills`, read: each a lower-case name with hyphens, the moment to reach for it, an optional line on what it
 * is, and its steps. A string in the steps that reads as a key is refused whole, because a skill is text an agent will
 * follow and a key in it would travel with the file.
 */
export function readPackSkills(raw: unknown): Result<PackSkill[]> {
  if (raw === undefined) return ok([]);
  const at = 'skills';
  const bad = (fix: string, where = at): Result<PackSkill[]> => no('VALUE_MALFORMED', fix, { at: where });
  if (!Array.isArray(raw) || raw.length > PACK_SKILLS_MOST) return bad(`skills is a list of at most ${PACK_SKILLS_MOST} skills.`);
  const out: PackSkill[] = [];
  for (const [i, s] of raw.entries()) {
    const here = `skills.${i}`;
    if (!isObject(s) || Object.keys(s).some((k) => !['name', 'trigger', 'what', 'body'].includes(k)))
      return bad('A skill is { name, trigger, what?, body } and nothing else.', here);
    const { name, trigger, what, body } = s as Record<string, unknown>;
    if (typeof name !== 'string' || !SKILL_NAME.test(name)) return bad('A skill is named in lower case with hyphens, as in weekly-review.', `${here}.name`);
    if (out.some((o) => o.name === name)) return bad(`Two skills are both called ${name}.`, `${here}.name`);
    if (typeof trigger !== 'string' || trigger.trim() === '' || [...trigger].length > 400) return bad('A skill says the moment to reach for it, in at most 400 characters.', `${here}.trigger`);
    if (what !== undefined && (typeof what !== 'string' || what.trim() === '' || [...what].length > 200)) return bad('A skill says what it is in a line of at most 200 characters.', `${here}.what`);
    if (typeof body !== 'string' || body.trim() === '' || [...body].length > PACK_SKILL_BODY_MOST) return bad(`A skill's steps are text of at most ${PACK_SKILL_BODY_MOST} characters.`, `${here}.body`);
    if (`${trigger}\n${body}`.split(/\s+/u).some((w) => looksLikeCredential(w)))
      return bad('A skill holds something that reads as a key, and a key never travels in an add-on. Take it out.', `${here}.body`);
    out.push({ name, trigger: trigger.trim(), ...(typeof what === 'string' ? { what: what.trim() } : {}), body });
  }
  return ok(out);
}

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
   * The pack's name as a person reads it ("HSBC Egypt alerts"), when its file gives one. A held message's reason and the
   * inbox's report name a pattern by it rather than by an id. Kept out of the checksum, as `provides` is.
   */
  title?: string;
  /**
   * The settings a person can change without editing the file, by name. Absent when the pack declares none.
   *
   * A CLOSED SUBSET OF THE FIELD TYPES (text, enum, bool, money, day and duration), each with an optional
   * default. A declaration reads one as `{{config:<key>}}`, and the value is written into the
   * declaration when the pack is planned and installed. `readConfig` in the kernel checks the map.
   */
  config?: Record<string, ConfigDecl>;
  /**
   * What a person calls each list this pack declares, many and one, by list id: `{ things: { name: 'Projects', one:
   * 'project' } }`. Absent when it says none.
   *
   * THE WORDS A RENAME STARTS FROM, SAID BY THE PACK THAT OWNS THE LIST. They were a table in code for the six modules,
   * so a stranger's add-on could not offer its lists for renaming at all. Only the lists a person would rename are
   * here: a list the pack keeps for its own sums is left out, and gets no box on the words screen.
   */
  words?: Record<string, ListWords>;
  /**
   * What this version changed, in its author's words, at most `CHANGES_MOST` characters. Absent when the file says none.
   * Kept out of the checksum, as `title` is: a note about the pack is not the pack.
   */
  changes?: string;
  /**
   * The skills this pack gives the agents of the record it is installed in, each with its text: a name, the moment to
   * reach for it, a line on what it is, and the steps (`body`). Absent when it gives none.
   *
   * THE TEXT IS REVIEWED LIKE EVERYTHING ELSE IN THE FILE (the Kennel's operator reads a waiting file whole), and
   * INSTALLING ASKS: the plan names each skill and what it is for before anything is written, and one the record already
   * holds by that name is left as it is. In the checksum, because a skill's steps are what an agent will do.
   */
  skills?: PackSkill[];
  /**
   * The declarations this version stops declaring and gives to another pack, by id: `{ 'register.holdings': 'holdings' }`.
   * Absent when it hands nothing.
   *
   * WITHOUT IT A LIST WITH ROWS COULD NEVER LEAVE A PACK. The owner's update
   * dropping it was `WOULD_ORPHAN`, and the pack declaring it was `PROVIDES_CONFLICT` for as long as the owner held it,
   * so both orders were refused and "move them first" had nowhere to move them to.
   *
   * `hands` AND NOT `moves`, `to` OR A KEY ON THE RECEIVING PACK. Only the pack that owns a declaration can let it go,
   * so the word belongs in the old pack's file and reads there as the sentence it is: money-core hands holdings to
   * holdings. A receiving pack that could claim a declaration would be any stranger's file claiming anybody's list, and
   * `moves` reads as though the rows move, when they are the one thing that stays exactly where it was.
   */
  hands?: Record<string, string>;
  /**
   * Fields and enum values this pack lays on lists other packs own, by list id: `{ 'register.people': { values: { role:
   * ['family'] } } }`. Absent when it lays nothing.
   *
   * WITHOUT IT EVERY FIRST-PARTY LIST WAS THE ONLY PLACE A FIELD COULD LIVE. A pack
   * declaring `register.things` with one more field was `PROVIDES_CONFLICT`, rightly, and a pack that carried the same
   * wish under a key of its own installed `ok` and dropped it without a word, so `domain` was then `FIELD_UNKNOWN` on
   * the first write. A household's roles, a domain on a project and an importer's fields had nowhere to go.
   *
   * `extends` AND NOT `adds`, because `Diff.adds` is already the declarations a pack adds and `kept[].adds` the owner's
   * additions a rebase kept: a third meaning would make every diff read two ways. The body is the one an agent's
   * `{ add: { register, fields, values } }` carries (`addTo` in the kernel's `govern.ts`), less `register`, which is the
   * key. Only an optional field and a value added to a closed list: both leave every row readable and every writer free
   * to go on writing what it wrote.
   */
  extends?: Record<string, Extension>;
  /**
   * Blocks this pack adds to pages other packs declare: `[{ page: 'page.project', block: { kind: 'cards', ... }, after:
   * 'Where it stands' }]`. Absent when it adds none.
   *
   * WITHOUT IT A PACK COULD ONLY DRAW ON A PAGE OF ITS OWN. project-brief laid a one-line
   * summary, a plan and blockers on every project and drew them on a Briefs page, because the project page is
   * Portfolio's and a second template over projects fought it for each project's address.
   *
   * KEPT IN THE MANIFEST AND NEVER WRITTEN INTO THE PAGE, so the page stays its own pack's to update and the addition
   * goes when this pack does. The kernel lays it among the page's blocks each time the page is read (`page-adds.ts`).
   */
  adds?: PageAddition[];
  /**
   * The widgets this add-on ships for the widget sheet, templates and never placements (`pack-widgets.ts`). Absent when
   * it ships none. In the checksum: a widget is drawn as it is written.
   */
  widgets?: PackWidget[];
  /**
   * The places of yours this add-on reads or changes that are not its own, as declaration ids (`register.transactions`,
   * `metric.cash-now`, `page.project`), when its file says them. Held to what its declarations name (`uses.ts`): a file
   * that names a place it did not list here is refused. In the checksum, because it is what a person is asked.
   */
  uses?: string[];
};

/**
 * What one pack lays on one list another pack owns: optional fields after the list's own, values after a closed list's
 * own, and for those values the words a person reads them by (`labels.<field>.<value>`), as a field's own `labels` has
 * them.
 */
export type Extension = { fields?: Record<string, Json>[]; values?: Record<string, string[]>; labels?: Record<string, Record<string, string>> };

/**
 * One block a pack adds to another pack's page: the page's declaration id, the block as a page's own would say it, and
 * the heading of the page's block it goes after, or last when there is none or the page no longer has it.
 */
/** One block a pack adds to another pack's page, or one column it adds into a block there (`add-column.ts`). */
export type PageAddition = { page: string; block: Record<string, Json>; after?: string; note?: string } | PageColumnAddition;
export { ADD_COLUMNS_MOST, columnsFault, readAddColumn, type PageColumnAddition } from './add-column.ts';
import type { PackWidget } from './pack-widgets.ts';
import { readPackWidgets } from './pack-widgets.ts';
export { PACK_WIDGET_FOR, PACK_WIDGET_GROUPS, PACK_WIDGET_SIZES, PACK_WIDGETS_MOST, readPackWidgets, type PackWidget, type PackWidgetBlank } from './pack-widgets.ts';

/* WHO HOLDS A LIST'S ROWS is `hand.ts`'s, so a page that reads it does not carry the planner. */
export { handOf, type Hand } from './hand.ts';

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
  /**
   * The `pack` rows. `requires` is each one's `requires.packs` as its stored manifest says it: what that pack asks of the
   * others, which `plan` holds the pack being planned to (`dependents`).
   *
   * OPTIONAL, as `used` is, so every caller that hands in `kernel.packs()` keeps compiling. A row without it names no
   * range, and a plan asked of such a record says nothing about the packs that lean on the one it updates, which is how
   * a record holding bank-hsbc-eg 1.0.0 on `^1.8.0` took money-core 2.0.0 without a word (`held-pack-range.test.ts`).
   *
   * `laid` IS WHAT EACH PACK LAID THROUGH `extends`, as its stored manifest says it: the ids of the fields, by list id.
   * It is the one thing that tells a field a pack laid from a field the list declares itself, because the list a pack
   * extends is staged with no pack and reads as the record's own from then on. Without it a pack could never change a
   * field it had laid: its next version, changing that field in any way, was refused `PROVIDES_CONFLICT` as though the
   * list's own pack had declared it. Optional for the reason `requires` is, and a row
   * without it laid nothing a plan can see.
   */
  packs: { id: string; version: string; requires?: Readonly<Record<string, string>>; laid?: Readonly<Record<string, readonly string[]>> }[];
  declarations: { id: string; version: number; kind: DeclKind; pack_id: string | null; body: string; checksum: string }[];
  rows: Record<string, number>;
  /**
   * How many rows of `list` hold each value of each of `fields`, by field id and then value: one `GROUP BY` over the list,
   * asked only of a list a plan would take a value off (`laidBack`). `null` when the record cannot say for that list.
   *
   * `held` COUNTS A DELETED ROW, AND `binned` SAYS HOW MANY OF THEM ARE. A deleted row holds its values until the purge,
   * as the kernel's `WOULD_ORPHAN` counts it: the first query left the bin out, and People 2.0.0 took
   * `registrar` off a list whose one registrar row was deleted, so the row's restore, and every edit after it, was
   * `ENUM_VALUE_UNKNOWN` "role has no value registrar" (`test/stays-holding.test.ts`).
   *
   * WHAT DECIDES WHETHER A VALUE AN UPDATE TAKES OFF STAYS. `rows` stood in for it, so a Personal record whose three
   * People rows were all Family was filed as keeping Agency, and Decide said the list "holds 3 rows that may use it"
   * when none did (`test/stays-holding.test.ts`).
   *
   * OPTIONAL, as `used` is: a caller that cannot count keeps every value on a list that holds rows, which is the side of
   * the line where no later edit is refused `ENUM_VALUE_UNKNOWN`.
   */
  holding?: (list: string, fields: readonly string[]) => Record<string, Record<string, { held: number; binned: number }>> | null;
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
   * What the installed packs' manifests hand on, by declaration id: the pack each `hands` sends it to (`handedOf`).
   *
   * WHAT LETS A LIST GO TO A PACK THE RECORD ALREADY HAS. Founder 2.0.0 hands `register.organisations` to People, and a
   * record holding Founder holds People too. Without this the hand was planned as a retire, because the receiver's later
   * updates could not tell the list was given to it: it sat under People's name, its file did not declare it, and every
   * update of People was `WOULD_ORPHAN` (`handover.test.ts`). With it, the receiver's plan reads that an installed pack
   * handed the list to it and leaves it where it is, so the giver may hand it, rows and all, and the receiver's version
   * that declares it takes it as its own.
   *
   * OPTIONAL, as `used` is: a caller that cannot say gets a handover to an installed pack planned as the retire it was.
   */
  handed?: Readonly<Record<string, string>>;
  /**
   * The title of the row an id names, so an action's key line says the project by name and not by a row id.
   * OPTIONAL: without it the id is said as the declaration wrote it.
   */
  nameOf?: (ref: string) => string | null;
  /**
   * What the record's live keychain entry for a label says it opens, so a script's line names the host each key goes to
   * (`scriptEgress` in the kernel), as a proposal's line does when the kernel reads its own keychain.
   *
   * OPTIONAL, as `nameOf` is: without it the line says "to the host its keychain entry opens", which is where the answer is.
   */
  opensOf?: (label: string) => string | null;
  /**
   * The declarations this record has put to work in a way `rows` cannot show, by id: an ingest that has filed a row
   * (`ingest_receipt`), and a webhook door that holds a token (`heldDigest` in `@braindog/record`).
   *
   * WHAT DECIDES WHETHER A `hands` ENTRY IS HANDED OR RETIRED. money-core 1.8.0 handed all twelve HSBC Egypt doors on
   * every record that updated, so a record that had never seen an Egyptian bank ended with twelve live patterns under
   * `bank-hsbc-eg`, a pack it never installed, reported as on. A handover
   * keeps what somebody relies on, a list's rows or the address his Shortcut posts to, and a door nobody used has none.
   *
   * OPTIONAL, as `detached` is: a caller that cannot say gets every entry handed, which is what `plan` did before it asked.
   */
  used?: readonly string[];
  /**
   * The webhook doors that hold a live address now, by id (`heldDigest` in `@braindog/record`): the token half of `used`
   * alone. `used` keeps every door that ever filed, so a door whose last text came a year ago and whose address a retire
   * broke reads as one in use, and an update dropping it was said to stop texts that no longer come.
   *
   * OPTIONAL: a caller that cannot say has `used` read in its place, which marks more doors live and never fewer.
   */
  addressed?: readonly string[];
  /**
   * A `where` sentence read against a list, as the kernel reads it: the compiled predicate, or `null` when it does not
   * read (a title no row holds yet still reads, as the kernel's `stranded` lets it). `@braindog/where`'s `parseWhere`
   * is the answer; the record hands it in.
   *
   * WHAT `misreads` IS ASKED WITH. `declare` depends on the kernel and the ports and on nothing else, and the kernel does
   * not export its compiler, so a plan cannot parse a figure's words by itself. It needs to, because a widening that
   * turns `lane is earning money` from 1 into 0 compiles either way and is only seen by parsing the sentence twice.
   *
   * OPTIONAL, as `nameOf` is: a caller that cannot parse gets a plan that names no misread, which is what it said before.
   */
  sentence?: (where: string, schema: SentenceSchema) => unknown;
};

/**
 * A list's fields as `where` reads a sentence against them. `@braindog/where`'s `Schema`, as far as a pack's body can say
 * it, written out because `declare` does not depend on `where`; one of these is assignable to the other.
 */
export type SentenceSchema = {
  register: string;
  state?: string;
  series?: boolean;
  fields: Record<string, { type: string; of?: string; to?: string; values?: readonly string[]; label?: string; labels?: Readonly<Record<string, string>> }>;
};

export type Diff = {
  /** The parts the plan took out until the record holds what they wait for (`when: { holds }`, when-49), by place. */
  waiting: { at: string; holds: string[] }[];
  pack: { id: string; version: string; author: string; license: string; summary: string; checksum: string; source: PackSource };
  installed_version: string | null;
  direction: 'install' | 'upgrade' | 'downgrade' | 'reinstall';
  requires: {
    format: { wanted: number; has: number; ok: boolean };
    primitives: { wanted: number; has: number; ok: boolean };
    packs: { id: string; range: string; installed: string | null; ok: boolean }[];
  };
  /**
   * Every held pack whose `requires.packs` names this one: its version, the range it asks for, `ok` whether this plan's
   * version satisfies that range, and `was` whether the version held now does. Reported here, and refused by `install`
   * as `PACK_REQUIRED` when this plan turns a true requirement false.
   *
   * THE MIRROR OF `requires.packs`, which asks only what the pack being planned needs of the others. Measured: a
   * record at money-core 1.8.0 holding bank-hsbc-eg 1.0.0 (`^1.8.0`) planned money-core 2.0.0 with nothing
   * unmet, installed it, and was left holding a pack whose requirement was false (`held-pack-range.test.ts`).
   *
   * EMPTY WHEN `Installed.packs` CARRIES NO `requires`, because there is no range to read.
   */
  dependents: { id: string; version: string; range: string; ok: boolean; was: boolean }[];
  /**
   * `handed` IS A DECLARATION ANOTHER PACK HANDED THIS ONE, which is live already, under this pack's name, while this
   * pack is not installed. It is new to the pack and not to the record, so it plants no example rows, and its rows and
   * their history stay as they are.
   */
  adds: { id: string; summary: string; handed?: true }[];
  /**
   * `from` IS THE PACK THIS ONE TAKES THE DECLARATION OVER FROM, because that pack hands it here (`Installed.handed`).
   * Absent on a change to this pack's own declaration.
   */
  changes: { id: string; from_version: number; summary: string; from?: string }[];
  /**
   * What this version stops declaring. `to` IS THE PACK IT HANDS THE DECLARATION TO (the manifest's `hands`): it is not
   * retired and orphans nothing, it is staged again under `to` with `body`, the live body as JCS text with `pack` set to
   * `to`, and it stays live until and after that pack is installed.
   *
   * `live` IS A DOOR OR PATTERN THE RECORD IS USING that this version retires outright (`PlanOptions.live`): texts still
   * arrive there, and after the update nothing files them. Never on one handed on, which stays live. Absent when the
   * caller passed no `live`, so a plan that cannot say marks nothing.
   */
  retires: { id: string; rows: number; to?: string; body?: string; live?: true }[];
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
   * `value`). Measured on `fx.source`: a plan with no conflicts, then `FIELD_UNKNOWN`.
   *
   * `changed` WITH `field` AND NOTHING ELSE is a list the owner added `field` to, and this version brings a field of its
   * own under the same id. Two fields cannot share an id, and the rows already written under the owner's would be read
   * as the pack's, so it stays refused where every other addition is rebased.
   *
   * `handed` IS A DECLARATION ANOTHER PACK HANDED THIS ONE THAT THIS PACK'S FILE DOES NOT DECLARE, on its first install;
   * `pack` is this pack, which holds it already. Planned as this pack's own retire, it orphaned the rows of the list a
   * stranger's `hands` had put under its name, or dropped an empty one without a word (`handover-guards.test.ts`).
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
    handed?: true;
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
  kept: { id: string; adds?: string[]; rebased?: string; words?: string[]; rail?: true }[];
  /**
   * What this version adds to a page the owner changed, which the install keeps as the owner left it: the title, when
   * the update gives the page another one, and each block the update's page has that the page the edit started from
   * and the owner's page both lack. Absent when no kept page misses anything.
   *
   * SAID, BECAUSE A KEPT PAGE WAS KEPT SILENTLY. Founder 2.6.0 over a Home somebody had rearranged installed, and the
   * Late table and the title Today, the two things the version was written for, reached nobody: Decide said the page
   * was kept and not what it went without. One question for the whole update (`keptQuestion`), never one a page.
   *
   * ONLY WHAT IS ADDED. A block the update rewrites in place is on the owner's page already, in the shape they kept,
   * and one the owner took off before is not offered back: it was in the body the edit started from.
   */
  brings?: Brought[];
  /**
   * The enum values this version takes off a list that holds rows, which stay on it: `values` names each as
   * `<field>.<value>`, laid after the update's own values with the label the list had for it.
   *
   * BY ROW WHERE THE RECORD CAN COUNT, and `holding` is how many rows hold each kept value, keyed as `values` is, the bin's
   * included, and `binned` how many of those are deleted, absent when none is. `rows` is the list's live count, so a
   * value may stay on a list whose `rows` is 0 when its only holders are in the bin.
   * A value no row holds goes, as the update asked. Taken off a list whose rows hold it, every later edit of such a row
   * was `ENUM_VALUE_UNKNOWN`, whatever field the edit was about (`update-keeps-value.test.ts`). A record that cannot
   * count (`Installed.holding` absent or `null`) keeps every value by list, as before, and `holding` is absent: kept when
   * nobody used it, a value costs a word in a picker.
   *
   * `body` IS THE LIST AS IT WILL BE LIVE, as JCS text, for a list this pack owns: `install` stages it as the pack's body
   * of the list, in place of the file's, and the next update meets the value as the pack's and lays it back again while
   * the list holds rows. Staged with no pack, as it once was, it read as changed in the
   * app, and every later update of the pack was filed for Decide as keeping the owner's edit. A list the owner added to
   * has no `body` here, because the value is laid into its `kept[].rebased`.
   */
  stays: { id: string; values: string[]; rows: number; holding?: Record<string, number>; binned?: Record<string, number>; body?: string }[];
  /**
   * What this pack lays on each list it `extends`: `adds` names what is new to the list (`domain`, or `role.family` for a
   * value) and each field this pack laid before and now lays in another shape, and `body` is the live list with those
   * laid on it, as JCS text, absent when the list has them all already. `refusal` is why `install` will not lay them,
   * which is only ever the list's own shape: a field id it has in another shape that is not this pack's alone, a
   * value for a field that is not a closed list or not there, or a label for a value the list declares itself or that
   * reads by other words already. A label laid on a value that had none is named in `adds` as the value is.
   *
   * `install` STAGES `body` WITH NO PACK, as it stages a rebased list, so the kernel is handed an ordinary register body
   * and the list reads as the record's own from then on. The owning pack's next update keeps the additions through
   * `detached()` and `rebased`, the road the owner's own additions already take (`pack-extends.test.ts`).
   *
   * NOT UNDER THE LIST'S OWN PACK, which was the first answer tried: staged under Portfolio,
   * Portfolio's next minor planned Projects as a plain change and installed it without `domain`, under a row holding
   * one. `detached()` is the only thing a plan is handed that says which fields are the list's own, and only while the
   * row has no pack. So the other half, Decide saying a rebased list's update is not taken, is the
   * arranger's to fix: a `kept` entry with `rebased` is an update that installs.
   *
   * WHAT TURNING THE EXTENDING PACK OFF OR TAKING IT OUT DOES: NOTHING TO THE LIST. Its fields and values stay and are
   * the record's own. Rows hold values in them, and a field taken off the rows that hold it is the break measured for
   * a value: an edit to a row's `note` refused over a field the edit never touched. A
   * person who wants one gone takes it off the list, which asks the question a pack cannot, whether anything uses it.
   */
  extends: { id: string; adds: string[]; body?: string; refusal?: Refusal }[];
  /**
   * Each block this pack adds to another pack's page (`Manifest.adds`), in the order it wrote them: the page, the block's
   * kind and heading, where it goes, and `line`, the sentence the plan and the install sheet say for it, "adds a block to
   * <page> from <pack>". `unresolved` is an addition whose page the record lacks, and `refusal` why `install` will not
   * take the pack: that page missing, or a block the page could not draw.
   *
   * ABSENT WHEN THE PACK ADDS NOTHING, so every plan of a pack without `adds` reads exactly as it did before the key.
   * Nothing is staged for it: the manifest the install stores is where the kernel reads it from.
   */
  page_adds?: { page: string; kind: string; heading?: string; after?: string; line: string; unresolved?: true; refusal?: Refusal }[];
  seeds: { count: number; registers: { register: string; rows: number }[] };
  /**
   * The skills this version gives the record's agents, each by name with the moment to reach for it and what it is,
   * so installing asks before an agent is handed steps (the text itself is in the file, which the plan links). Absent
   * when it gives none. One the record already holds by that name is left as it is.
   */
  skills?: { name: string; trigger: string; what: string | null }[];
  /**
   * The widgets this version ships for the widget sheet, each by id and title, so the install can say they are there to
   * add. Absent when it ships none. Nothing is placed: a widget goes on Today only when somebody adds it.
   */
  widgets?: { id: string; title: string }[];
  /** Every rule that would generate rows, with the ceiling it declares. */
  spawns: { rule: string; register: string; bound: number; when: string }[];
  /**
   * Every scheduled action that would leave the record: a `pull`, a `call` or a `poll`, with the host it
   * calls, how often, and the key it sends by label. `line` is the diff's own sentence for it, and it
   * reads `CALLS OUT <host> · every <n> · grant "<label>"` (`04 §7`).
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
    /** The project action's own approval line, when it sends a key. */
    key_line: string | null;
    /** Against what is installed: a new action, one whose host, key or fields differ, or the same. */
    change: 'new' | 'changed' | 'same';
    /**
     * What it files: the list, the project or `everywhere`, and each measure, by name (`writesOf`). ABSENT FOR AN
     * ACTION THAT FILES NOTHING, or one whose mapping names no field, so a plan of an action that names nothing it
     * writes reads as it did before the key.
     */
    writes?: Writes;
    /** The sentence under the line, "Writes Numbers on Oxbow: revenue, customers, 3 more." Beside `writes`. */
    writes_line?: string;
    /** Its interval is the provider's own floor (`floor:`), the least it may run at: "every 6h, the provider's minimum". */
    at_floor?: true;
  }[];
  /**
   * Each script this install puts in or changes: its source whole, its size in bytes, and on an update only the lines
   * that changed (`scriptSources`). An unchanged script is not here. Empty when the pack carries no script.
   */
  scripts: ScriptSource[];
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
  /** Rows that would be left under a retired register. Above zero is a refusal at install, unless he pressed it (`InstallOptions`). */
  orphans: number;
  /**
   * Each list this version retires while it still holds rows, as the step Decide and Add-ons show: `retire` is
   * the list, `rows` how many it holds, `stays` that every one of them stays, and `line` the sentence, "Retires Services.
   * Your 41 items stay, and the list can be put back."
   *
   * A REMOVAL, NOT A LOSS. Retiring a list never deletes what is in it, as an uninstall does not: the declaration goes and
   * the rows stay where they are, so installing a version that declares the list again puts it back over them. So the
   * plan says it as a step he can take, and `install` takes it only on his press (`retireWithRows`). Without the press
   * it is `WOULD_ORPHAN` exactly as before, so an update nobody pressed never takes it (`@braindog/seed` `losses`).
   *
   * ABSENT WHEN NOTHING RETIRES OVER ROWS, so every other plan reads as it did. `orphans` is the sum of `rows` here.
   */
  removals?: { retire: string; name: string; rows: number; stays: true; line: string }[];
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
   * A reader whose words change meaning when this version opens a closed list to text. Reported here, refused by
   * `install`, whether or not the list holds rows yet, as the kernel's `stranded` refuses it.
   *
   * `id` and `field` are the list and the field it opens; `reader` is a live declaration this install does not rewrite,
   * `name` what the owner calls it, and `at` and `where` the sentence. `written` is the word as the sentence has it,
   * which free text will compare as it is, and `stored` the value only the closed list read it as. Measured on `lane`:
   * `lane is earning money` counted 1 row under the enum and 0 after the update, with nothing refused on the pack path
   * (`test/plan-widen.test.ts`).
   */
  misreads: { id: string; field: string; reader: string; name: string; at: string; where: string; written: string; stored: string }[];
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
   * `given` is a value handed to this plan with the install (`PlanOptions.settings`), `default` is this version's
   * default, and `none` is a setting with neither, which no declaration reads, because `normalise` refuses a
   * placeholder whose setting has no default. `kept` and `given` are both chosen, and the install keeps both.
   */
  config: { key: string; type: string; value: Json; from: 'kept' | 'given' | 'default' | 'none' }[];
  /**
   * The lists this pack points at that the record does not hold and the pack does not declare.
   * Reported here, refused by `install` and by the record's `planPack` as `REGISTER_UNRESOLVED`.
   * `provider` is the first-party pack that declares the list, when there is one.
   */
  unresolved: { register: string; at: string; provider: string | null }[];
  base: { format: number; primitives: number; packs: [string, string][]; declarations: [string, number, string][] };
  /**
   * An address the add-on holds where none may be, with every setting filled in, as `install` will refuse it
   * (`address.ts`). Absent when it holds none, which is every plan made before the check and every add-on that passes.
   */
  remote?: Refusal;
  planHash: string;
};

/** `handed` is how many declarations this install gave to another pack, and is absent when it gave none. */
/** `refreshed` is how many rows it planted before this update went over, when it went over any. */
/**
 * What an install did. `rows_kept` is each list it retired over rows on his press (`InstallOptions.retireWithRows`) and
 * how many rows stay in it, as `Retired` says it for an uninstall; absent when it retired none.
 */
export type Applied = { pack: string; version: string; declarations: number; seeds: number; skills?: number; retired: number; handed?: number; refreshed?: number; rows_kept?: Record<string, number> };
/** One kept page and what this version adds that it lacks (`Diff.brings`): a block by its kind and its heading. */
export type Brought = { id: string; title?: string; blocks: { kind: string; heading?: string }[] };

/** The one question an update asks about the pages it kept: `pages` are the ids, and `line` is what Decide says. */
export type KeptQuestion = { about: string; line: string; pages: string[] };

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
  stage: (batch: readonly StagedDeclaration[]) => Promise<Result<() => Result<unknown>>>;
  /** The caller's transaction. A throw inside it rolls back; a returned value commits. */
  transaction: <T>(fn: () => T) => T;
  /** Rebuild whatever the host caches from the declarations, once the transaction has committed. */
  reload: () => void;
  /**
   * Retire declarations. `by` is who, when the caller knows better than the host's own bound caller; a host writes the
   * `declare` line under it, or under its bound caller when it is left out.
   */
  retire: (ids: readonly string[], by?: { actor: string; suggestion?: string }) => Result<unknown>;
  seed: (register: string, fields: Record<string, Json>, note: string | undefined) => Result<unknown>;
  /**
   * One of the skills the add-on gives the record's agents, written into Skills as a row the record manages, or `false`
   * when the record keeps no Skills or already holds a skill by that name (it is left as it is). OPTIONAL: a host
   * without it gives no skill, and the add-on installs all the same.
   */
  giveSkill?: (skill: PackSkill, pack: string) => boolean;
  /**
   * What this add-on remembers planting: `planted` of its stored manifest, as it was written (`plantedOf` reads it).
   *
   * OPTIONAL, as `today` is. A host without it remembers nothing across an update, so no row is gone over, and the
   * update writes the manifest without what the last one remembered.
   */
  planted?: (pack: string) => unknown;
  /**
   * The add-on's update going over a row it planted before: the kernel's update of `row` in `register` with these
   * fields, and with `pack: true` in the write, so a field the list says is written `once` stays as the row holds it
   * It answers `ok(null)` for a row that is no longer live: somebody removed it, and it stays removed.
   *
   * OPTIONAL, and an install with a host that leaves it out writes over no row at all, as every install did before.
   */
  reseed?: (register: string, row: string, fields: Record<string, Json>) => Result<unknown>;
  /**
   * Install day as the record's own clock reads it, YYYY-MM-DD: what a seed's `{ day: '+3' }` counts from. OPTIONAL, so
   * every host written before a seed could say a day keeps compiling; without it the day is today in UTC.
   */
  today?: () => string;
  /**
   * The `pack` row, and the ids it claims — read on uninstall. `approved` is the calls-out lines the owner approved
   * with this install, word for word, when it asked for any.
   */
  remember: (row: { id: string; version: string; source: string; ref: string | null; manifest: string; checksum: string; approved?: readonly string[]; waiting?: readonly { at: string; holds: string[] }[]; because?: string }) => void;
  forget: (id: string) => void;
  claimed: (pack: string) => string[];
  /**
   * Whether this key is one the install can actually be approved on: `null` when the keychain holds it AND a scheduled
   * run could open it, otherwise the sentence to show. OPTIONAL: a host without a keychain checks nothing.
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
  /* WHAT THIS VERSION CHANGED, read where the file is read, so the note is on the manifest a record keeps. */
  const changes = readChanges(doc.changes);
  if (!changes.ok) return changes as Result<Pack>;
  /* SKILLS THE PACK GIVES ITS AGENTS, with their text: read here so the checksum holds them and the plan names them. */
  const skills = readPackSkills(doc.skills);
  if (!skills.ok) return skills as Result<Pack>;
  /* THE WIDGETS IT SHIPS FOR THE SHEET, read here so the checksum holds them and the plan names them. */
  const widgets = readPackWidgets(doc.widgets);
  if (!widgets.ok) return widgets as Result<Pack>;
  /* THE PLACES OF YOURS IT SAYS IT USES, held to what its declarations name when it says them (`uses.ts`). */
  const uses = usesSaid(doc);
  if (!uses.ok) return no<Pack>(uses.refusal.code, uses.refusal.fix, { at: 'uses' });
  const unasked = usesFault(doc);
  if (unasked) return no<Pack>(unasked.code, unasked.fix, { at: 'uses' });
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
    ...(typeof doc.title === 'string' && doc.title.trim() !== '' ? { title: doc.title.trim().replace(/\s+/g, ' ') } : {}),
    /* ONLY WHEN THERE ARE SETTINGS, so a pack written before `config:` existed keeps its checksum. */
    ...(Object.keys(settings.value).length > 0 ? { config: settings.value } : {}),
    ...(changes.value === null ? {} : { changes: changes.value }),
    ...(skills.value.length === 0 ? {} : { skills: skills.value }),
    ...(widgets.value.length === 0 ? {} : { widgets: widgets.value }),
    ...(uses.value === null ? {} : { uses: uses.value }),
  };

  /* A PACK WHOSE ONLY CONTENT IS `extends`, `adds` OR `hands` CHANGES SOMETHING (a pack that hands everything it had to another, Roadmap 2.0.0, is the add-on that is part of Work now), so it has no declarations to list and is not
     refused for it here. Whether it lays or adds anything is asked once those are read, below. */
  /* AND ONE THAT ONLY SHIPS WIDGETS, a widget shared as an add-on (`braindog addon new --from-widget`), changes the sheet. */
  const reaches = doc.extends !== undefined || doc.adds !== undefined || doc.hands !== undefined || manifest.widgets !== undefined;
  const raw = doc.declarations ?? (reaches ? [] : undefined);
  if (!Array.isArray(raw) || (raw.length === 0 && !reaches))
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

    /* `once` NAMES THE FIELDS AN UPDATE NEVER PATCHES ON A ROW THAT ALREADY HOLDS THEM, and only a list has
       fields to name. It is held to the list's own fields here, where the file is read, so a field the list does not
       have is refused by its name before anything is planned. It stays on the declaration, which is where the update
       path reads it. */
    if (body.once !== undefined) {
      const at = `${declId}.once`;
      const called = typeof body.name === 'string' && body.name.trim() !== '' ? body.name : name;
      if (kind !== 'register') return malformed(`Only a list says which of its fields are written once, and ${called} is a ${kind}.`, at);
      const once = body.once;
      if (!Array.isArray(once) || once.length === 0 || once.some((f) => typeof f !== 'string') || new Set(once).size !== once.length)
        return malformed(`${called} says the fields written once as a list of field ids, each said one time, such as once: [opened].`, at);
      const own = listOf(body, 'fields').map((f) => (isObject(f) ? String(f.id ?? '') : ''));
      const stranger = (once as string[]).find((f) => !own.includes(f));
      if (stranger !== undefined)
        return no<Pack>('FIELD_UNKNOWN', `${called} has no field called ${stranger}, so it cannot be written once. Its fields are ${own.join(', ')}.`, { at, allowed: own });
    }

    /* A REGISTER SAYS `id` ONCE IT IS STORED, and every other kind keeps its own word. That is the
       kernel's convention and it is a good one — a page carrying its own name twice would have a
       copy that drifts — but a register is the one whose word is the same as the kind, so the
       document says `register: obligations` and the record stores `id: obligations`. Normalising it
       here is what this function is called. */
    const { register: _named, ...rest } = body as Record<string, Json>;
    const stored = kind === 'register' ? ({ id: name, ...rest } as Record<string, Json>) : body;
    const canonical = canonicalise(stored);
    if (canonical === null) return malformed(`${declId} holds something BrainDog cannot write down.`, declId);
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

  /* WHAT IT LAYS ON OTHER PACKS' LISTS IS READ ONCE WHAT IT DECLARES IS KNOWN, for `hands`' reason: a list this pack
     declares takes its fields in its own declaration. Kept in the manifest and so in the checksum, since two files that
     extend differently install differently. */
  if (doc.extends !== undefined) {
    const read = readExtends(id, doc.extends, seen);
    if (!read.ok) return read as Result<Pack>;
    if (Object.keys(read.value).length > 0) manifest.extends = read.value;
  }
  /* WHAT IT ADDS TO OTHER PACKS' PAGES, read for the same reason and kept in the checksum for the same reason: a page
     this pack declares takes its blocks in its own declaration. */
  if (doc.adds !== undefined) {
    const read = readAdds(id, doc.adds, seen);
    if (!read.ok) return read as Result<Pack>;
    if (read.value.length > 0) manifest.adds = read.value;
  }
  if (declarations.length === 0 && manifest.extends === undefined && manifest.adds === undefined && manifest.hands === undefined && manifest.widgets === undefined)
    return malformed(`${id} declares nothing, so installing it would change nothing.`, 'declarations');

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
  /* `words` IS WHAT A PERSON CALLS EACH OF ITS LISTS, MANY AND ONE, and only its own: a pack that could name another's
     list would rename it for everybody who holds both. Both words are said, because the screen that renames a list
     shows both boxes and each starts from the pack's own word. Kept in the manifest and so in the checksum. */
  if (doc.words !== undefined) {
    if (!isObject(doc.words)) return malformed('`words` says what a person calls each list, like things: { name: Projects, one: project }.', 'words');
    const words: Record<string, ListWords> = {};
    for (const [list, said] of Object.entries(doc.words)) {
      const at = `words.${list}`;
      if (!registers.has(list))
        return no<Pack>('FIELD_UNKNOWN', `${id} gives words to ${list}, which it does not declare. A pack names its own lists.`, { at, allowed: [...registers.keys()] });
      const word = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && !/[\r\n]/u.test(v) && new TextEncoder().encode(v).length <= 80;
      if (!isObject(said) || Object.keys(said).some((k) => k !== 'name' && k !== 'one') || !word(said.name) || !word(said.one))
        return no<Pack>('VALUE_MALFORMED', `${at} says what many are called and what one is called, each a word or a few: { name: Projects, one: project }.`, { at });
      words[list] = { name: said.name.trim(), one: said.one.trim() };
    }
    if (Object.keys(words).length > 0) manifest.words = words;
  }
  /* A CARDS OR TABLE BLOCK'S `group` IS A LINK, A CHOICE OR THE STATE OF THE LIST IT READS, asked here of the lists this pack declares (`cards.ts`). */
  for (const d of declarations) {
    const grouped = d.kind === 'page' ? cardsFault(d.id, d.body, registers) : null;
    if (grouped) return grouped as Result<Pack>;
  }
  const seeds: Seed[] = [];
  /* A FEW EXAMPLES PER LIST, NOT ONE. A guide opens on the six stages a project passes and a board on more than one
     ticket, so one row per list made a use case open half told. The ceiling keeps an example set an example. */
  const seeded = new Map<string, number>();
  /* Each seed's key with the list it is in, and each ref with where it stands and the list its field points at. */
  const seedKeys = new Map<string, string>();
  const seedRefs: { at: string; named: string; key: string; to: string }[] = [];
  const nameOfList = (list: string): string => {
    const name = registers.get(list)?.name;
    return typeof name === 'string' && name !== '' ? name : list;
  };
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

    /* ITS KEY IS THE FILE'S OWN NAME FOR THE ROW, said once, so a ref to it means one row. */
    if (seed.key !== undefined) {
      if (typeof seed.key !== 'string' || !NAME.test(seed.key))
        return malformed(`An example row's key is a short name in lower case, such as key: first-visit.`, `seeds.${seed.register}.key`);
      if (seedKeys.has(seed.key)) return malformed(`Two example rows are both called ${seed.key}, and a key names one row.`, `seeds.${seed.register}.key`);
      seedKeys.set(seed.key, seed.register);
    }
    /* A DAY FROM INSTALL DAY AND A REF TO ANOTHER SEED, each held to the field it stands in (`SEED_DAY`). A field that
       holds a document may hold any object, so it is left as written. */
    const typed = new Map(listOf(registers.get(seed.register), 'fields').flatMap((f) => (isObject(f) && typeof f.id === 'string' ? [[f.id, f] as const] : [])));
    for (const [field, held] of Object.entries(seed.fields)) {
      const decl = typed.get(field);
      const at = `seeds.${seed.register}.${field}`;
      const named = typeof decl?.label === 'string' && decl.label !== '' ? decl.label : field;
      for (const { value, listed } of seedValues(held)) {
        const type = listed ? decl?.of : decl?.type;
        const day = soleKey(value, 'day') ? value.day : undefined;
        const ref = soleKey(value, 'ref') ? value.ref : undefined;
        if (type === 'document' || (day === undefined && ref === undefined)) continue;
        if (day !== undefined) {
          if (type !== 'day') return no<Pack>('VALUE_MALFORMED', `${named} does not hold a day, so an example row cannot count one for it.`, { at });
          if (typeof day !== 'string' || !SEED_DAY.test(day))
            return no<Pack>('VALUE_MALFORMED', `${named} counts its day from install day as a sign and a number, such as day: "+3" or day: "-1".`, { at });
          continue;
        }
        if (type !== 'ref' || typeof decl?.to !== 'string')
          return no<Pack>('VALUE_MALFORMED', `${named} does not point at a row, so an example row cannot link through it.`, { at });
        if (typeof ref !== 'string') return no<Pack>('VALUE_MALFORMED', `${named} links to another example row by its key, such as ref: first-visit.`, { at });
        seedRefs.push({ at, named, key: ref, to: decl.to });
      }
    }

    seeds.push({
      register: seed.register,
      fields: seed.fields,
      ...(typeof seed.note === 'string' ? { note: seed.note } : {}),
      ...(typeof seed.key === 'string' ? { key: seed.key } : {}),
    });
  }
  /* EVERY REF NAMES A ROW OF THIS FILE, IN THE LIST ITS FIELD POINTS AT. Checked once all the seeds are read, because a
     row may point at one written further down the file. */
  for (const ref of seedRefs) {
    const list = seedKeys.get(ref.key);
    if (list === undefined)
      return no<Pack>('FIELD_UNKNOWN', `${ref.named} links to an example row called ${ref.key}, and no example row in this file has that key.`, { at: ref.at, allowed: [...seedKeys.keys()] });
    if (list !== ref.to)
      return no<Pack>('VALUE_MALFORMED', `${ref.named} points at ${nameOfList(ref.to)}, and the example row called ${ref.key} is in ${nameOfList(list)}.`, { at: ref.at });
  }
  /* AND NO TWO POINT AT EACH OTHER: each row is written once, in its final state, so one of the two has to come first. */
  if (seedOrder(seeds) === null)
    return malformed('Two example rows point at each other, so neither can be written first. Take one of the two links out.', 'seeds');

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
     already in it — hashing both would let one pack have two checksums for one file. `title` IS OMITTED because it is
     how a person reads the pack's name and not what the pack does, and keeping it out leaves every pack installed
     before the title was kept with the checksum it has, rather than showing each titled one as changed. */
  const { provides: _provides, title: _title, changes: _changes, ...hashed } = manifest;
  const canonical = canonicalise({ manifest: hashed, declarations: declarations.map((d) => d.body), seeds });
  if (canonical === null) return malformed('This pack holds something the record cannot write down.');
  return ok({ manifest, declarations, seeds, canonical, checksum: await digest(canonical), source });
}

/**
 * The keys an extension may carry, which are `addTo`'s less `register`, the key it sits under, and `labels`, which names
 * the values it lays: without it a laid value reads as its bare id (`worked`, where the page should say Worked out).
 */
const EXTENSION_KEYS = ['fields', 'values', 'labels'];

/** A field key that asks every writer for a value, which a list with rows under it cannot be given by a stranger's pack. */
const DEMANDS = ['required', 'required_when'];

/**
 * A pack's `extends`, read: each list it lays fields and values on, or the refusal naming the part that is wrong.
 *
 * EVERY KEY IS ASKED FOR, AND ONE NOTHING READS IS REFUSED. The defect this key exists to close was a key that installed
 * and did nothing, so `{ field: … }` for `fields`, or a list name without its kind, is a sentence and not a no-op.
 * What the list is like is not asked here, because only the record knows: `plan` asks it, and `install` refuses it.
 */
function readExtends(pack: string, raw: unknown, declared: ReadonlySet<string>): Result<Record<string, Extension>> {
  if (!isObject(raw as Json))
    return malformed('`extends` maps a list to what this pack lays on it, like register.people: { values: { role: [family] } }.', 'extends');
  const out: Record<string, Extension> = {};
  for (const [list, body] of Object.entries(raw as Record<string, Json>)) {
    const at = `extends.${list}`;
    if (!list.startsWith('register.') || !REGISTER_NAME.test(list.slice('register.'.length)))
      return malformed(`${list} is not a list id: register, a full stop and the list's name, like register.people.`, at);
    if (declared.has(list)) return malformed(`${pack} declares ${list} and extends it. A pack's own list takes its fields in its own declaration.`, at);
    if (!isObject(body)) return malformed(`${at} is { fields: [...], values: { <field>: [...] } }.`, at);
    const stray = Object.keys(body).find((k) => !EXTENSION_KEYS.includes(k));
    if (stray !== undefined)
      return malformed(`An extension lays fields, values and labels for those values, and nothing else, so ${stray} is not one of them. To take something away or change its type, the list's own pack has to.`, `${at}.${stray}`);
    const wrong = credential(body) ?? credentialValue(body);
    if (wrong) return no('SECRET_IN_PACK', `${at} carries what looks like a credential at ${wrong}, and a pack is a file people share.`, { at: `${at}.${wrong}` });
    const painted = colour(body);
    if (painted) return no('COLOUR_OUTSIDE_THEME', `${at} sets ${painted.at} to ${painted.value}. A field names an intent, and the theme names the colour.`, { at: `${at}.${painted.at}` });
    /* NO SETTING FILLS AN EXTENSION, because it is laid on a list as written: a placeholder here would reach the record's
       list with its braces in it. */
    if (configReads(body).length > 0) return malformed(`${at} reads a setting, and an extension is laid on the list as it is written.`, at);

    const one: Extension = {};
    if (body.fields !== undefined) {
      if (!Array.isArray(body.fields) || body.fields.some((f) => !isObject(f) || typeof f.id !== 'string' || typeof f.type !== 'string'))
        return malformed(`${at}.fields is a list of fields, each { id: <id>, type: <type> }.`, `${at}.fields`);
      const ids = new Set<string>();
      for (const f of body.fields as Record<string, Json>[]) {
        const field = f.id as string;
        if (ids.has(field)) return malformed(`${at} lays ${field} twice.`, `${at}.fields.${field}`);
        ids.add(field);
        /* ONLY AN OPTIONAL FIELD. A required one refuses every writer that has never heard of this pack, and the rows
           already in the list have no value for it: `REQUIRED_ON_POPULATED` is the same fact for a pack's own list. */
        const demand = DEMANDS.find((k) => f[k] !== undefined && f[k] !== false);
        if (demand !== undefined)
          return malformed(`${pack} lays ${field} on ${list.slice('register.'.length)} as ${demand === 'required' ? 'required' : 'required sometimes'}. A field laid on another pack's list is one every writer may leave out.`, `${at}.fields.${field}.${demand}`);
      }
      if (body.fields.length > 0) one.fields = body.fields as Record<string, Json>[];
    }
    if (body.values !== undefined) {
      if (!isObject(body.values) || Object.values(body.values).some((v) => !Array.isArray(v) || v.some((x) => typeof x !== 'string' || x === '')))
        return malformed(`${at}.values is { <field>: [<value>, ...] }, the values to add to each closed list.`, `${at}.values`);
      const values = Object.fromEntries(Object.entries(body.values as Record<string, string[]>).filter(([, v]) => v.length > 0));
      if (Object.keys(values).length > 0) one.values = values;
    }
    if (body.labels !== undefined) {
      /* ONLY FOR A VALUE THIS PACK LAYS HERE. A label for any other value is a pack renaming what the list's own pack
         named, and a field laid under `fields` says its labels in itself, so here they would be said twice. */
      if (!isObject(body.labels)) return malformed(`${at}.labels is { <field>: { <value>: <label> } }, the words each value this pack lays is read by.`, `${at}.labels`);
      const labels: Record<string, Record<string, string>> = {};
      for (const [field, said] of Object.entries(body.labels)) {
        const here = `${at}.labels.${field}`;
        if (!isObject(said)) return malformed(`${here} is { <value>: <label> }, one label for each value this pack lays on ${field}.`, here);
        if (one.fields?.some((f) => f.id === field)) return malformed(`${pack} lays ${field} itself, so the labels for its values go in the field, under its own labels.`, here);
        /* `hasOwn`, because a field called `constructor` would otherwise find the object's own and throw below. */
        const laid = one.values !== undefined && Object.hasOwn(one.values, field) ? one.values[field] : undefined;
        if (laid === undefined) return malformed(`${pack} lays no values on ${field}, so it has none to label. Name them under values first.`, here);
        for (const [value, label] of Object.entries(said)) {
          if (!laid.includes(value)) return malformed(`${pack} does not lay ${value} on ${field}, and a pack labels only the values it lays.`, `${here}.${value}`);
          if (typeof label !== 'string' || label.trim() === '') return malformed(`The label for ${value} is the words a person reads it by, as text.`, `${here}.${value}`);
        }
        if (Object.keys(said).length > 0) labels[field] = said as Record<string, string>;
      }
      if (Object.keys(labels).length > 0) one.labels = labels;
    }
    if (one.fields === undefined && one.values === undefined) return malformed(`${at} lays nothing: name fields to add, values to add to a closed list, or both.`, at);
    out[list] = one;
  }
  return ok(out);
}

/** The most blocks one pack adds to other packs' pages, a page's worth: past it, the pack wants a page of its own. */
export const ADDS_MOST = 16;

/** The keys one addition may carry. `note` is legal on everything a pack says (`04 §2`). */
const ADDITION_KEYS = ['page', 'block', 'after', 'note', 'into', 'column'];

/**
 * A pack's `adds`, read: each block it adds to another pack's page, or the refusal naming the part that is wrong.
 *
 * ONLY THE SHAPE IS ASKED HERE, for `readExtends`' reason: whether the page is there, and whether it can draw the block,
 * only the record knows, so `plan` asks it (`addedTo`) and `install` refuses it. A block may read a setting no more than
 * an extension may, since it is drawn as written and a placeholder would reach the page with its braces in it.
 */
function readAdds(pack: string, raw: unknown, declared: ReadonlySet<string>): Result<PageAddition[]> {
  if (!Array.isArray(raw))
    return malformed('`adds` is a list of blocks for other packs\' pages, each { page: page.project, block: { kind: note, ... } }.', 'adds');
  if (raw.length > ADDS_MOST) return malformed(`${pack} adds ${raw.length} blocks to other pages, and a pack adds at most ${ADDS_MOST}.`, 'adds');
  const out: PageAddition[] = [];
  for (const [n, one] of (raw as unknown[]).entries()) {
    const at = `adds.${n}`;
    if (!isObject(one)) return malformed(`${at} is { page: <page id>, block: { kind: ... }, after?: <heading> }.`, at);
    const stray = Object.keys(one).find((k) => !ADDITION_KEYS.includes(k));
    if (stray !== undefined) return malformed(`An addition names a page, a block and where the block goes, so ${stray} is not one of its keys.`, `${at}.${stray}`);
    const page = one.page;
    if (typeof page !== 'string' || !page.startsWith('page.') || !NAME.test(page.slice('page.'.length)))
      return malformed(`${String(page)} is not a page id: page, a full stop and the page's name, like page.project.`, `${at}.page`);
    if (declared.has(page)) return malformed(`${pack} declares ${page} and adds to it. A pack's own page takes its blocks in its own declaration.`, `${at}.page`);
    /* ONE COLUMN INTO A BLOCK THERE is read by its own rules (`add-column.ts`). */
    if (one.into !== undefined || one.column !== undefined) {
      const col = readAddColumn(pack, at, one);
      if (!col.ok) return col;
      out.push(col.value);
      continue;
    }
    const block = one.block;
    if (!isObject(block) || typeof block.kind !== 'string')
      return malformed(`${at}.block is one block with its kind, like { kind: note, heading: The brief }.`, `${at}.block`);
    if (one.after !== undefined && (typeof one.after !== 'string' || one.after.trim() === ''))
      return malformed(`${at}.after is the heading of the block on ${page} this one goes after.`, `${at}.after`);
    if (one.note !== undefined && typeof one.note !== 'string') return malformed(`${at}.note is text.`, `${at}.note`);
    const wrong = credential(block) ?? credentialValue(block);
    if (wrong) return no('SECRET_IN_PACK', `${at} carries what looks like a credential at ${wrong}, and a pack is a file people share.`, { at: `${at}.block.${wrong}` });
    const painted = colour(block);
    if (painted) return no('COLOUR_OUTSIDE_THEME', `${at} sets ${painted.at} to ${painted.value}. A block names an intent, and the theme names the colour.`, { at: `${at}.block.${painted.at}` });
    if (configReads(block).length > 0) return malformed(`${at} reads a setting, and a block added to another page is drawn as it is written.`, `${at}.block`);
    out.push({
      page,
      block,
      ...(typeof one.after === 'string' ? { after: one.after } : {}),
      ...(typeof one.note === 'string' ? { note: one.note } : {}),
    });
  }
  const many = columnsFault(out);
  if (many) return many;
  return ok(out);
}

/**
 * One addition as `Diff.page_adds` says it, against `host`, the page as the record holds it, or `undefined` when it holds
 * none. The page is named by its title where the title is words, and by its id's name where it is a template's
 * placeholder (`{{name}}`), since the plan is about every page the template makes.
 *
 * THE BLOCK IS CHECKED AS THE PAGE'S OWN WOULD BE: the kernel's `validate` over a page holding it alone, with the page's
 * `for:`, so a block over a template's row reads that row's fields as the page's own blocks do. A block the page could
 * not draw is refused here, before it reaches a page its pack does not own.
 */
function addedTo(pack: string, add: PageAddition, host: { kind: DeclKind; body: string } | undefined): NonNullable<Diff['page_adds']>[number] {
  const name = add.page.slice('page.'.length);
  let body: Record<string, Json> | null = null;
  if (host !== undefined && host.kind === 'page') {
    try {
      const parsed = JSON.parse(host.body) as unknown;
      body = isObject(parsed) ? parsed : null;
    } catch {
      body = null;
    }
  }
  if (body === null && 'into' in add)
    return {
      page: add.page,
      kind: 'column',
      heading: add.column.label,
      line: `adds a column to ${name} from ${pack}`,
      unresolved: true,
      refusal: {
        code: 'PAGE_UNKNOWN',
        fix: `${pack} adds a column to the ${name} page, which is not here. Install the pack that declares ${add.page} first.`,
        at: `adds.${add.page}`,
      },
    };
  if ('into' in add) {
    const titled = body !== null && typeof body.title === 'string' && body.title.trim() !== '' && !body.title.includes('{{') ? body.title : name;
    return { page: add.page, kind: 'column', heading: add.column.label, line: `adds a column, ${add.column.label}, to ${titled} from ${pack}` };
  }
  const heading = typeof add.block.heading === 'string' ? add.block.heading : undefined;
  const said = { page: add.page, kind: add.block.kind as string, ...(heading === undefined ? {} : { heading }), ...(add.after === undefined ? {} : { after: add.after }) };
  if (body === null)
    return {
      ...said,
      line: `adds a block to ${name} from ${pack}`,
      unresolved: true,
      refusal: {
        code: 'PAGE_UNKNOWN',
        fix: `${pack} adds a block to the ${name} page, which is not here. Install the pack that declares ${add.page} first.`,
        at: `adds.${add.page}`,
      },
    };
  const title = typeof body.title === 'string' && body.title.trim() !== '' && !body.title.includes('{{') ? body.title : name;
  const fault = validateDeclaration({
    id: add.page,
    kind: 'page',
    body: { page: name, title: typeof body.title === 'string' ? body.title : name, ...(body.for === undefined ? {} : { for: body.for }), blocks: [add.block] },
  });
  return { ...said, line: `adds a block to ${title} from ${pack}`, ...(fault ? { refusal: { ...fault, at: `adds.${add.page}.${fault.at ?? 'block'}` } } : {}) };
}

/**
 * The live list `live` with `ext` laid after its own, as `Diff.extends` has it, or the refusal for the part of it the list
 * cannot take. `carried`'s rule: a field the list lacks goes after its fields, and a value a closed list lacks after its
 * values. A field or a value the list has already, in the same shape, is not laid twice, so installing a pack again
 * changes nothing.
 *
 * `mine` IS THE FIELDS THIS PACK MAY CHANGE: the ones it laid on this list itself, which no other pack laid and the list
 * does not declare (`laidBy`). Such a field in another shape is the pack's next version of its own field, and it takes
 * the field's place, so rows written under it keep their order and their values. Any other field under the same id is
 * still two fields sharing one.
 *
 * `own` IS THE LIST AS ITS OWN PACK LAST WROTE IT (`ownBody`), or nothing when the record cannot say. It tells a value
 * the list declares from one a pack laid on it, which the live body cannot: both sit in the one `values`.
 */
function extended(pack: string, id: string, live: string, ext: Extension, mine: ReadonlySet<string> = new Set(), own: unknown = null): Diff['extends'][number] {
  const list = id.slice('register.'.length);
  const at = `extends.${id}`;
  let was: Record<string, Json>;
  try {
    was = JSON.parse(live) as Record<string, Json>;
  } catch {
    return { id, adds: [], refusal: { code: 'PACK_MALFORMED', fix: `${list} cannot be read here, so nothing can be laid on it.`, at } };
  }
  const fields = listOf(was, 'fields').map((f) => structuredClone(f)) as Record<string, Json>[];
  const adds: string[] = [];
  for (const f of ext.fields ?? []) {
    const held = fields.find((h) => h.id === f.id);
    if (held === undefined) {
      fields.push(structuredClone(f));
      adds.push(String(f.id));
      continue;
    }
    /* THE SAME FIELD IS NOT A SECOND ONE, and another field under the same id is two fields sharing an id: the rows
       written under the list's own would be read as this pack's. */
    if (canonicalise(held) === canonicalise(f)) continue;
    /* UNLESS IT IS THIS PACK'S OWN FIELD, laid by its earlier version, which it may change as a list's own pack changes
       the list's fields. Said in `adds`, because what is added and what is changed are both what this pack lays now. */
    if (mine.has(String(f.id))) {
      fields[fields.indexOf(held)] = structuredClone(f);
      adds.push(String(f.id));
      continue;
    }
    return {
      id,
      adds: [],
      refusal: { code: 'PROVIDES_CONFLICT', fix: `${list} has a field called ${String(f.id)} already, and ${pack} lays one of its own under that id. Two fields cannot share an id, so ${pack} has to lay its field under another id.`, at: `${at}.fields.${String(f.id)}` },
    };
  }
  for (const [field, more] of Object.entries(ext.values ?? {})) {
    const held = fields.find((h) => h.id === field);
    if (held === undefined)
      return { id, adds: [], refusal: { code: 'FIELD_UNKNOWN', fix: `${list} has no field called ${field}, so ${pack} has no values to add to it.`, at: `${at}.values.${field}` } };
    if (!Array.isArray(held.values))
      return { id, adds: [], refusal: { code: 'VALUE_MALFORMED', fix: `${field} on ${list} is not a closed list, so there are no values to add to it.`, at: `${at}.values.${field}` } };
    const values = held.values;
    const fresh = more.filter((v, i) => !values.includes(v) && more.indexOf(v) === i);
    held.values = [...values, ...fresh];
    adds.push(...fresh.map((v) => `${field}.${v}`));
  }
  /* A LABEL GOES ON A VALUE THIS PACK LAID AND NOBODY HAS NAMED. `readExtends` let it through only beside its value, so
     the field is here and closed. A value the list's own pack declares is that pack's to name, and a label laid on it
     would turn its next update from an addition carried (`rebased`) into an edit kept. A value that reads by other
     words already has its label, whoever gave it. A label for a value laid bare before is said in `adds` as the value
     is, because without a line there the body would not be staged and the label would never land. */
  for (const [field, said] of Object.entries(ext.labels ?? {})) {
    const held = fields.find((h) => h.id === field);
    if (held === undefined) continue;
    const labels: Record<string, Json> = isObject(held.labels) ? { ...held.labels } : {};
    const theirs = listOf(fieldsOf(own).get(field), 'values');
    for (const [value, label] of Object.entries(said)) {
      if (labels[value] === label) continue;
      const here = `${at}.labels.${field}.${value}`;
      if (theirs.includes(value))
        return { id, adds: [], refusal: { code: 'PROVIDES_CONFLICT', fix: `${value} is one of ${list}'s own values for ${field}, and ${pack} labels only the values it lays. To change how ${value} reads, the list's own pack has to.`, at: here } };
      if (Object.hasOwn(labels, value))
        return { id, adds: [], refusal: { code: 'PROVIDES_CONFLICT', fix: `${value} on ${list} reads as ${String(labels[value])} already, and ${pack} would have it read as ${label}. One value has one label, so ${pack} has to keep the one it has or lay a value of its own.`, at: here } };
      labels[value] = label;
      if (!adds.includes(`${field}.${value}`)) adds.push(`${field}.${value}`);
    }
    if (Object.keys(labels).length > 0) held.labels = labels;
  }
  if (adds.length === 0) return { id, adds };
  const body = canonicalise({ ...was, fields });
  return body === null ? { id, adds: [], refusal: { code: 'PACK_MALFORMED', fix: `${list} with ${pack}'s additions cannot be written down.`, at } } : { id, adds, body };
}

/**
 * The fields `pack` may change on the list `id` (`extended`'s `mine`): the ones its installed manifest says it laid
 * there (`Installed.packs[].laid`), less every one another pack laid there too and every one the list declares itself.
 *
 * THE LIST'S OWN FIELDS ARE THE ONES IN THE BODY ITS PACK LAST WROTE. A list a pack extends is staged with no pack, and
 * `detached` holds the body it started from, so a field in that body is the list's own however many packs laid it
 * again. A list still under a pack is that pack's body whole, so none of its fields is another pack's to change. A
 * list with no pack and nothing detached is the record's own, and only `laid` can say which of its fields a pack laid.
 *
 * A PACK THAT LAID A FIELD TWO PACKS SHARE MAY NOT CHANGE IT, because the other pack laid it in the shape it had and
 * its rows are written to that shape: the change would be one pack deciding for both.
 */
function laidBy(installed: Installed, pack: string, id: string, live: { pack_id: string | null; body: string }): ReadonlySet<string> {
  const laid = installed.packs.find((p) => p.id === pack)?.laid?.[id] ?? [];
  if (laid.length === 0 || live.pack_id !== null) return new Set();
  const others = new Set(installed.packs.flatMap((p) => (p.id === pack ? [] : (p.laid?.[id] ?? []))));
  const from = installed.detached?.[id];
  let own: ReadonlySet<string> = new Set();
  if (from !== undefined)
    try {
      own = new Set(fieldsOf(JSON.parse(from.body)).keys());
    } catch {
      /* A BODY THAT DOES NOT READ SAYS NOTHING ABOUT WHOSE A FIELD IS, so no field is this pack's to change. */
      return new Set();
    }
  return new Set(laid.filter((field) => !others.has(field) && !own.has(field)));
}

/**
 * The list `id` as its own pack last wrote it, by `laidBy`'s rule: the live body while the list is still under a pack,
 * and the body it was detached from once something was laid on it. `null` for a list with no pack and nothing detached,
 * which is the record's own and has no pack to ask, and for a body that does not read.
 */
function ownBody(installed: Installed, id: string, live: { pack_id: string | null; body: string }): unknown {
  const from = live.pack_id !== null ? live.body : installed.detached?.[id]?.body;
  if (from === undefined) return null;
  try {
    return JSON.parse(from);
  } catch {
    return null;
  }
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
 *
 * `options.settings` ARE VALUES SENT WITH THE INSTALL, which fill it. An arrangement that installed an add-on and set
 * its book planned the add-on with its defaults and wrote the book afterwards, and a setting is read only when a pack is
 * planned and installed, so every declaration reading the book said the default until a later update. A value the
 * setting will not take, or a key the pack does not declare, is a warning, and the setting keeps what it would have had.
 * THE SAME DOOR PLANS A LATER CHANGE: the pack planned again at its own version with the new value names, as `changes`,
 * exactly the declarations that read it.
 *
 * `options.live` IS EVERY DOOR AND PATTERN THE RECORD IS USING, by declaration id (`ingest.<name>`): one that took an
 * arrival in the last 30 days, holds a live address, or reads a door that does (the record's `arrange-retires.ts`). Each
 * one this version retires outright is marked `live: true`. Without it money-core 3.0.0 was planned as four retires and
 * nothing more, and the owner's card texts stopped filing the day he said yes.
 */
export type PlanOptions = { settings?: Readonly<Record<string, unknown>> | undefined; live?: ReadonlySet<string> | undefined };

export async function plan(given: Pack, installed: Installed, options: PlanOptions = {}): Promise<Diff> {
  /* THE BODIES ARE COMPARED AS THEY WOULD BE STORED, with every setting filled in. The installed body
     is the filled one, so comparing it with the file's text would report a change on every plan of
     a pack that reads a setting, and would miss the one a changed setting really makes. */
  const sent = settingsSent(given, options.settings);
  const config = settingsFor(given, installed, sent.values);
  /* A PART THAT WAITS FOR A LIST THE RECORD DOES NOT HOLD IS TAKEN OUT (when-49), and the plan says what waits. */
  const whole = filledWith(given, config);
  /* AN ADDRESS WHERE NONE MAY BE IS FOUND BEFORE ANYTHING ELSE IS READ, in the add-on as it would be stored: a setting
     sent with the install is filled in first, so a value cannot carry in what the file could not, and a part that waits
     is read too, since it is installed the day the record holds what it waits for. Said on the plan, refused by
     `install` (`faultOf`). */
  const remote = addressFault(whole);
  const held = resolveWhen(whole, holdsOf(installed, given));
  const pack = held.pack;
  const live = new Map(installed.declarations.map((d) => [d.id, d]));
  const mine = pack.manifest.pack;
  const was = installed.packs.find((p) => p.id === mine)?.version ?? null;

  const adds: Diff['adds'] = [];
  const changes: Diff['changes'] = [];
  const conflicts: Diff['conflicts'] = [];
  const kept: Diff['kept'] = [];
  /* THE LISTS KEPT AS THE OWNER LEFT THEM WITH ONLY AN UPDATE'S WORDS CARRIED IN (`relisted`, RH3): still the owner's shape. */
  const worded = new Set<string>();
  const brings: Brought[] = [];
  const stays: Diff['stays'] = [];
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
       refusal told them to retire their own Money page. The superseded row says
       whose the declaration was; a row somebody wrote from nothing has no such row and stays a conflict, because the
       pack's pages would then read a stranger's figure under their own name. */
    const edited = already.pack_id === null ? installed.detached?.[decl.id] : undefined;
    if (edited?.was === mine) {
      /* EXCEPT A LIST THIS VERSION CHANGES. Kept, it lacks whatever the update adds to it, and nothing else notices: the
         probe kept an edited `register.fx` under a version adding a `spread` field and a metric summing it, and
         the install went through with the metric summing a field the list did not have. The kernel took `sum: 'nosuch'`
         as well. One comparison with the body the edit started from closes it. */
      if (decl.kind !== 'register' || edited.body === decl.canonical) {
        /* A PAGE KEPT TAKES THE UPDATE'S WORDS WHERE IT STILL SAYS THE PACK'S OLD ONES (`reworded`, UP1): staged as a
           rebased list is, the update's page as the pack's and the owner's after it, so the next update starts from this one. */
        const worded = decl.kind === 'page' ? rewordedPage(edited.body, already.body, decl.canonical) : null;
        kept.push({ id: decl.id, ...(worded === null ? {} : { rebased: worded.body, words: worded.words, ...(worded.rail ? { rail: true as const } : {}) }) });
        /* AND WHAT THE OWNER'S PAGE GOES WITHOUT IS NAMED (`Diff.brings`), so Decide asks once instead of keeping
           the page and saying nothing of the table the update was written for. Asked of the page with the new words in,
           so a heading or title the update only reworded is carried and not offered again as something missing. */
        const more = decl.kind === 'page' ? broughtTo(decl.id, edited.body, worded?.body ?? already.body, decl.body) : null;
        if (more !== null) brings.push(more);
        continue;
      }
      /* UNLESS ALL THE OWNER DID WAS ADD. The arm above locked a list against its pack for good the moment somebody added
         a field to it: `domains` on `register.things` was measured refusing every later portfolio that touched
         `things`, and adding a field is the ordinary way a record grows. An edit that is
         the body it started from plus fields and enum values that body lacks has nothing the update could undo, so the
         update's body is staged as the pack's and the additions are laid over it as the owner's row. */
      const over = rebased(edited.body, already.body, decl.body);
      /* OR ALL THE UPDATE DID WAS REWORD IT (RH3). Team 2.30.1 says Sprints for Cycles on three lists, and a record whose
         owner had changed one of them beyond adding fields was refused that update and every later one, each night,
         with nothing reaching Decide. The update changes no shape, so the owner's list is kept as they left it, with the
         update's words carried in where it still says the pack's old ones (`relisted`), staged as a rebased list is. */
      const words = over === null ? relistedList(edited.body, already.body, decl.canonical) : null;
      if (words !== null) {
        kept.push({ id: decl.id, ...(words.body === null ? {} : { rebased: words.body, words: words.words }) });
        worded.add(decl.id);
      } else if (over === null) conflicts.push({ id: decl.id, pack: OWN, changed: true });
      else if ('clash' in over) conflicts.push({ id: decl.id, pack: OWN, changed: true, field: over.clash });
      else {
        const rows = installed.rows[decl.id.slice('register.'.length)] ?? 0;
        /* AND A VALUE THE UPDATE TAKES OFF A LIST THAT HOLDS ROWS STAYS HERE TOO (`laidBack`). A list the owner or another
           pack's `extends` added to is exactly the one this arm sees, so without it Personal's People, which carries
           Personal's roles, would lose `registrar` on the People update that sheds it from a studio's record. */
        const holders = holdersOf(installed, decl.id);
        const back = rows > 0 || holders !== undefined ? laidBack(already.body, JSON.parse(over.body) as Record<string, Json>, rows, holders) : null;
        if (back !== null) stays.push({ id: decl.id, values: back.values, rows, ...counts(back) });
        const body = back?.body ?? over.body;
        kept.push({ id: decl.id, adds: over.adds, rebased: body });
        /* THE UPDATE'S OWN CHANGES STILL MEET THE ROWS: a field it retypes under rows is refused here as it is for a list
           nobody edited, asked of what will be live, so the owner's additions are never mistaken for the update's. */
        if (rows > 0) unreadable({ ...decl, body: JSON.parse(body) as Record<string, Json> }, already.body, rows, retypes, newlyRequired);
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
    /* EXCEPT ONE THE PACK THAT HOLDS IT HANDS TO THIS ONE (`Installed.handed`), which this install takes over: a change
       under this pack, as the owner reads it, and never a conflict. People 3.0.0 planned beside Founder 1.x, told that
       Founder 2.0.0 hands it `register.organisations`, was `PROVIDES_CONFLICT` at that list, and Founder 2.0.0 could not
       go first either, since its pages read the organisations as only People 3.0.0 lays them. So the use case cycled.
       What the list holds and this body lacks stays, as it does for a list handed before this pack was installed. */
    /* AND A LIST A USE CASE HELD BEFORE A BRAINDOG MODULE DECLARED IT, SINCE portfolio 1.19.0: Portfolio takes Numbers
       from the founder use case, whose next version hands it over, and the night updates the modules before the use
       cases (`packs/quiet.ts` in `@braindog/seed`), so Portfolio was refused PROVIDES_CONFLICT, and the use case after it
       could not lay its fields on a list it was still handing. A use case stands on the modules (`modules`), and a list
       a module declares is the module's, so the module takes it over as it would one it was handed, whichever of the two
       a record updates first. Only a module and only from a use case: an add-on's list stays its own. */
    const moduleTakes = already.pack_id !== null && already.pack_id.startsWith('usecase-') && decl.kind === 'register' && (MODULES as readonly string[]).includes(mine);
    if (already.pack_id !== null && already.pack_id !== mine && (installed.handed?.[decl.id] === mine || moduleTakes)) {
      changes.push({ id: decl.id, from_version: already.version, summary: summarise(decl), from: already.pack_id });
      if (decl.kind !== 'register') continue;
      const over = carried(already.body, decl.body);
      if (over !== null) kept.push({ id: decl.id, adds: over.adds, rebased: over.body });
      const rows = installed.rows[decl.id.slice('register.'.length)] ?? 0;
      if (rows > 0) unreadable(over === null ? decl : { ...decl, body: JSON.parse(over.body) as Record<string, Json> }, already.body, rows, retypes, newlyRequired);
      continue;
    }
    if (already.pack_id !== mine) {
      conflicts.push({ id: decl.id, pack: already.pack_id ?? OWN });
      continue;
    }
    if (already.body !== decl.canonical) {
      const rows = decl.id.startsWith('register.') ? (installed.rows[decl.id.slice('register.'.length)] ?? 0) : 0;
      /* AND A VALUE IT TAKES OFF A CLOSED LIST THAT HOLDS ROWS IS LAID BACK, after the update's own. Taken off, a row
         holding it could not be edited at all: People 2.0.0 without `registrar` planned clean, and the next edit to that
         row's `note` was `ENUM_VALUE_UNKNOWN` over a field the edit never touched (`update-keeps-value.test.ts`). */
      /* AND ON A LIST WITH NO LIVE ROWS, WHEN THE RECORD CAN COUNT, because a row in the bin holds its values too. */
      const holders = holdersOf(installed, decl.id);
      const back = rows > 0 || holders !== undefined ? laidBack(already.body, decl.body, rows, holders) : null;
      if (back !== null) stays.push({ id: decl.id, values: back.values, rows, ...counts(back), body: back.body });
      /* A LIST THAT IS ALREADY THE UPDATE WITH ITS KEPT VALUES LAID BACK IS NOT CHANGED BY IT. The kept value lives under
         the pack now (`install`), so the live body and the file's differ by that value on every later plan of the same
         version, and a reinstall of People 2.0.0 was "1 change" that staged the bytes already there. */
      if (back?.body === already.body) continue;
      changes.push({ id: decl.id, from_version: already.version, summary: summarise(decl) });
      /* AND WHAT THE CHANGE DOES TO THE ROWS UNDER IT. This compared the two bodies for INEQUALITY
         and wrote down a summary; it never looked inside them, so an upgrade that moved a field's
         type or made one required was reported as "1 change" and installed. */
      if (rows > 0) unreadable(decl, already.body, rows, retypes, newlyRequired);
    }
  }

  const keeping = new Set(pack.declarations.map((d) => d.id));
  const retires: Diff['retires'] = [];
  const removals: NonNullable<Diff['removals']> = [];
  let orphans = 0;
  const hands = pack.manifest.hands ?? {};
  for (const decl of installed.declarations) {
    if (decl.pack_id !== mine || keeping.has(decl.id)) continue;
    /* ON A FIRST INSTALL, WHAT IS UNDER THIS PACK'S NAME AND NOT IN ITS FILE WAS HANDED TO IT, and is not its own to
       retire. Nothing else puts a live row under a pack with no `pack` row (the takeover in the loop above says why).
       Retired here, it measured `WOULD_ORPHAN` "notes-pack installs away register.holdings" for a list with a row in it,
       and a silent retire for an empty one, on a pack that had never heard of the list. The giver's plan cannot catch it
       earlier: the receiver is not installed, so nothing in `Installed` says what its file declares. So it is refused
       here, and `install` says the two ways out. */
    if (was === null) {
      conflicts.push({ id: decl.id, pack: mine, handed: true });
      continue;
    }
    /* AN INSTALLED PACK HANDED IT HERE, so it is not this pack's to retire either: it stays live under this pack, rows
       and all, until a version of this pack declares it. Retired, every update of the receiver orphaned the rows of a
       list another pack had given it (`Installed.handed`). */
    if (installed.handed?.[decl.id] === mine) continue;
    const register = decl.id.startsWith('register.') ? decl.id.slice('register.'.length) : null;
    const rows = register ? (installed.rows[register] ?? 0) : 0;
    /* A DECLARATION THIS VERSION HANDS ON IS NOT RETIRED, SO IT ORPHANS NOTHING. It is staged again under the pack it
       goes to, and `pack` in its body says the same thing, because the kernel reads the same bytes as the same version
       and keeps the owner it had: a restage of the unchanged body left money-core owning the list. The line still sits
       among the retires, since this pack no longer declares it, and names where it went, which is what the owner reads:
       the plan he approved for money-core 1.8.0 said twelve ingests retire and never which pack to install for them. */
    /* BUT ONLY TO A PACK THE RECORD DOES NOT HAVE YET. Handed to an installed pack whose file does not declare it, the
       list sat under that pack's name and every later update of it, a reinstall of the same file included, was
       `WOULD_ORPHAN` (`handover.test.ts`), so one pack's `hands` could stop another from ever updating. Taking over
       is what a pack's first install does, so a handover to one already installed is the retire it would otherwise be. */
    /* AND ONLY WHAT THE RECORD USES: a list with rows, or anything `used` names (a door with a token, a pattern that has
       filed a row). The rest is retired like any declaration this version stops declaring, so the record holds no pack
       it never chose, and the receiver, installed later, declares it afresh. A caller that passes no `used` cannot say,
       and gets everything handed as before. */
    /* AND TO AN INSTALLED PACK WHEN THE RECORD CAN SAY WHAT WAS HANDED (`Installed.handed`): that pack's plans then leave
       the list where it is until a version of it declares the list, so the handover no longer locks it. */
    /* A PAGE, A JOB, A RULE OR A FIGURE IS ALWAYS HANDED: it holds no rows and files no arrival, so "used" cannot tell
       whether somebody relies on it, and retiring it would drop a page they arranged or a kind of job they approved only
       for the receiver to declare it afresh (Roadmap's page to Work, Slash's job to Starter jobs). */
    const inUse = installed.used === undefined || rows > 0 || installed.used.includes(decl.id) || !/^(register|ingest)\./u.test(decl.id);
    const takes = (to: string): boolean => installed.handed !== undefined || !installed.packs.some((p) => p.id === to);
    const to = Object.hasOwn(hands, decl.id) && inUse && takes(hands[decl.id]!) ? hands[decl.id] : undefined;
    const body = to === undefined ? null : handedBody(decl.body, to);
    if (to !== undefined && body !== null) {
      retires.push({ id: decl.id, rows, to, body });
      continue;
    }
    retires.push({ id: decl.id, rows });
    orphans += rows;
    if (register !== null && rows > 0) removals.push(removalOf(register, decl.body, rows));
  }
  /* A DOOR GOES WHERE THE PATTERNS NAMING IT GO. money-core's plan handed `ingest.bank-ipn-in-sms`, which names `door:
     bank-from-out-sms`, and retired the door, since it held no token and filed nothing: every text reached it through
     the pattern. So the handed pattern arrived naming a door that was gone, the declaration the kernel's `doorFault`
     refuses at install (`door-follows-patterns.test.ts`). The
     door is handed to the pack its pattern goes to, whatever `used` says of the door itself. */
  /* BUT ONLY WHERE `hands` SENDS THE DOOR THERE TOO. Handed to whichever pack a pattern went to, `banky` 1.1.0 handing only
     `ingest.bank-twin` to `teller` handed `teller` its `ingest.bank-door` as well, and `teller` 1.0.0, which names a door
     of its own, was then the `{ handed: true }` conflict `install` refuses, and could not install at all
     (`hands-names-door.test.ts`). Two patterns going to two packs
     left the door with whichever was read last. Where `hands` says nothing of the door, or names another pack, the door
     is not handed here, and `installFault` tells the author the line to add (`handsDoorFault`). */
  const doorsTo = new Map<string, Set<string>>();
  for (const r of retires)
    if (r.to !== undefined && r.body !== undefined) {
      const door = (JSON.parse(r.body) as { door?: unknown }).door;
      if (typeof door === 'string') doorsTo.set(`ingest.${door}`, (doorsTo.get(`ingest.${door}`) ?? new Set<string>()).add(r.to));
    }
  for (const [i, r] of retires.entries()) {
    const to = r.to === undefined && Object.hasOwn(hands, r.id) && doorsTo.get(r.id)?.has(hands[r.id]!) === true ? hands[r.id] : undefined;
    const live = to === undefined ? undefined : installed.declarations.find((d) => d.id === r.id);
    const body = to === undefined || live === undefined ? null : handedBody(live.body, to);
    if (to !== undefined && body !== null) retires[i] = { id: r.id, rows: r.rows, to, body };
  }
  /* WHAT IS HANDED STAYS LIVE, so nothing below may treat it as gone: not a figure that reads it, not a list a field
     points at, and not half of a rename. */
  const handed = new Set(retires.filter((r) => r.to !== undefined).map((r) => r.id));
  /* WHAT GOES OUTRIGHT AND IS STILL IN USE, after the doors above have followed their patterns, so a door handed on is
     never marked: it keeps answering under the pack it went to. */
  const using = options.live;
  if (using !== undefined)
    for (const [i, r] of retires.entries()) if (r.to === undefined && r.id.startsWith('ingest.') && using.has(r.id)) retires[i] = { ...r, live: true };

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
     list is not gone. A review of `9b0d8184` measured it: an edited `spent-30d`, a money-core without `transfer`, a
     plan with no conflicts, and then `FIELD_UNKNOWN` on every read of the figure, because its `where` still says
     `transfer is false`. A retyped field is the same failure one step later: a sum over a field that is now text. */
  const moved = new Map<string, { fields: Map<string, Record<string, unknown>>; moved: Moved[] }>();
  for (const change of changes) {
    const decl = pack.declarations.find((d) => d.id === change.id);
    const was = live.get(change.id)?.body;
    if (decl?.kind !== 'register' || was === undefined) continue;
    const found = movedFields(was, decl.body);
    /* A VALUE THAT STAYS IS NOT TAKEN OFF, so a declaration asking for it reads what it read before. */
    const staying = new Set(stays.find((s) => s.id === change.id)?.values ?? []);
    if (found !== null) found.moved = found.moved.filter((m) => m.value === undefined || !staying.has(`${m.field}.${m.value}`));
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
     gap was measured on a real record: the owner retired `fx.source`, the update added a figure
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

  /* A KEPT PAGE WITH THE UPDATE'S WORDS CARRIED IN IS STILL THE OWNER'S PAGE, read as it was. */
  const misreads = misreadsOf(pack, installed, new Set(kept.filter((k) => k.rebased === undefined || live.get(k.id)?.kind === 'page' || worded.has(k.id)).map((k) => k.id)), gone);
  const unresolved = unresolvedOf(pack, installed, retires);
  /* A LIST THE RECORD LACKS HAS NOTHING TO LAY ON, and `unresolved` names it with the module that declares it. */
  const extensions: Diff['extends'] = Object.entries(pack.manifest.extends ?? {}).flatMap(([id, ext]) => {
    const held = live.get(id);
    return held === undefined || held.kind !== 'register' ? [] : [extended(mine, id, held.body, ext, laidBy(installed, mine, id, held), ownBody(installed, id, held))];
  });
  /* AND A PAGE THE RECORD LACKS HAS NOWHERE TO DRAW WHAT IS ADDED TO IT, which `addedTo` marks unresolved. */
  const pageAdds = pack.manifest.adds?.map((a) => addedTo(mine, a, live.get(a.page)));

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
  const dependents: Diff['dependents'] = installed.packs.flatMap((p) => {
    const range = p.id === mine ? undefined : p.requires?.[mine];
    return range === undefined ? [] : [{ id: p.id, version: p.version, range, ok: satisfies(pack.manifest.version, range), was: satisfies(was, range) }];
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
  const scripts = scriptSources(pack.declarations, installed);

  const said: Omit<Diff, 'planHash'> = {
    pack: {
      id: mine,
      version: pack.manifest.version,
      author: pack.manifest.author,
      license: pack.manifest.license,
      summary: pack.manifest.summary,
      checksum: pack.checksum,
      source: pack.source,
    },
    waiting: held.waiting,
    installed_version: was,
    direction: was === null ? 'install' : was === pack.manifest.version ? 'reinstall' : newer(pack.manifest.version, was) > 0 ? 'upgrade' : 'downgrade',
    requires: { format, primitives, packs: needs },
    dependents,
    adds,
    changes,
    retires,
    conflicts,
    kept,
    ...(brings.length === 0 ? {} : { brings }),
    stays,
    extends: extensions,
    ...(pageAdds === undefined ? {} : { page_adds: pageAdds }),
    seeds: { count: seedsFor(pack, adds).length, registers: seedRows(seedsFor(pack, adds)) },
    ...(pack.manifest.skills === undefined ? {} : { skills: pack.manifest.skills.map((s) => ({ name: s.name, trigger: s.trigger, what: s.what ?? null })) }),
    ...(pack.manifest.widgets === undefined ? {} : { widgets: pack.manifest.widgets.map((w) => ({ id: w.id, title: w.title })) }),
    spawns: spawnsOf(pack),
    calls_out: calls,
    scripts,
    approve: approvalLines(calls.filter((c) => c.change !== 'same').map((c) => ({ key: c.grant, line: c.line, key_line: c.key_line }))),
    interrupts: interruptsOf(pack),
    touches: { rows_read: 0, rows_written: 0 },
    orphans,
    ...(removals.length === 0 ? {} : { removals }),
    retypes,
    newly_required: newlyRequired,
    misreads,
    renames,
    warnings: [...warningsOf(pack), ...sent.warnings],
    config,
    unresolved,
    base,
    ...(remote === null ? {} : { remote }),
  };
  /* THE INTEGER HALF CATCHES A RECORD THAT MOVED and the hash half catches a PACK that was edited
     between the plan and the install — which no version number can see, and which is exactly what
     happens when the thing being approved is a file in somebody's editor. The hash half is over what the plan SAYS
     (`saysOf`): the pack's checksum is in it, and so is every change, setting and call out it shows, so two plans with
     one hash half are one plan, read at two moments (`samePlan`). */
  return { ...said, planHash: `${installed.record_version}.${await digest(jcs(saysOf(said)))}` };
}

/**
 * WHAT A PLAN SAYS IT WILL DO, without the moment it was read in: the plan less `base`, the versions of the packs it
 * leans on or that lean on it (whether each range holds stays), and every row count, which is kept only as whether
 * there are any, because none and some decide a refusal and 41 and 42 decide nothing.
 *
 * THE RECORD'S OWN WRITES MOVED THE PLAN UNDER A PERSON. A minute-old BrainDog files arrivals, headlines and rules
 * after somebody tells it something, and each moved `record_version`, so the first add-on installed after the first
 * thing told was refused `PLAN_STALE` one time in five, with a plan that would have done exactly what was read (first
 * hour audit, E2). A list the add-on never names moving, or an update to a pack it does not touch, says the same plan;
 * a change to anything the sheet shows does not.
 */
export function saysOf(d: Omit<Diff, 'planHash'>): Json {
  const some = (n: number): boolean => n > 0;
  const { base: _base, requires, dependents, retires, orphans, removals, stays, retypes, newly_required, renames, ...rest } = d;
  return {
    ...rest,
    requires: { format: requires.format, primitives: requires.primitives, packs: requires.packs.map((p) => ({ id: p.id, range: p.range, ok: p.ok })) },
    dependents: dependents.map((p) => ({ id: p.id, range: p.range, ok: p.ok, was: p.was })),
    retires: retires.map((r) => ({ ...r, rows: some(r.rows) })),
    orphans: some(orphans),
    ...(removals === undefined ? {} : { removals: removals.map((r) => ({ retire: r.retire, name: r.name })) }),
    stays: stays.map((s) => ({ id: s.id, values: s.values, rows: some(s.rows), ...(s.body === undefined ? {} : { body: s.body }) })),
    retypes: retypes.map((r) => ({ ...r, rows: some(r.rows) })),
    newly_required: newly_required.map((r) => ({ ...r, rows: some(r.rows) })),
    renames: renames.map((r) => ({ ...r, rows: some(r.rows) })),
  } as unknown as Json;
}

/**
 * WHETHER TWO PLAN HASHES ARE ONE PLAN, read at two moments: the halves after the record's version are equal. The
 * record installs the plan it makes at the press when this holds (`installPack`), so a BrainDog that only wrote rows
 * the add-on never names, since the plan was read, installs what was read without asking again.
 */
export function samePlan(approved: string, now: string): boolean {
  const said = (h: string): string => h.slice(h.indexOf('.') + 1);
  return approved.includes('.') && now.includes('.') && said(approved) !== '' && said(approved) === said(now);
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

/**
 * WHAT A SEED SAYS INSTEAD OF A VALUE: `{ day: '+3' }`, a day counted from install day, and `{ ref: 'yard' }`,
 * the row another seed of this file made, by that seed's `key`. Each stands where the value would, alone in its object,
 * as a field's value or as one entry of a list.
 *
 * BOTH WERE CODE AFTER THE INSTALL: a function that moved example days on to today and one that linked example rows by
 * their titles. Said in the file, every row is written once with its day and its link already in it.
 */
const SEED_DAY = /^[+-]\d{1,4}$/;
const soleKey = (v: unknown, key: string): v is Record<string, Json> => isObject(v) && Object.keys(v).length === 1 && Object.hasOwn(v, key);
/** Each value a seed's field holds, with whether it stood inside a list: where a day or a ref may stand. */
const seedValues = (value: Json): { value: Json; listed: boolean }[] =>
  Array.isArray(value) ? value.map((v) => ({ value: v, listed: true })) : [{ value, listed: false }];
/** The keys of the other seeds this one points at, each once. */
const seedPoints = (seed: Seed): string[] => [
  ...new Set(
    Object.values(seed.fields)
      .flatMap(seedValues)
      .flatMap((v) => (soleKey(v.value, 'ref') && typeof v.value.ref === 'string' ? [v.value.ref] : [])),
  ),
];

/**
 * The seeds in the order they are written: a row another points at before the row that points at it, and otherwise as
 * the file says them. `null` when two point at each other, which no order can write in one go.
 *
 * A KEY NO SEED HERE CARRIES IS NOT WAITED FOR. `normalise` refuses a ref to a key the file does not have, so here that
 * is a seed of a list this install does not plant (the record already holds it), and the row is written without the link.
 */
function seedOrder<S extends Seed>(seeds: readonly S[]): S[] | null {
  const keyed = new Set(seeds.flatMap((s) => (s.key === undefined ? [] : [s.key])));
  const written = new Set<string>();
  const out: S[] = [];
  let left = [...seeds];
  while (left.length > 0) {
    const ready = left.filter((s) => seedPoints(s).every((k) => !keyed.has(k) || written.has(k)));
    if (ready.length === 0) return null;
    for (const s of ready) {
      out.push(s);
      if (s.key !== undefined) written.add(s.key);
    }
    left = left.filter((s) => !ready.includes(s));
  }
  return out;
}

/** The day `by` days on from `today`, both as YYYY-MM-DD, counted in UTC so no clock change moves it. */
const dayFrom = (today: string, by: number): string => new Date(Date.parse(`${today}T00:00:00Z`) + by * 86_400_000).toISOString().slice(0, 10);

/**
 * A seed's fields as the row is written: each day counted from `today`, each ref the id of the row that seed made. A
 * ref to a row this install did not write is left out, field or list entry, so the row never points at nothing.
 */
function seedFields(seed: Seed, today: string, made: ReadonlyMap<string, string>): Record<string, Json> {
  const one = (v: Json): Json | undefined => {
    if (soleKey(v, 'day') && typeof v.day === 'string' && SEED_DAY.test(v.day)) return dayFrom(today, Number(v.day));
    if (soleKey(v, 'ref') && typeof v.ref === 'string') return made.get(v.ref);
    return v;
  };
  const out: Record<string, Json> = {};
  for (const [field, value] of Object.entries(seed.fields)) {
    const filled = Array.isArray(value) ? value.flatMap((v) => one(v) ?? []) : one(value);
    if (filled !== undefined) out[field] = filled;
  }
  return out;
}

/**
 * One example row an add-on remembers planting: its list, the row, and its fields as the file said them that day.
 *
 * KEPT IN THE ADD-ON'S STORED MANIFEST UNDER `planted`, BY THE SEED'S `key`, because nothing on a row says which seed
 * made it, and a row a person has renamed cannot be found again by its name. The fields are the file's words and not
 * the row's: `{ day: '+3' }` and `{ ref: 'yard' }` as written, so the next update can tell what the FILE changed from
 * what a person changed, and writes only the first.
 */
export type Planted = { list: string; row: string; fields: Record<string, Json> };

/** `planted` as a stored manifest holds it, by seed key. Anything that is not the shape is left out, never thrown. */
export function plantedOf(raw: unknown): Map<string, Planted> {
  const out = new Map<string, Planted>();
  if (!isObject(raw)) return out;
  for (const [key, held] of Object.entries(raw)) {
    if (!isObject(held) || typeof held.list !== 'string' || typeof held.row !== 'string' || !isObject(held.fields)) continue;
    out.set(key, { list: held.list, row: held.row, fields: held.fields as Record<string, Json> });
  }
  return out;
}

/**
 * The fields of a seed the file has changed since the row was planted, as the file says them now.
 *
 * ONLY WHAT THE FILE CHANGED IS WRITTEN. A field the file says as it did is left to the row, which may hold a person's
 * correction, and so is a field the file no longer says. `tags` is never in it: the host tags an example row when it
 * plants one, and taking the tag off is how a person makes the row their own.
 */
function seedChanges(seed: Seed, was: Planted): Record<string, Json> {
  return Object.fromEntries(Object.entries(seed.fields).filter(([field, value]) => field !== 'tags' && (!Object.hasOwn(was.fields, field) || jcs(value) !== jcs(was.fields[field]!))));
}

/* ── settings, and the lists a pack points at ────────────────────────────── */

/**
 * The value each of a pack's settings takes in this install: the one somebody chose, when the new
 * version still accepts it, or else this version's default.
 */
function settingsFor(pack: Pack, installed: Installed, sent: ReadonlyMap<string, Json | null> = new Map()): Diff['config'] {
  const declared = pack.manifest.config ?? {};
  const chosen = installed.config?.[pack.manifest.pack] ?? {};
  return Object.entries(declared).map(([key, setting]) => {
    const given = sent.get(key);
    if (given !== undefined && given !== null) return { key, type: setting.type, value: given, from: 'given' as const };
    /* `null` SENT PUTS THE SETTING BACK TO ITS DEFAULT, as `setPackConfig` reads it, so a value chosen before is not kept. */
    if (Object.hasOwn(chosen, key) && !sent.has(key)) {
      const still = configValue(key, setting, chosen[key]);
      if (still.ok) return { key, type: setting.type, value: still.value, from: 'kept' as const };
    }
    if (setting.default !== undefined) return { key, type: setting.type, value: setting.default, from: 'default' as const };
    return { key, type: setting.type, value: null, from: 'none' as const };
  });
}

/**
 * The values sent with an install that its settings take, each checked as a setting is set (`configValue`). `null` puts
 * the setting back to its default, as `setPackConfig` does. What does not fit is said as a warning, by the setting's name.
 */
function settingsSent(pack: Pack, settings: PlanOptions['settings']): { values: Map<string, Json | null>; warnings: { at: string; say: string }[] } {
  const values = new Map<string, Json | null>();
  const warnings: { at: string; say: string }[] = [];
  const declared = pack.manifest.config ?? {};
  for (const [key, raw] of Object.entries(settings ?? {})) {
    if (raw === undefined) continue;
    /* OWN KEYS ONLY: `toString` is not a setting because every object answers to it. */
    const setting = Object.hasOwn(declared, key) ? declared[key] : undefined;
    if (raw === null) {
      if (setting) values.set(key, null);
      continue;
    }
    const named = typeof setting?.label === 'string' && setting.label !== '' ? setting.label : key;
    if (!setting) {
      warnings.push({ at: `config.${key}`, say: `This add-on has no setting called ${key}, so the value sent for it was not used.` });
      continue;
    }
    const fits = configValue(key, setting, raw, `config.${key}`);
    if (fits.ok) values.set(key, fits.value);
    else warnings.push({ at: `config.${key}`, say: `The value sent for ${named} does not fit it, so it keeps its own.` });
  }
  return { values, warnings };
}

/**
 * A filled note as the line of text a note is. A note that is one `{{config:}}` of a list setting fills whole, as its
 * array, and `String` would have read that `rent,rates`; it reads as the placeholder inside text does, joined by a comma.
 */
const noteOf = (filled: Json): string => (Array.isArray(filled) ? filled.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ') : String(filled));

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
      ...(seed.note === undefined ? {} : { note: noteOf(fillConfig(seed.note, values)) }),
    };
  });
  return { ...pack, declarations, seeds };
}

/** The kernel's own lists, which migration 2 seats in every record and no pack declares. */
const KERNEL_LISTS = new Set(['session']);

/**
 * Every list a declaration points at, with where: a field's `to:`, a page's `requires` and block sources, a metric's
 * `source`, the lists a feed writes, and the list a rule is about or creates rows in.
 *
 * A FEED'S LIST AND A RULE'S WERE LEFT OUT, and they are the lists a pack leans on hardest. On a record with no readings
 * list, a feed writing `datapoints` planned with nothing unresolved, installed, and counted its first run as `ok` and
 * `changed` while every answer went to review with "There is no register called datapoints" (`live-feed.test.ts`). A
 * rule about a list nothing holds has no row to fire on, and one that creates rows in it has nowhere to put them.
 * `writes.register` is a name or a routing table, and each row of the table names a list, so each is counted.
 */
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
  if (decl.kind === 'ingest' && isObject(body.writes)) {
    const target = body.writes.register;
    add(target, `${decl.id}.writes.register`, false);
    if (isObject(target))
      listOf(target, 'to').forEach((row, i) => {
        if (isObject(row)) add(row.register, `${decl.id}.writes.register.to[${i}].register`, false);
      });
  }
  if (decl.kind === 'rule') {
    add(body.register, `${decl.id}.register`, false);
    if (isObject(body.on) && isObject(body.on.written)) add(body.on.written.register, `${decl.id}.on.written.register`, false);
    /* A `create` IN THE RULE'S OWN LIST OF ACTIONS, as `spawnsOf` reads one, and not inside a branch: the steps a
       branch nests are the lint's to walk, under its own ceiling on depth, and a second walk here would need a second
       copy of that ceiling. */
    for (const key of ['then', 'steps'])
      listOf(body, key).forEach((a, i) => {
        if (isObject(a) && isObject(a.create)) add(a.create.register, `${decl.id}.${key}[${i}].create.register`, false);
      });
  }
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
  /* AND EVERY LIST IT EXTENDS, which it leans on harder than a page does: there is nothing to lay a field on. */
  for (const id of Object.keys(pack.manifest.extends ?? {})) {
    const register = id.slice('register.'.length);
    if (held.has(register) || out.some((u) => u.register === register)) continue;
    out.push({ register, at: `extends.${id}`, provider: FIRST_PARTY_LISTS.get(register) ?? null });
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

/**
 * What `next`, the update's page, adds that the owner's page lacks, or `null` when it adds nothing they miss.
 *
 * AGAINST BOTH THE BODY THE EDIT STARTED FROM AND THE OWNER'S OWN. The first says what the update added, and without it
 * a block the owner took off would be offered back at every update. The second leaves out what the owner has already,
 * since somebody who wrote their own Late table is not told they lack one. A block is known by its kind and heading,
 * and one with no heading by all it says. Bodies are JSON text as the record holds them; one that does not parse
 * brings nothing, because a plan never throws over what it was handed.
 */
function broughtTo(id: string, before: string, owner: string, next: Readonly<Record<string, Json>>): Brought | null {
  const read = (text: string): Record<string, Json> | null => {
    try {
      const body = JSON.parse(text) as Json;
      return typeof body === 'object' && body !== null && !Array.isArray(body) ? body : null;
    } catch {
      return null;
    }
  };
  const was = read(before);
  const theirs = read(owner);
  if (was === null || theirs === null) return null;
  const blocksOf = (body: Readonly<Record<string, Json>>): Record<string, Json>[] =>
    Array.isArray(body.blocks) ? body.blocks.filter((b): b is Record<string, Json> => typeof b === 'object' && b !== null && !Array.isArray(b)) : [];
  const keyOf = (b: Record<string, Json>): string => (typeof b.heading === 'string' && b.heading !== '' ? `${String(b.kind)} ${b.heading}` : jcs(b));
  const had = new Set([...blocksOf(was), ...blocksOf(theirs)].map(keyOf));
  const blocks = blocksOf(next)
    .filter((b) => !had.has(keyOf(b)))
    .map((b) => ({ kind: String(b.kind), ...(typeof b.heading === 'string' && b.heading !== '' ? { heading: b.heading } : {}) }));
  const title = typeof next.title === 'string' && next.title !== was.title && next.title !== theirs.title ? next.title : undefined;
  return title === undefined && blocks.length === 0 ? null : { id, ...(title === undefined ? {} : { title }), blocks };
}

/** A block's kind as a person says it. The rest are "block": `bar` and `lines` are the format's words, not theirs. */
const BLOCK_WORDS: Readonly<Record<string, string>> = { table: 'table', note: 'note', link: 'link', cards: 'cards', stat: 'figures' };
/** The words above that are already many, and so take no "a" when a block has no heading: "adds cards", never "a cards". */
const BLOCK_MANY: ReadonlySet<string> = new Set(['cards', 'figures']);
/** The most blocks one page's sentence names before it counts the rest. The title is always said. */
const BROUGHT_NAMED = 3;

/** One block as the sentence says it: "the Late table", "a table" with no heading, and never "the Late table table". */
function broughtWord(block: { kind: string; heading?: string }): string {
  const word = BLOCK_WORDS[block.kind] ?? 'block';
  if (block.heading === undefined) return BLOCK_MANY.has(word) ? word : an(word);
  return block.heading.toLowerCase().endsWith(` ${word}`) ? `the ${block.heading}` : `the ${block.heading} ${word}`;
}

/**
 * The one question an update raises about the pages it kept as the owner changed them, or `null` when none of them
 * lacks anything this version adds.
 *
 * ONE FOR THE UPDATE, HOWEVER MANY PAGES. It says what each kept page goes without, by the block's heading and the
 * title's own word, and that the page is kept either way, so the choice is the owner's and never made for them:
 * "Founder 2.6.0 adds the Late table and the title Today to Home, which you changed." `names` says a pack and a
 * page as the reader knows them, as it does for `conflictFault`.
 */
export function keptQuestion(diff: Pick<Diff, 'pack' | 'brings'>, names: (id: string) => string = (id) => id): KeptQuestion | null {
  const brings = diff.brings ?? [];
  if (brings.length === 0) return null;
  const pack = `${names(diff.pack.id)} ${diff.pack.version}`;
  const said = brings.map((b) => {
    /* THE TITLE IS NEVER COUNTED AWAY. Folded into "3 more" with the blocks, the one thing that renames the page in the
       rail was the thing the sentence dropped, and "more" said more of nothing. */
    const blocks = [...new Set(b.blocks.map(broughtWord))];
    const named = blocks.length > BROUGHT_NAMED ? [...blocks.slice(0, BROUGHT_NAMED - 1), `${blocks.length - (BROUGHT_NAMED - 1)} more blocks`] : blocks;
    return `${joined([...named, ...(b.title === undefined ? [] : [`the title ${b.title}`])])} to ${names(b.id)}`;
  });
  const one = brings.length === 1;
  return {
    about: `${pack} adds to ${one ? 'a page' : 'pages'} you changed`,
    line: `${pack} adds ${said.join(', and ')}, which you changed. ${one ? 'Your page is' : 'Your pages are'} kept as you left ${one ? 'it' : 'them'}. Take the update's ${one ? 'page' : 'pages'}, or keep yours.`,
    pages: brings.map((b) => b.id),
  };
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
    fix: `${id} points at the ${first.register} list (${first.at}), which is not here and ${id} does not declare.${
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
/** A kept declaration's kind by its id: a rebased list, or a page with the update's words carried in. */
const keptKind = (id: string): DeclKind => (id.startsWith('page.') ? 'page' : 'register');

/** The owner's page with the update's words carried in (`reworded`), as stored text, or `null` for no word to carry. */
function rewordedPage(from: string, mine: string, now: string): { body: string; words: string[]; rail?: true } | null {
  try {
    const out = reworded(JSON.parse(from) as Json, JSON.parse(mine) as Json, JSON.parse(now) as Json);
    const body = out === null ? null : canonicalise(out.body);
    return out === null || body === null ? null : { body, words: out.words, ...(out.rail ? { rail: true as const } : {}) };
  } catch {
    return null;
  }
}

/**
 * The owner's list with a words-only update's words carried in (`relisted`), as stored text; `{ body: null }` for an
 * update that only rewords it where the owner's list keeps none of the old words, and `null` for one that changes more.
 */
function relistedList(from: string, mine: string, now: string): { body: string | null; words: string[] } | null {
  try {
    const out = relisted(JSON.parse(from) as Json, JSON.parse(mine) as Json, JSON.parse(now) as Json);
    if (out === null || out.body === null) return out === null ? null : { body: null, words: [] };
    const body = canonicalise(out.body);
    return body === null ? null : { body, words: out.words };
  } catch {
    return null;
  }
}

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

type Holders = (fields: readonly string[]) => ReturnType<NonNullable<Installed['holding']>>;

/** `Installed.holding` for one list declaration, as `laidBack` asks it; absent when the record cannot count. */
const holdersOf = (installed: Installed, id: string): Holders | undefined =>
  installed.holding === undefined || !id.startsWith('register.') ? undefined : (fields) => installed.holding!(id.slice('register.'.length), fields);

/** A `laidBack`'s counts as `Diff['stays']` carries them: none when the record did not count, `binned` only when any is. */
const counts = (back: { holding?: Record<string, number>; binned?: Record<string, number> }): { holding?: Record<string, number>; binned?: Record<string, number> } => ({
  ...(back.holding === undefined ? {} : { holding: back.holding }),
  ...(back.binned === undefined || Object.keys(back.binned).length === 0 ? {} : { binned: back.binned }),
});

/**
 * The update's list body with every enum value the live list holds and it takes off laid back after its own values, with
 * the label the live list had for it; `null` when it takes none off, or a body will not parse (`Diff['stays']`).
 *
 * ONLY A VALUE A ROW HOLDS, when `holders` can count them (`Installed.holding`), a deleted row included, and `holding`
 * and `binned` are those counts for each one laid back. A value no row holds goes, which is what the update asked; laid
 * back on the list's row count alone, three Family rows kept Agency on Personal's People.
 * `rows` is the live count, and a list with none keeps a value only where the record counted a holder in the bin.
 *
 * ONLY ON A FIELD THAT IS STILL A CLOSED LIST OF THE SAME TYPE. A field the update takes off or retypes is `retypes`'
 * question and not this one, and a value laid on a field that is now text would be a value nothing checks.
 */
function laidBack(
  live: string,
  now: Record<string, Json>,
  rows: number,
  holders?: Holders,
): { body: string; values: string[]; holding?: Record<string, number>; binned?: Record<string, number> } | null {
  let was: unknown;
  try {
    was = JSON.parse(live);
  } catch {
    return null;
  }
  const next = Array.isArray(now.fields) ? (structuredClone(now.fields) as Record<string, unknown>[]) : null;
  if (next === null) return null;
  const at = new Map(next.filter((f) => isObject(f as Json)).map((f) => [f.id, f]));
  const lost: { id: string; then: Record<string, unknown>; f: Record<string, unknown>; gone: string[] }[] = [];
  for (const [id, then] of fieldsOf(was)) {
    const f = at.get(id);
    if (f === undefined || !Array.isArray(then.values) || !Array.isArray(f.values) || typeSaid(then) !== typeSaid(f)) continue;
    const own = f.values as unknown[];
    const gone = then.values.filter((v): v is string => typeof v === 'string' && !own.includes(v));
    if (gone.length > 0) lost.push({ id, then, f, gone });
  }
  if (lost.length === 0) return null;
  /* ASKED ONCE, AND ONLY WHEN SOMETHING WOULD GO: every plan of every pack passes through here, and a list the update
     takes nothing off has no value to count. */
  const counted = holders?.(lost.map((l) => l.id)) ?? null;
  /* A LIST WITH NO LIVE ROWS THAT COULD NOT BE COUNTED KEEPS NOTHING, as before the record counted: with no count there is
     no sign of a holder in the bin, and keeping every value would keep them on every empty list. */
  if (counted === null && rows === 0) return null;
  const values: string[] = [];
  const holding: Record<string, number> = {};
  const binned: Record<string, number> = {};
  for (const { id, then, f, gone: taken } of lost) {
    const gone = counted === null ? taken : taken.filter((v) => (counted[id]?.[v]?.held ?? 0) > 0);
    if (gone.length === 0) continue;
    f.values = [...(f.values as unknown[]), ...gone];
    const said = isObject(then.labels as Json) ? (then.labels as Record<string, unknown>) : {};
    const labels = isObject(f.labels as Json) ? (f.labels as Record<string, unknown>) : {};
    const extra = Object.fromEntries(gone.filter((v) => v in said && !(v in labels)).map((v) => [v, said[v]]));
    if (Object.keys(extra).length > 0) f.labels = { ...labels, ...extra };
    values.push(...gone.map((v) => `${id}.${v}`));
    if (counted !== null)
      for (const v of gone) {
        const { held, binned: bin } = counted[id]![v]!;
        holding[`${id}.${v}`] = held;
        if (bin > 0) binned[`${id}.${v}`] = bin;
      }
  }
  if (values.length === 0) return null;
  const body = canonicalise({ ...now, fields: next } as Json);
  return body === null ? null : { body, values, ...(counted === null ? {} : { holding, binned }) };
}

/**
 * The step a plan shows for a list it retires while the list holds rows (`Diff.removals`), named as the record names
 * it: the live body's `name`, or the list's own word when the body has none.
 */
function removalOf(register: string, live: string, rows: number): NonNullable<Diff['removals']>[number] {
  let name = register;
  try {
    const body = JSON.parse(live) as unknown;
    if (isObject(body as Json) && typeof (body as Record<string, Json>).name === 'string' && (body as Record<string, string>).name!.trim() !== '')
      name = (body as Record<string, string>).name!;
  } catch {
    /* A body that does not read keeps the list's own word. */
  }
  const kept = rows === 1 ? 'Your 1 item stays' : `Your ${rows.toLocaleString('en-GB')} items stay`;
  return { retire: register, name, rows, stays: true, line: `Retires ${name}. ${kept}, and the list can be put back.` };
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
      /* A CONDITION AFTER THE FIRST MAY OPEN WITH `or`, which `parseWhere` reads as the separator `, or` and not as words.
         Handed to `clause` whole, `direction is out, or transfer is true` began with `or`, named no field, and a pack update
         taking `transfer` off planned no conflict (`reads-field-any.test.ts`). The first condition keeps its words, as the
         grammar keeps them there: a leading `or` joins nothing and is refused by name. */
      if (SENTENCES.has(key))
        for (const [i, c] of v.split(',').map((s) => s.trim()).filter(Boolean).entries()) clause(i === 0 ? c : c.replace(/^or(?:\s+|$)/iu, ''));
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

/** The kinds a reader's sentences sit in, as `sentencesOver` reads them. */
const SENTENCE_KINDS: ReadonlySet<string> = new Set(['metric', 'rule', 'page']);

/** A list's fields that are not retired, by id. */
const liveFields = (body: unknown): Map<string, Record<string, unknown>> => new Map([...fieldsOf(body)].filter(([, f]) => f.retired !== true));

/** A list's fields as `where` reads them, with the keys the kernel's `schemaOf` sends. */
function sentenceSchema(register: string, body: unknown, fields: ReadonlyMap<string, Record<string, unknown>>): SentenceSchema {
  const b = (isObject(body as Json) ? body : {}) as { state?: unknown; series?: unknown };
  const spec = (f: Record<string, unknown>): SentenceSchema['fields'][string] => ({
    type: String(f.type),
    ...(typeof f.of === 'string' ? { of: f.of } : {}),
    ...(Array.isArray(f.values) ? { values: f.values.filter((v): v is string => typeof v === 'string') } : {}),
    ...(typeof f.to === 'string' ? { to: f.to } : {}),
    ...(typeof f.label === 'string' ? { label: f.label } : {}),
    ...(isObject(f.labels as Json) ? { labels: f.labels as Record<string, string> } : {}),
  });
  /* AND `tags` WHERE THE LIST DID NOT DECLARE ITS OWN, as the kernel's `withTags` adds it. Left out, `tags has late, lane is
     earning money` did not parse here, was passed over as unreadable, and the plan named nothing for a figure the kernel's
     `install` refuses (`test/plan-widen.test.ts`). */
  const tags = fieldsOf(body).has('tags') ? {} : { tags: { type: 'list', of: 'text' } };
  return {
    register,
    ...(typeof b.state === 'string' ? { state: b.state } : {}),
    ...(b.series === true ? { series: true } : {}),
    fields: { ...Object.fromEntries([...fields].map(([id, f]) => [id, spec(f)])), ...tags },
  };
}

/**
 * The readers whose words this version's widening would make count something else: `Diff['misreads']`.
 *
 * THE KERNEL'S QUESTION, ASKED BEFORE THE OWNER APPROVES. `stranded` parses each reader's sentence against the list as it
 * stands and again with only the opened fields changed, and a word that moves is refused (`widen.ts`, `misread`). Only
 * `install` and a filed change ask it: the pack path stages through `stageInstall`, which runs `unreadable` and
 * `lintBatch` and not `stranded`, so `mini` 1.1.0 opening `lane` installed through `installPack` and `lane is earning
 * money` went from 1 to 0 with nothing refused (`test/plan-widen.test.ts`). The plan is where the owner reads it, and
 * `install` below refuses it, so the pack path is held to what `install` is.
 *
 * WHAT THE KERNEL ASKS, IN ITS ORDER: every list this install stages over a live one, every live metric, rule and page
 * this install keeps or rewrites, and the first sentence of each that moves. A reader this version sends with other
 * bytes is asked in the words it sends, and a reader it retires reads nothing afterwards. One the owner changed and
 * this install keeps is live as the owner left it, and is asked.
 */
function misreadsOf(pack: Pack, installed: Installed, unstaged: ReadonlySet<string>, gone: ReadonlySet<string>): Diff['misreads'] {
  const read = installed.sentence;
  if (read === undefined) return [];
  const live = new Map(installed.declarations.map((d) => [d.id, d]));
  const sent = new Map(pack.declarations.map((d) => [d.id, d]));
  const doorOf = (id: string): unknown => {
    const mine = sent.get(id);
    if (mine !== undefined && !unstaged.has(id)) return mine.body;
    const held = live.get(id);
    try {
      return held === undefined ? undefined : (JSON.parse(held.body) as unknown);
    } catch {
      return undefined;
    }
  };
  const out: Diff['misreads'] = [];
  for (const decl of pack.declarations) {
    const was = live.get(decl.id);
    if (decl.kind !== 'register' || unstaged.has(decl.id) || was === undefined) continue;
    let old: unknown;
    try {
      old = JSON.parse(was.body);
    } catch {
      continue;
    }
    const before = liveFields(old);
    const after = liveFields(decl.body);
    const opened = [...before].filter(([id, f]) => after.has(id) && widens(f, after.get(id)!)).map(([id]) => id);
    if (opened.length === 0) continue;
    const register = decl.id.slice('register.'.length);
    const closed = sentenceSchema(register, old, before);
    /* ONLY THE OPENED FIELDS CHANGE, and only to the type the update gives them, as `stranded` builds its second schema,
       so a word that moves moved because of the widening and nothing else in the update. */
    const open: SentenceSchema = { ...closed, fields: { ...closed.fields } };
    for (const id of opened) {
      const f = after.get(id)!;
      open.fields[id] = { type: String(f.type), ...(typeof f.of === 'string' ? { of: f.of } : {}), ...(typeof f.label === 'string' ? { label: f.label } : {}) };
    }
    for (const reader of installed.declarations) {
      if (!SENTENCE_KINDS.has(reader.kind) || gone.has(reader.id)) continue;
      const theirs = sent.get(reader.id);
      /* A READER THIS VERSION REWRITES IS ASKED IN THE WORDS IT SENDS, as `stranded` now asks it. Skipped as "the
         update's own", a figure renamed with its words kept planned clean and the kernel refused it at staging, so the
         owner met the refusal after the press. */
      let body: Record<string, unknown>;
      if (theirs !== undefined && !unstaged.has(reader.id) && theirs.canonical !== reader.body) body = theirs.body;
      else
        try {
          body = JSON.parse(reader.body) as Record<string, unknown>;
        } catch {
          continue;
        }
      /* A RULE'S LIST, as the kernel's `rowRegisterOf` reads it: `register`, the list an `on: written` trigger names, or
         the list the door an `on: arrival` waits at writes, as this version leaves that door. */
      const subject = reader.kind === 'rule' ? rowRegisterOf(body as never, (door) => doorOf(`ingest.${door}`)) : null;
      for (const { at, where } of sentencesOver(reader.kind, body, register, subject)) {
        const then = read(where, closed);
        const now = read(where, open);
        if (then == null || now == null) continue;
        const word = misread(then, now, new Set(opened));
        if (word === null) continue;
        const name = typeof body.name === 'string' ? body.name : typeof body.title === 'string' ? body.title : reader.id;
        out.push({ id: decl.id, field: word.field, reader: reader.id, name, at, where, written: word.written, stored: word.stored });
        break;
      }
    }
  }
  return out;
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

/** A list's fields as a line: each one's label, else its id in words, the first four and "and 2 more" after them. */
const fieldsSaid = (fields: unknown): string => {
  const said = (Array.isArray(fields) ? fields : []).flatMap((f): string[] => {
    if (f === null || typeof f !== 'object') return [];
    const { label, id } = f as { label?: unknown; id?: unknown };
    const words = typeof label === 'string' && label.trim() !== '' ? label.trim() : typeof id === 'string' ? id.replace(/[_-]+/gu, ' ').trim() : '';
    return words === '' ? [] : [words];
  });
  if (said.length === 0) return 'No fields';
  const shown = said.slice(0, 4).map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w));
  const more = said.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
};

const summarise = (decl: PackDeclaration): string => {
  const body = decl.body as Record<string, unknown>;
  /* A LIST THAT PLAYS A PART FOR THE AGENTS SAYS SO: its rows become what every agent of the owner's is told. */
  /* AND IT SAYS WHAT IT HOLDS BY ITS FIELDS' LABELS (AM20), the first four and how many more: the sheet said "Readings,
     6 fields", the record's counting and not his. */
  if (decl.kind === 'register') return `${fieldsSaid(body.fields)}${typeof body.role === 'string' ? `, read by your agents as their ${body.role}` : ''}`;
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

const callsOf = (pack: Pack, installed: Installed): Diff['calls_out'] => {
  /* WHAT EACH ACTION FILES IS SAID BY NAME, the pack's lists first and then the record's (`namerOf`). */
  const named = namerOf(pack.declarations, installed.declarations, installed.nameOf);
  return pack.declarations.flatMap((d) => {
    const e = egressOf(d, installed.nameOf, installed.opensOf);
    if (e === null) return [];
    const body = d.body as { ingest?: string; url?: unknown; fetch?: { base?: unknown }; channel?: unknown; extract?: unknown };
    /* EVERY HOST, STATICALLY. A `call` and a `poll` say `url:`, and a `pull` says `url:` or `fetch.base`. */
    const host = e.host ?? (isObject(body.fetch) ? hostOf(body.fetch.base) : null);
    const line = host === e.host ? e.line : e.line.replace('CALLS OUT no host declared', `CALLS OUT ${host}`);
    /* WHAT THE OWNER HAS ALREADY APPROVED IS WHAT IS INSTALLED. A new action, or a new host, key or field on one, is
       what this install asks for. */
    const was = installed.declarations.find((i) => i.id === d.id);
    let before: Egress | null = null;
    if (was !== undefined)
      try {
        /* WITH THE SAME KEYCHAIN, since a script is compared by its whole line (`egressChanged`) and a line read without it
           says "the host its keychain entry opens" where the new one names the host: every update would ask again. */
        before = egressOf({ kind: was.kind, body: JSON.parse(was.body) as unknown }, undefined, installed.opensOf);
      } catch {
        before = null;
      }
    const change: 'new' | 'changed' | 'same' =
      was === undefined || before === null
        ? 'new'
        : egressChanged(before, e)
          ? 'changed'
          : 'same';
    /* ONLY A WRITE THAT NAMES WHAT IT FILLS, or a pull's list: a mapping that names no field says nothing a person can
       weigh, and the plans read before the key stay as they were. */
    const filed = d.kind === 'ingest' ? writesOf(d.body, named) : null;
    const writes = filed !== null && (filed.measures.length > 0 || body.channel === 'pull' && body.extract === undefined) ? filed : null;
    const floor = (d.body as { floor?: unknown }).floor;
    const atFloor = e.every !== null && typeof floor === 'string' && intervalMs(floor) !== null && intervalMs(e.every) === intervalMs(floor);
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
        ...(writes === null ? {} : { writes, writes_line: writesLine(writes) }),
        ...(atFloor ? { at_floor: true as const } : {}),
      },
    ];
  });
};

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
 * The refusal `install` gives this plan before it stages anything, other than a conflict, a stale plan or an approval,
 * or `null`. It is for the arranger to ask of every pack it files, so no plan is filed that the accept then refuses.
 *
 * ONE LIST, AND `install` READS IT TOO. `planAll` asked `unresolvedFault` and `conflictFault` and neither of the later
 * refusals, `dependents` and `extends[].refusal`, so it filed an arrangement that
 * the accept refused `PACK_REQUIRED`, and one laying `domain` twice that it refused `PROVIDES_CONFLICT` half-way through
 * (`plan-all-refusals.test.ts`). Kept in one function, what the arranger asks and what the install refuses cannot drift.
 */
export function installFault(pack: Pack, diff: Diff, options: InstallOptions = {}): Refusal | null {
  const r = faultOf(pack, diff, options);
  return r !== null && refused(r) ? r.refusal : null;
}

/**
 * What the caller of `install` says it was handed by a person, beside the plan and its approvals.
 *
 * `retireWithRows` IS HIS PRESS ON A PLAN THAT RETIRES A LIST HOLDING ROWS, the step it showed him (`Diff.removals`):
 * the Add-ons and Decide screens pass it when he pressed the plan he was shown, and `braindog pack install --force`
 * passes it when he typed it. It lifts `WOULD_ORPHAN` and nothing else: every other refusal stands, in its order. No
 * caller that updates by itself passes it (`installHeld`, the quiet updates, `firstPartyTick`), so an update nobody
 * pressed is refused as before and counted lost.
 */
export type InstallOptions = { retireWithRows?: boolean };

/**
 * A pattern this version hands on whose door it also stops declaring, and whose `hands` does not send that door to the
 * same pack, or `null`.
 *
 * THE AUTHOR'S TO SAY, NOT THE PLAN'S TO GUESS. The plan handed such a door with its pattern unasked, and the receiver's
 * first install then met a declaration its file did not declare, `{ handed: true }`, which `install` refuses
 * (`hands-names-door.test.ts`). Left to retire, the pattern arrives under its new pack naming a
 * door that is gone, which the kernel's `doorFault` refuses. Either way the file is what is wrong, and one line fixes it,
 * so the line is what is said. `DECLARATION_INVALID` at `hands.<pattern>`, since it is `hands` that reads wrong.
 */
function handsDoorFault(pack: Pack, diff: Diff): Refusal | null {
  const hands = pack.manifest.hands ?? {};
  for (const r of diff.retires) {
    if (r.to === undefined || r.body === undefined) continue;
    const named = (JSON.parse(r.body) as { door?: unknown }).door;
    if (typeof named !== 'string') continue;
    const door = `ingest.${named}`;
    /* A DOOR THIS VERSION STILL DECLARES, or one another pack holds, stays where it is, and the pattern still reaches it. */
    if (!diff.retires.some((x) => x.id === door)) continue;
    const sent = Object.hasOwn(hands, door) ? hands[door] : undefined;
    if (sent === r.to) continue;
    return {
      code: 'DECLARATION_INVALID',
      fix: `${diff.pack.id} ${diff.pack.version} hands ${r.id} to ${r.to}, and ${door}, the door it arrives through, ${
        sent === undefined ? 'to nobody, so it would retire from under the pattern' : `to ${sent}`
      }. A pattern and its door go to one pack: put "${door}": "${r.to}" in hands.`,
      at: `hands.${r.id}`,
    };
  }
  return null;
}

function faultOf(pack: Pack, diff: Diff, options: InstallOptions = {}): Result<never> | null {
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
  /* FIRST, AND READ FROM THE ADD-ON RATHER THAN FROM `diff.remote`, so a plan that did not say it is refused all the
     same. Nothing an update fixes makes an address in a note safe, so no other repair is worth naming before it. */
  const remote = addressFault(filledWith(pack, diff.config));
  if (remote) return { ok: false, refusal: remote };

  if (!diff.requires.format.ok)
    return no<never>(
      'FORMAT_OUT_OF_RANGE',
      `${diff.pack.id} needs format ${diff.requires.format.wanted} and this BrainDog is at ${diff.requires.format.has}. Update BrainDog.`,
      { at: 'requires.format' },
    );

  if (!diff.requires.primitives.ok)
    return no<never>(
      'PRIMITIVES_OUT_OF_RANGE',
      `${diff.pack.id} needs primitives ${diff.requires.primitives.wanted} and this BrainDog renders ${diff.requires.primitives.has}. Update BrainDog, or ask the author for a build against the primitives it renders.`,
      { at: 'requires.primitives' },
    );

  const missing = diff.requires.packs.find((p) => !p.ok);
  if (missing)
    return no<never>(
      'OUT_OF_BOUNDS',
      `${diff.pack.id} needs ${missing.id} ${missing.range}, and this BrainDog has ${missing.installed ?? 'none'}.`,
      { at: `requires.packs.${missing.id}` },
    );

  /* AND WHAT THE HELD PACKS ASK OF THIS ONE. money-core 2.0.0 installed under bank-hsbc-eg 1.0.0, whose `^1.8.0` it does
     not satisfy, and the plan named neither (`held-pack-range.test.ts`). `PACK_REQUIRED` because it is the kernel's code
     for the same fact from the other side, a pack another pack leans on through `requires.packs` (`disablePack`).
     REFUSED ONLY WHEN THIS STEP BREAKS IT. A requirement already false stays in `dependents` and refuses nothing: a
     record that took money-core 2.0.0 before this check would otherwise be refused every later money-core, for a range
     none of them can meet. The way out named is the order that was driven and installs: the held pack's update, first. */
  const leaning = diff.dependents.find((d) => d.was && !d.ok);
  if (leaning)
    return no<never>(
      'PACK_REQUIRED',
      `${leaning.id} ${leaning.version} needs ${diff.pack.id} ${leaning.range}, which ${diff.pack.id} ${diff.pack.version} is not, and the ${diff.pack.id} ${diff.installed_version} here is. Update ${leaning.id} to a version that takes ${diff.pack.id} ${diff.pack.version} first, then install ${diff.pack.id} ${diff.pack.version}.`,
      { at: `dependents.${leaning.id}` },
    );

  const unpaired = handsDoorFault(pack, diff);
  if (unpaired) return { ok: false, refusal: unpaired };

  /* A LIST NOTHING HOLDS IS REFUSED BEFORE ANYTHING IS STAGED. A field pointing at it would be a ref
     no row can satisfy, and a page requiring it would draw an empty table under a heading that
     promises one. */
  const unheld = unresolvedFault(diff);
  if (unheld) return { ok: false, refusal: unheld };

  /* AND A LIST THAT CANNOT TAKE WHAT THIS PACK LAYS ON IT, in the sentence `plan` wrote for it (`extended`). */
  const unlaid = diff.extends.find((e) => e.refusal !== undefined);
  if (unlaid?.refusal) return { ok: false, refusal: unlaid.refusal };

  /* AND A BLOCK FOR ANOTHER PACK'S PAGE THAT HAS NO PAGE TO GO ON, or that the page could not draw, in `addedTo`'s
     sentence. Nothing is staged for an addition, so this is the only place it can be stopped. */
  const unplaced = diff.page_adds?.find((a) => a.refusal !== undefined);
  if (unplaced?.refusal) return { ok: false, refusal: unplaced.refusal };

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
    return no<never>(
      'ID_RENAMED',
      `${renamed.from} → ${renamed.to} renames ${
        renamed.rows > 0
          ? `a spoken id, so ${renamed.from.slice(renamed.from.indexOf('.') + 1)}#<n> in a note would stop resolving`
          : `an id, so anything written against ${renamed.from} would stop resolving`
      }. Ids are stable for ever: keep ${renamed.from} and change its name instead.`,
      { at: renamed.to },
    );

  /* ROWS ARE NEVER THE PRICE OF AN UPGRADE. A pack that dropped a register somebody has been
     writing into for a year would take the year with it, so nothing that updates by itself takes it.
     BUT RETIRING TAKES NOTHING: the declaration goes and the rows stay, as an uninstall keeps them, and a
     version that declares the list again puts it back over them. So the plan shows the step
     (`removals`, "Your 41 items stay"), and his press on it (`retireWithRows`, which `--force` is) lifts
     this one refusal and no other. */
  if (diff.orphans > 0 && options.retireWithRows !== true) {
    const at = diff.retires.find((r) => r.rows > 0)!;
    return no<never>(
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
    return no<never>(
      'FIELD_TYPE_CHANGED',
      `${retyped.id}.${retyped.field}: ${retyped.from} → ${retyped.to} changes a type, and ${retyped.rows} rows were written under the old one. Retire the field and add a new one.`,
      { at: `${retyped.id}.fields.${retyped.field}.type` },
    );

  /* AND A LIST OPENED TO TEXT UNDER A READER WHOSE WORDS ONLY THE CLOSED LIST COULD READ, in the kernel's own sentence
     (`stranded`), because the pack path's `stageInstall` does not ask it and the figure would change its answer with
     nothing refused (`misreadsOf`). */
  const moved = diff.misreads[0];
  if (moved) {
    const what = moved.reader.startsWith('metric.') ? 'the figure' : moved.reader.startsWith('page.') ? 'the page' : `the ${moved.reader.slice(0, moved.reader.indexOf('.'))}`;
    const listed = pack.declarations.find((d) => d.id === moved.id)?.body as { name?: unknown } | undefined;
    const list = typeof listed?.name === 'string' ? listed.name : moved.id.slice('register.'.length);
    const says = moved.written === '' ? 'reads it differently' : `says ${moved.written}`;
    return no<never>(
      'FIELD_TYPE_CHANGED',
      `Opening ${moved.field} on ${list} to free text would quietly change which rows ${what} ${moved.name === moved.reader ? moved.reader : `${moved.name} (${moved.reader})`} reads: its ${moved.at} "${moved.where}" ${says}, which only the closed list read as ${moved.stored}, and free text compares the word as written. Write ${moved.stored} there first, then open ${moved.field}.`,
      { at: moved.reader },
    );
  }

  const demanded = diff.newly_required[0];
  if (demanded)
    return no<never>(
      'REQUIRED_ON_POPULATED',
      `${demanded.id}.${demanded.field} is required and ${demanded.rows} rows were written before it. Ship a default or a fill rule.`,
      { at: `${demanded.id}.fields.${demanded.field}.required` },
    );

  /* A TEXT SETTING IS A VALUE A PERSON CHOSE AFTER `normalise` LOOKED, so the colour rule is asked again of every body a
     setting filled. It sat in `install` after the approvals until a review of this list found `installFault` answering
     `null` for a chosen `shade: '#ff00aa'` that the accept refused (`plan-all-refusals.test.ts`). */
  const filled = settleWhen(filledWith(pack, diff.config), diff.waiting ?? []);
  for (const d of filled.declarations) {
    if (d.kind === 'theme' || d === pack.declarations.find((o) => o.id === d.id)) continue;
    const painted = colour(d.body);
    if (painted)
      return no<never>(
        'COLOUR_OUTSIDE_THEME',
        `${d.id} sets ${painted.at} to ${painted.value} from a setting. A ${d.kind} names an intent (good, warn, bad or info), and the theme names the colour.`,
        { at: `${d.id}.${painted.at}` },
      );
  }
  return null;
}

/** One declaration as `install` hands it to `Host['stage']`: `pack` absent is a row staged with no pack. */
export type StagedDeclaration = { id: string; kind: string; body: Json; pack?: string };

/**
 * The batch `install` stages for this plan, in the order it stages it: what the kernel validates at the accept.
 *
 * LIFTED OUT OF `install` SO THE ARRANGER LINTS WHAT IS STAGED. `planAll` linted each pack's file bodies, and only when
 * pages rode along, so an arrangement of two packs the kernel would not hold together was filed and the accept installed
 * the first and refused the second. The file is not the batch: a
 * kept value's body, a rebased list, a handover and what `extends` lays are all staged in its place or beside it.
 */
export function stagedBatch(pack: Pack, diff: Diff): StagedDeclaration[] {
  const filled = settleWhen(filledWith(pack, diff.config), diff.waiting ?? []);
  /* WHAT THE OWNER CHANGED IS NOT STAGED, so it stands at its own version with `pack_id` null, and a later uninstall of
     this pack still cannot take it. */
  const keep = new Set(diff.kept.filter((k) => k.rebased === undefined).map((k) => k.id));
  /* A REBASED LIST IS STAGED TWICE IN ONE BATCH: the update's body as the pack's, then the owner's additions over it with
     no pack. The kernel supersedes the first with the second, so the live row is still the owner's, and `detached()`
     then reads the pack's newest body as the one the edit started from. Staged once as the owner's, measured through
     the record: portfolio one step up went through, and the step after it was refused `{ changed: true, field:
     'launched' }`, because the edit still started from the older body and the first update's own `launched` read as
     the owner's addition. */
  const over = diff.kept.flatMap((k) => (k.rebased === undefined ? [] : [{ id: k.id, kind: keptKind(k.id), body: JSON.parse(k.rebased) as Json }]));
  /* WHAT THIS VERSION HANDS ON IS STAGED UNDER ITS NEW OWNER IN THE SAME BATCH, so the declaration is never retired: its
     rows stay readable, and a webhook's path token outlives the move, because `heldDigest` keeps a digest while every
     version since the mint is live. Retired and declared again, as money-core 1.8.0 first did, the Shortcut's door
     answered 404 from the update until the new pack was installed, and `none` after it. */
  const handing = diff.retires.flatMap((r) =>
    r.to === undefined || r.body === undefined ? [] : [{ id: r.id, kind: r.id.slice(0, r.id.indexOf('.')), body: JSON.parse(r.body) as Json, pack: r.to }],
  );
  /* WHAT IT LAYS ON ANOTHER PACK'S LIST IS STAGED WITH NO PACK, as a rebased list is, so the kernel supersedes the owner's
     row with an ordinary body and `detached()` then says whose list it was. Staged under this pack, the list would change
     owners, and taking this pack out would retire a list whose rows it never wrote. Staged under the list's own pack, its
     next update drops what was laid (`Diff['extends']` says what was measured). */
  const laid = diff.extends.flatMap((e) => (e.body === undefined ? [] : [{ id: e.id, kind: 'register', body: JSON.parse(e.body) as Json }]));
  /* AND A VALUE THAT STAYS ON A LIST THIS PACK OWNS IS STAGED AS THE PACK'S BODY OF IT, in place of the file's. Staged with
     no pack after the file's, as it once was, the list read as changed in the app from
     then on: People 2.1.0 was planned as `kept` with a rebased body, and Decide said "Keeps People as you changed it.
     This update's version of it is not taken" of an update nobody's edit stood in and that installed its `pronouns`.
     Under the pack, the next update meets the value as the pack's and `laidBack` keeps it again while rows are there. */
  const staying = new Map(diff.stays.flatMap((s) => (s.body === undefined ? [] : [[s.id, JSON.parse(s.body) as Json] as const])));
  return [
    ...filled.declarations.filter((d) => !keep.has(d.id)).map((d) => ({ id: d.id, kind: d.kind, body: staying.get(d.id) ?? d.body, pack: pack.manifest.pack })),
    ...over,
    ...handing,
    ...laid,
  ];
}

/**
 * The record as installing `diff` would leave it, for planning the next pack of an arrangement against. Nothing is
 * written: it is `installed` with what `install` stages laid on it, in `install`'s order, and what it retires taken out.
 *
 * WHAT THE ARRANGER CARRIED FORWARD WAS EACH PACK'S FILE AND `{ id, version }`, so the pack after it was planned against
 * a record the one before would not leave. Without `requires`, `base` 2.0.0 after `leaf`
 * 1.1.0 read no range and planned clean where it would have been refused; without what `extends` laid, a second pack
 * laying `domain` on the same list was planned against a list with no `domain`, filed, and refused half-way at accept.
 *
 * THE KERNEL'S TWO RULES FOR A STAGED ROW ARE KEPT: the same bytes are the same version and keep the owner they had, and
 * a row with no pack over one a pack wrote is `detached()`, naming that pack and its body. Versions count up by one and
 * checksums are empty, as nothing but a plan's hash reads them.
 */
export function plannedState(installed: Installed, pack: Pack, diff: Diff): Installed {
  const mine = pack.manifest.pack;
  const live = new Map(installed.declarations.map((d) => [d.id, d]));
  const detached = { ...(installed.detached ?? {}) };
  const put = (id: string, kind: DeclKind, pack_id: string | null, body: string): void => {
    const was = live.get(id);
    if (was?.body === body) return;
    if (pack_id !== null) delete detached[id];
    else if (was?.pack_id != null) detached[id] = { was: was.pack_id, body: was.body };
    live.set(id, { id, version: (was?.version ?? 0) + 1, kind, pack_id, body, checksum: '' });
  };
  const keep = new Set(diff.kept.filter((k) => k.rebased === undefined).map((k) => k.id));
  const staying = new Map(diff.stays.flatMap((s) => (s.body === undefined ? [] : [[s.id, s.body] as const])));
  for (const d of settleWhen(filledWith(pack, diff.config), diff.waiting ?? []).declarations) if (!keep.has(d.id)) put(d.id, d.kind, mine, staying.get(d.id) ?? d.canonical);
  for (const k of diff.kept) if (k.rebased !== undefined) put(k.id, keptKind(k.id), null, k.rebased);
  for (const r of diff.retires) if (r.to !== undefined && r.body !== undefined) put(r.id, live.get(r.id)?.kind ?? 'register', r.to, r.body);
  for (const e of diff.extends) if (e.body !== undefined) put(e.id, 'register', null, e.body);
  for (const r of diff.retires)
    if (r.to === undefined) {
      live.delete(r.id);
      delete detached[r.id];
    }
  const rows = { ...installed.rows };
  const seeded = new Set<string>();
  for (const s of diff.seeds.registers)
    if ((rows[s.register] ?? 0) === 0) {
      rows[s.register] = s.rows;
      seeded.add(s.register);
    }
  /* A LIST THIS STEP SEEDS IS COUNTED FROM ITS SEEDS, and its examples are not in the table until the accept writes them.
     Asked of the table, the next pack in the same arrangement would find no row holding a value the examples are about
     to be written under, take it off, and the kernel's stage check would refuse the accept half-way. `null` keeps every
     value on that list, as a record that cannot count does. */
  const counts = installed.holding;
  const holding = counts === undefined || seeded.size === 0 ? counts : (list: string, fields: readonly string[]) => (seeded.has(list) ? null : counts(list, fields));
  const chosen = diff.config.filter((c) => c.from === 'kept' || c.from === 'given');
  const { [mine]: _was, ...config } = installed.config ?? {};
  return {
    ...installed,
    ...(holding === undefined ? {} : { holding }),
    packs: [...installed.packs.filter((p) => p.id !== mine), { id: mine, version: pack.manifest.version, requires: pack.manifest.requires.packs }],
    declarations: [...live.values()].sort((a, b) => a.id.localeCompare(b.id)),
    rows,
    config: chosen.length === 0 ? config : { ...config, [mine]: Object.fromEntries(chosen.map((c) => [c.key, c.value])) },
    detached,
    /* WHAT THIS PACK HANDS IS HANDED FROM NOW ON, so the receiver planned next in the same arrangement leaves it be. */
    ...(installed.handed === undefined ? {} : { handed: { ...installed.handed, ...(pack.manifest.hands ?? {}) } }),
  };
}

/**
 * What the installed packs hand on, read off their stored manifests: each declaration id `hands` names, to the pack it
 * goes to. The record passes it as `Installed.handed`. A manifest that does not parse, or hands nothing, adds nothing;
 * two packs handing one id to two packs keep the first, in the order given.
 */
export function handedOf(manifests: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const text of manifests) {
    let hands: unknown;
    try {
      hands = (JSON.parse(text) as { hands?: unknown } | null)?.hands;
    } catch {
      continue;
    }
    if (hands === null || typeof hands !== 'object' || Array.isArray(hands)) continue;
    for (const [id, to] of Object.entries(hands)) if (typeof to === 'string' && !Object.hasOwn(out, id)) out[id] = to;
  }
  return out;
}

/**
 * The order to install an arrangement's packs in, so each one meets the record as the ones before it leave it. Each
 * pack is `{ id, version, requires }`, `requires` being its manifest's `requires.packs`. Stable: the order given, but
 * for a pack that has to wait for another in the same arrangement.
 *
 * TWO WAITS, AND THE ORDER GIVEN OTHERWISE. A pack waits for one whose update it needs, where the held version does not
 * meet its range and the coming one does. And a pack waits for a held pack that leans on it when its own update breaks
 * that pack's range and that pack's update takes it: measured, `base` 2.0.0 then `leaf` 1.1.0 filed and
 * refused `PACK_REQUIRED` at accept, and the same two the other way round installed. A pack both would have to wait
 * for is a pair no order installs, and is left in the order given, where `installFault` names the refusal.
 */
export function installOrder(coming: readonly { id: string; version: string; requires: Readonly<Record<string, string>> }[], installed: Installed): string[] {
  const held = (id: string) => installed.packs.find((p) => p.id === id);
  const after = new Map(coming.map((c) => [c.id, new Set<string>()]));
  for (const x of coming)
    for (const y of coming) {
      if (x.id === y.id) continue;
      const needs = x.requires[y.id];
      if (needs !== undefined && !satisfies(held(y.id)?.version ?? null, needs) && satisfies(y.version, needs)) after.get(x.id)!.add(y.id);
      const leans = held(y.id)?.requires?.[x.id];
      const next = y.requires[x.id];
      if (leans !== undefined && satisfies(held(x.id)?.version ?? null, leans) && !satisfies(x.version, leans) && (next === undefined || satisfies(x.version, next)))
        after.get(x.id)!.add(y.id);
    }
  const out: string[] = [];
  const left = coming.map((c) => c.id);
  while (left.length > 0) {
    const i = left.findIndex((id) => [...after.get(id)!].every((b) => out.includes(b)));
    if (i < 0) return [...out, ...left];
    out.push(...left.splice(i, 1));
  }
  return out;
}

/** A key an install would send that the keychain cannot give it yet: its label, why, and the record's sentence. */
export type KeyNotReady = { label: string; code: 'REQUIRED_MISSING' | 'OUT_OF_BOUNDS'; fix: string };

/**
 * EVERY KEY AN INSTALL WOULD SEND THAT IS NOT READY, each label once, in the order its calls are planned: what the plan
 * says before the press, so a person adds the key first instead of being refused after it. `install` asks the same
 * and refuses on the first.
 *
 * A SCRIPT'S LINE CARRIES ITS LABELS JOINED WITH ", " (`scriptEgress`), SO IT IS ASKED LABEL BY LABEL. Asked as the
 * joined string, a script that sends two keys asked the keychain for a key called "a, b" and could never install; the
 * labels are the script declaration's own `keys`, as `labelsSent` in the kernel's `govern.ts` reads them for Decide.
 * Read with the settings filled in, so a script whose key is `{{config:grant}}` asks for the key the setting names.
 *
 * MISSING READS `REQUIRED_MISSING` AND UNOPENABLE READS `OUT_OF_BOUNDS`: one is a key to add, the other is a key to add
 * AGAIN, under the connector, and a caller that collapsed them would tell somebody to deposit a key they have already
 * deposited. A call the record already runs unchanged asks nothing.
 */
export function keysNotReady(pack: Pack, diff: Diff, keyReady: NonNullable<Host['keyReady']>): KeyNotReady[] {
  return keysNotReadyIn(settleWhen(filledWith(pack, diff.config), diff.waiting ?? []), diff, keyReady);
}

function keysNotReadyIn(filled: Pack, diff: Diff, keyReady: NonNullable<Host['keyReady']>): KeyNotReady[] {
  const labelsOf = (c: Diff['calls_out'][number], grant: string): string[] => {
    if (c.channel !== 'script') return [grant];
    const script = filled.declarations.find((d) => d.kind === 'script' && isObject(d.body) && d.body.script === c.ingest);
    const keys = script !== undefined && isObject(script.body) ? script.body.keys : undefined;
    return Array.isArray(keys) && keys.length > 0 && keys.every((k) => typeof k === 'string') ? (keys as string[]) : [grant];
  };
  /* A KEY AN OPTIONAL `secret` SETTING NAMES IS NOT ASKED FOR WHILE IT IS MISSING (`ConfigDecl.optional`): the add-on
     installs without it and its script skips quietly until it is added. One that is there and cannot be opened is still
     said, since that is a key added the wrong way. A pack with no optional setting asks exactly as before. */
  const settings = filled.manifest.config ?? {};
  const optional = new Set(
    diff.config.filter((c) => settings[c.key]?.type === 'secret' && settings[c.key]?.optional === true && typeof c.value === 'string').map((c) => String(c.value).trim()),
  );
  const out: KeyNotReady[] = [];
  const asked = new Set<string>();
  for (const c of diff.calls_out) {
    if (c.change === 'same' || c.grant === null) continue;
    for (const label of labelsOf(c, c.grant)) {
      /* ASKED ONCE A LABEL AND A WAY OF OPENING IT, since a connector's key is held to more than a call's; SAID ONCE A LABEL. */
      const ask = `${label}\u0000${c.paged ? 1 : 0}`;
      if (asked.has(ask)) continue;
      asked.add(ask);
      const why = keyReady(label, c.paged);
      if (why !== null && why.code === 'REQUIRED_MISSING' && optional.has(label.trim())) continue;
      if (why !== null && !out.some((k) => k.label === label)) out.push({ label, code: why.code, fix: why.fix });
    }
  }
  return out;
}

/**
 * Apply the plan, or say why not.
 *
 * EVERY REFUSAL FIRST, AND THEN ONE TRANSACTION. Half a pack is a record whose pages name registers
 * it does not have, and the way to not have half a pack is to check everything before writing
 * anything and to write it all in one go.
 */
export async function install(pack: Pack, diff: Diff, host: Host, planHash: string, approve: readonly string[] = [], options: InstallOptions = {}): Promise<Result<Applied>> {
  if (planHash !== diff.planHash)
    return no<Applied>(
      'PLAN_STALE',
      'What this would install changed after the plan was read, so nothing was installed. Read the plan again.',
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
    /* A HANDED DECLARATION THIS PACK DOES NOT DECLARE (`plan`'s `handed`), and a declaration still sitting under a pack
       that was handed it and never installed, each say the way out. Before, the first read `WOULD_ORPHAN` and the second
       "belongs to notes-pack", a pack the owner had never installed, and the one exit that worked, removing that pack,
       was named by neither (`handover-guards.test.ts`). */
    if (first.handed)
      return no<Applied>(
        'PROVIDES_CONFLICT',
        `${first.id} was handed to ${first.pack} by the update of the pack that declared it, and ${first.pack} ${diff.pack.version} does not declare it, so installing it would drop ${
          first.id.startsWith('register.') ? 'the list' : 'it'
        }. Install a version of ${first.pack} that declares ${first.id}, or remove ${first.pack} to let the pack that handed it declare it again.`,
        { at: first.id },
      );
    /* `kernel` HOLDS ITS OWN DECLARATIONS WITH NO `pack` ROW, so it is the one other owner that is not installed. */
    const unheld = first.pack !== OWN && first.pack !== 'kernel' && !diff.base.packs.some(([id]) => id === first.pack);
    const step = first.pack === OWN ? undefined : diff.requires.packs.find((p) => p.id === first.pack && !p.ok);
    return no<Applied>(
      'PROVIDES_CONFLICT',
      first.pack === OWN
        ? `${first.id} was made here, and installing ${diff.pack.id} would take it over. Retire it first if you want the pack to own it.`
        : step !== undefined
          ? `${first.id} belongs to ${first.pack}${step.installed === null ? '' : ` ${step.installed}`}, and ${diff.pack.id} needs ${first.pack} ${step.range}. Update ${first.pack} first, then install ${diff.pack.id}.`
          : `${first.id} belongs to ${first.pack}, and two packs cannot own one declaration.${
              unheld
                ? ` ${first.pack} is not installed: another pack's update handed ${first.id} to it. Install ${first.pack} to take it over, or remove ${first.pack} to retire it, then install ${diff.pack.id}.`
                : ''
            }`,
      { at: first.id },
    );
  }

  /* EVERY REFUSAL THE DIFF ALONE DECIDES, in `installFault`, so the arranger can ask the same of each pack it files. */
  const fault = installFault(pack, diff, options);
  if (fault) return { ok: false, refusal: fault };

  /* WHAT IT CALLS OUT IS APPROVED IN THE SAME PRESS, OR NOTHING IS ARMED.
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
  /* THE SETTINGS ARE FILLED IN HERE, before either use below reads a declaration's body: the bodies staged are the
     bodies the plan compared, and a script's own `keys` are read filled too. Read unfilled, a script whose key is
     `{{config:grant}}` (mercury's `mercury_ledger`) asked the keychain for a key literally called `{{config:grant}}`
     and refused every install, key in the keychain or not (measured: `packs/mercury/mercury.test.ts`, "INSTALLED
     THROUGH THE RECORD'S OWN DOOR" and the self-host path). The colour rule for what a setting filled is asked in
     `installFault`. */
  const filled = settleWhen(filledWith(pack, diff.config), diff.waiting ?? []);

  /* EVERY KEY IT SENDS IS IN THE KEYCHAIN AND CAN BE OPENED (`keysNotReady`), or nothing is written. The first one
     that is not is the refusal: the plan names them all beforehand, so this is only a record that moved since. */
  const notReady = host.keyReady ? keysNotReadyIn(filled, diff, host.keyReady)[0] : undefined;
  if (notReady !== undefined) return no<Applied>(notReady.code, notReady.fix, { at: 'approve' });

  const keep = new Set(diff.kept.filter((k) => k.rebased === undefined).map((k) => k.id));
  const handing = diff.retires.filter((r) => r.to !== undefined && r.body !== undefined).length;
  const staged = await host.stage(stagedBatch(pack, diff));
  if (!staged.ok) return staged;

  /* ONE TRANSACTION, AND A REFUSAL ROLLS IT BACK. Declarations, retires, seeds and the pack row
     land together or not at all. Four separate commits meant a seed the register refused left the
     record at the new shape with the ledger still saying the old version — and the next plan of the
     identical document then reported an upgrade with an empty diff, which is the most confident
     wrong answer this module can give. */
  const { provides: _provides, ...manifest } = pack.manifest;
  /* A VALUE SENT WITH THE INSTALL IS KEPT AS ONE CHOSEN ON THE APP, so the next plan reads it as `kept`. */
  const kept = diff.config.filter((c) => c.from === 'kept' || c.from === 'given').map((c) => [c.key, c.value] as const);
  /* A LIST THAT ALREADY HOLDS ROWS HAS HAD ITS EXAMPLES. An uninstall keeps the rows, so installing the pack again used
     to plant the examples a second time beside the first ones; counted before anything is written. */
  /* PLANTED FROM THE FILLED PACK, because `plan` counted its seeds off the filled one too: planting
     from `pack` here wrote the example rows with their placeholders still in them. */
  /* WRITTEN IN THE ORDER THEIR LINKS NEED (`seedOrder`), which `normalise` has already shown exists for the whole file,
     so it exists for any part of it. */
  const unordered = seedsFor(filled, diff.adds).filter((seed) => host.count(seed.register) === 0);
  const planted = seedOrder(unordered) ?? unordered;
  const today = host.today?.() ?? new Date().toISOString().slice(0, 10);
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
      /* AND EACH IS WRITTEN ONCE, IN ITS FINAL STATE: its days counted from install day and its links already the ids
         of the rows written before it (`seedFields`), so nothing has to move a row after. */
      const made = new Map<string, string>();
      /* AND EACH ROW WITH A KEY IS REMEMBERED (`Planted`), so a later update can find it whatever it is called by then. */
      const remembered = new Map<string, Planted>();
      for (const seed of planted) {
        const row = host.seed(seed.register, seedFields(seed, today, made), seed.note);
        if (!row.ok) throw new Rolled(row);
        const id = isObject(row.value) ? row.value.id : undefined;
        if (seed.key === undefined || typeof id !== 'string') continue;
        made.set(seed.key, id);
        remembered.set(seed.key, { list: seed.register, row: id, fields: seed.fields });
      }

      /* THE SKILLS IT GIVES, after the plan named them: each into Skills unless the record holds one by that name. A host
         that cannot write one skips it, and the install goes on. */
      let skillsGiven = 0;
      for (const skill of filled.manifest.skills ?? []) if (host.giveSkill?.(skill, pack.manifest.pack) === true) skillsGiven += 1;

      /* AN UPDATE GOES OVER THE ROWS IT PLANTED BEFORE, AND WRITES ONLY WHAT THE FILE CHANGED (`seedChanges`). The write
         is the add-on's own (`Host.reseed`, the kernel's update with `pack: true`), so a field the list says is written
         `once` stays as the row holds it: a category a person renamed keeps their name through every update.
         Until this, no update touched a planted row at all, and `once` had nothing to be obeyed by.
         A ROW THE RECORD WILL NOT TAKE THE CHANGE ON DOES NOT STOP THE UPDATE. What refuses it is the record's own
         state, a name somebody has since given another row for one, and an example is not worth an add-on left on its
         old version. The row stays as it is and is remembered as it was, so the next update tries again. */
      const before = plantedOf(host.planted?.(pack.manifest.pack));
      const linked = new Map<string, string>([...[...before].map(([key, was]) => [key, was.row] as const), ...made]);
      let refreshed = 0;
      for (const seed of filled.seeds) {
        if (seed.key === undefined || remembered.has(seed.key)) continue;
        const was = before.get(seed.key);
        if (was === undefined || was.list !== seed.register) continue;
        const changes = seedChanges(seed, was);
        const patch = seedFields({ ...seed, fields: changes }, today, linked);
        const row = host.reseed === undefined || Object.keys(patch).length === 0 ? undefined : host.reseed(seed.register, was.row, patch);
        /* GONE: somebody removed the row, so it is not written and not remembered. */
        if (row?.ok === true && row.value === null) continue;
        if (row?.ok === true) refreshed += 1;
        remembered.set(seed.key, row?.ok === true ? { ...was, fields: { ...was.fields, ...changes } } : was);
      }

      host.remember({
        id: pack.manifest.pack,
        version: pack.manifest.version,
        source: pack.source.kind,
        ref: pack.source.ref ?? null,
        /* THE CHOSEN SETTINGS TRAVEL WITH THE PACK ROW, and only the ones this version still accepts. */
        manifest: jcs({
          ...manifest,
          ...(kept.length > 0 ? { config_values: Object.fromEntries(kept) } : {}),
          ...(remembered.size > 0 ? { planted: Object.fromEntries(remembered) } : {}),
        } as unknown as Json),
        checksum: pack.checksum,
        ...(diff.approve.length > 0 ? { approved: diff.approve } : {}),
        ...(diff.waiting !== undefined && diff.waiting.length > 0 ? { waiting: diff.waiting } : {}),
      });

      return ok({
        pack: pack.manifest.pack,
        version: pack.manifest.version,
        declarations: pack.declarations.length - keep.size,
        seeds: planted.length,
        ...(skillsGiven > 0 ? { skills: skillsGiven } : {}),
        retired: retiring.length,
        ...(handing > 0 ? { handed: handing } : {}),
        ...(refreshed > 0 ? { refreshed } : {}),
        ...(diff.removals !== undefined && diff.removals.length > 0 ? { rows_kept: Object.fromEntries(diff.removals.map((r) => [r.retire, r.rows])) } : {}),
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
