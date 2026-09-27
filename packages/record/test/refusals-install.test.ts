/**
 * The `via: install` runner: every fixture in the family, each driven through the file it names.
 *
 * `40 §6` puts this family in `record/test`, *"composing `declare`'s plan and `theme`'s checks exactly
 * as `planPack` does"*. Until this file nothing drove it: `tools/refusals/run-via.mjs install` printed
 * *"no driver"* and exited 2, and every one of these fixtures was five header lines and no input.
 *
 * ─── TWO DRIVERS, CHOSEN BY THE FIXTURE'S OWN `raises:` ─────────────────────────────────────────
 *
 * THE RUNNER DRIVES THE FILE THE FIXTURE NAMES, which is the call the write runner made first: a
 * runner one layer above the raiser goes green the day the layer between them starts answering for
 * itself. Eight name `packages/declare/src/index.ts`, whose `plan` and `install` are
 * pure over an `Installed` and a `Host`; those are driven there, with `Installed` built from the
 * fixture's `installed:` and `facts:` and a `Host` that stages nothing. Five name the kernel
 * (`packages/kernel/src/declare.ts` for four, `index.ts` for `GROUP_BY_CARDINALITY`), whose checks
 * read the `declaration` and `entry` tables, so those are driven through a real record:
 * `createRecordApi` over `openSqlite()`, `installed:` put in through `planPack` and `installPack` as a
 * person would, `facts.rows` written as rows, and then `pack:` planned and installed the same way.
 * The three that name `packages/theme/src/checks.ts` go through the record too, because the record is
 * what calls the palette checks (`src/theme-check.ts`), at the plan, before anything reaches the kernel.
 *
 * AND THE PURE DRIVER IS NOT A SHORTCUT AROUND THE RECORD, it is the only way to say two of its
 * facts. `FORMAT_OUT_OF_RANGE` and `PRIMITIVES_OUT_OF_RANGE` cite the record's format and the
 * primitives it renders, and a real record has exactly one of each (`FORMAT_VERSION`,
 * `PRIMITIVES_VERSION`). `facts.format` and `facts.primitives` are what `40 §6` gives the fixture to
 * say which record it is refused against, and only an `Installed` built here can hold a number the
 * build does not.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   pack:       the whole manifest being installed, as `normalise` reads one
 *   installed:  the packs already on the record, each a whole manifest, installed in order. `40 §6`
 *               says "active declaration bodies"; a declaration's owner is half of what several of
 *               these codes are about (`PROVIDES_CONFLICT`, `CREATE_FOREIGN_REGISTER`, `WOULD_ORPHAN`),
 *               and a manifest is the one shape that carries the bodies and their owner and version.
 *   facts:      `rows` (a count per register), `format`, `primitives`, and `disabled`, the packs
 *               switched off before the install. `disabled` is not in `40 §6`'s list of what `facts:`
 *               holds; `PACK_DISABLED` is a fact about the record and there was no other key to say it
 *               in, and the gate reads key names at column 0 and not inside a flow collection.
 *               `distinct` is in that list and no fixture here needs it: the one code about values,
 *               `GROUP_BY_CARDINALITY`, is driven on its ref arm, where the values are rows.
 *
 * ─── THE THREE THEME CODES ─────────────────────────────────────────────────────────────────────
 *
 * `contrast-floor`, `intent-inseparable` and `theme-ladder-order` were skipped by name here while
 * nothing on the install path called `packages/theme/src/checks.ts`, and a pack carrying a theme
 * below the contrast floor installed clean on both hosts (`loop/research-via-runners.md` §2 finding 3).
 * `@braindog/record` now takes `@braindog/theme` and reads every pack through `src/theme-check.ts`, so
 * they are driven like the rest. `theme-install.test.ts` drives the same three through `installPack`
 * and `setDeclaration` as well, and holds the three doors to one sentence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { install, normalise, plan, type Host, type Installed, type Pack } from '@braindog/declare';
import { FORMAT_VERSION, validateDeclaration } from '@braindog/kernel';
import { PRIMITIVES_VERSION } from 'braindog-render';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_1', level: 'owner' } };

type Refusal = { code: string; at?: string; fix: string };
type Answer = { ok: true } | { ok: false; refusal: Refusal } | { ok: false; conflict: unknown };
type Doc = Record<string, unknown> & { pack: string; declarations?: Record<string, unknown>[] };
type Facts = { rows?: Record<string, number>; format?: number; primitives?: number; disabled?: string[] };

const json = <T>(keys: Keys, key: string, where: string): T | undefined => {
  const raw = keys.get(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${where}'s \`${key}:\` is not a flow collection this reader can hand to JSON.parse: ${String(e)}`);
  }
};

/**
 * THE ONE FIXTURE A PACK CANNOT CARRY TO ITS OWN CODE, and it goes in through the app instead.
 *
 * `DEPENDENCY_UNRESOLVED` at `requires` is the kernel's page check (`declare.ts`, *"requires
 * register.clients: not installed"*), and on the pack path `declare`'s `plan` answers first. Measured
 * on a real record with the page this fixture carries: `planPack` refuses it `REGISTER_UNRESOLVED` at
 * `page.clients.requires`, because `unresolvedOf` counts a page's `requires` as a list the pack points
 * at, and `install` asks `unresolvedFault` before it stages anything. The two held-sets agreed on
 * every case tried through `planPack`: a list nobody declares, a list this version retires and a
 * disabled pack's list all answered `REGISTER_UNRESOLVED` at the plan, and the kernel's own
 * `register.session` installed clean. So the kernel's arm is never the first thing a pack meets. It is the first
 * thing a declaration set from the app meets: `setDeclaration` wraps one body as a pack for
 * `normalise` and hands it to `kernel.install` with no plan in front, and there the same page answers
 * `DEPENDENCY_UNRESOLVED` at `requires`, which is what the fixture claims. So `pack:` holds one
 * declaration and the test hands that declaration to `setDeclaration`.
 */
const IN_APP = new Set(['dependency-unresolved.yaml']);

const DECLARE = 'packages/declare/src/index.ts';
const KERNEL = new Set(['packages/kernel/src/declare.ts', 'packages/kernel/src/index.ts']);
const THEME = 'packages/theme/src/checks.ts';

const family: Fixture[] = familyOf('install');

/* THE COUNT IS ASSERTED SO THAT A SEVENTEENTH CANNOT ARRIVE UNDRIVEN. Twenty until the five
   `ACTION_` codes were measured to be `lint` and refiled (6065b04e), fifteen after, and sixteen
   since `create-foreign-register` moved in here from `lint`, where no pack alone could reach it. */
test('every install fixture in the corpus is driven here, and there are sixteen', () => {
  assert.equal(family.length, 16);
  for (const f of family) {
    assert.ok(f.keys.has('pack'), `${f.name} carries no \`pack:\`, so nothing drives it`);
    const raises = f.keys.get('raises')!;
    assert.ok(
      raises === DECLARE || KERNEL.has(raises) || raises === THEME,
      `${f.name} raises ${raises}, and this runner drives ${DECLARE}, the kernel and ${THEME} only`,
    );
  }
});

async function normalised(doc: unknown, where: string): Promise<Pack> {
  const pack = await normalise(doc);
  assert.ok(pack.ok, `${where} does not normalise: ${JSON.stringify(pack)}`);
  return pack.value;
}

/**
 * `40 §6`'s rule one for the pure half: every body lints clean, against what is live beside it.
 *
 * WITHOUT THIS THE PURE DRIVER ACCEPTED A RECORD NO KERNEL WOULD HOLD. `plan` reads `installed:` as
 * text and never asks whether a body is legal, and measured before this check existed, two fixtures
 * declared a field `"type": "number"`, which is no type (`FIELD_TYPES` has `int` and `decimal`). Both
 * agreed here; put through a real record, their `installed:` was refused `FIELD_TYPE_UNKNOWN` and
 * `required-on-populated` answered that instead of its own code. This is `lintBatch`'s order with the
 * record replaced by the packs installed before: `known` and `owners` hold them, and the batch overlays.
 */
function lintsClean(pack: Pack, before: readonly Pack[], where: string): void {
  const known = new Map<string, Record<string, unknown>>();
  const owners = new Map<string, string | null>();
  for (const p of [...before, pack])
    for (const d of p.declarations) {
      known.set(d.id, d.body);
      owners.set(d.id, p.manifest.pack);
    }
  for (const d of pack.declarations) {
    const fault = validateDeclaration({ id: d.id, kind: d.kind, body: d.body, pack: pack.manifest.pack } as never, known as never, owners);
    assert.equal(fault, null, `${where}'s ${d.id} does not lint: ${JSON.stringify(fault)}`);
  }
}

/**
 * `declare`'s `plan` then `install`, against an `Installed` the fixture wrote.
 *
 * THE `Host` STAGES NOTHING AND ACCEPTS EVERYTHING, because every refusal `install` owns is decided
 * before it calls `stage` (*"EVERY REFUSAL FIRST, AND THEN ONE TRANSACTION"*), and a double that
 * refused would be a second opinion about a pack this file exists to measure one opinion of. An
 * input that reaches `stage` is an input `install` accepted, and the test says so.
 */
async function throughDeclare(fixture: Fixture, where: string): Promise<Answer> {
  const facts = json<Facts>(fixture.keys, 'facts', where) ?? {};
  const before = json<Doc[]>(fixture.keys, 'installed', where) ?? [];
  const installed: Installed = {
    format: facts.format ?? FORMAT_VERSION,
    primitives: facts.primitives ?? PRIMITIVES_VERSION,
    record_version: 1,
    packs: [],
    declarations: [],
    rows: facts.rows ?? {},
  };
  const earlier: Pack[] = [];
  for (const [n, doc] of before.entries()) {
    const p = await normalised(doc, `${where}'s installed[${n}]`);
    lintsClean(p, earlier, `${where}'s installed[${n}]`);
    earlier.push(p);
    installed.packs.push({ id: p.manifest.pack, version: p.manifest.version });
    /* THE STORED BODY IS THE CANONICAL ONE, which is what the kernel writes and what `plan` compares
       a new body against. A `JSON.stringify` of the fixture's text would differ in key order and
       report a change on a declaration nobody changed. */
    for (const d of p.declarations)
      installed.declarations.push({ id: d.id, version: 1, kind: d.kind, pack_id: p.manifest.pack, body: d.canonical, checksum: d.canonical });
  }

  const pack = await normalised(json(fixture.keys, 'pack', where), `${where}'s pack`);
  lintsClean(pack, earlier, `${where}'s pack`);
  const diff = await plan(pack, installed);
  const host: Host = {
    count: (register) => installed.rows[register] ?? 0,
    stage: async () => ({ ok: true, value: () => ({ ok: true, value: null }) }),
    transaction: (fn) => fn(),
    reload: () => {},
    retire: () => ({ ok: true, value: null }),
    seed: () => ({ ok: true, value: null }),
    remember: () => {},
    forget: () => {},
    claimed: () => [],
  };
  return (await install(pack, diff, host, diff.planHash, diff.approve)) as Answer;
}

/** One row a register accepts, for `facts.rows`: every required text field says which row it is. */
function rowFor(decl: Record<string, unknown>, n: number, where: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of (decl.fields ?? []) as { id: string; type: string; required?: boolean }[]) {
    if (!f.required) continue;
    if (f.type !== 'text') throw new Error(`${where}: ${decl.register}.${f.id} is a required ${f.type}, and \`facts.rows\` only writes text`);
    out[f.id] = `${f.id} ${n + 1}`;
  }
  return out;
}

/**
 * The record's own `planPack` and `installPack`, on a real record, for the codes the kernel raises.
 *
 * `installed:` GOES IN THROUGH THE SAME TWO CALLS, not through `kernel.install`, because the owner of
 * a declaration is the `pack_id` column and only a pack install writes one. A register installed
 * bare belongs to nobody, and `CREATE_FOREIGN_REGISTER` is refused only against a register that
 * belongs to somebody else.
 */
async function throughRecord(fixture: Fixture, where: string): Promise<Answer> {
  const facts = json<Facts>(fixture.keys, 'facts', where) ?? {};
  const before = json<Doc[]>(fixture.keys, 'installed', where) ?? [];
  assert.equal(facts.format ?? FORMAT_VERSION, FORMAT_VERSION, `${where} names a format a real record is not at`);
  assert.equal(facts.primitives ?? PRIMITIVES_VERSION, PRIMITIVES_VERSION, `${where} names primitives a real record does not render`);

  const sql = openSqlite();
  try {
    const api = await createRecordApi({ sql, clock: fixedClock(NOW) });
    const put = async (doc: unknown): Promise<Answer> => {
      const planned = (await api.planPack({ doc }, owner)) as Answer & { value?: { diff: { planHash: string; approve: string[] } } };
      if (!planned.ok) return planned;
      const { planHash, approve } = planned.value!.diff;
      return (await api.installPack({ doc, planHash, approve }, owner)) as Answer;
    };

    for (const [n, doc] of before.entries()) {
      const landed = await put(doc);
      assert.ok(landed.ok, `${where}'s installed[${n}] did not install: ${JSON.stringify(landed)}`);
    }
    for (const [register, count] of Object.entries(facts.rows ?? {})) {
      const decl = before.flatMap((d) => d.declarations ?? []).find((d) => d.register === register);
      assert.ok(decl, `${where}'s facts.rows names ${register}, and nothing in \`installed:\` declares it`);
      for (let n = 0; n < count; n++) {
        const row = api.kernel.create(register, rowFor(decl, n, where), { actor: 'p_1' });
        assert.ok(row.ok, `${where}'s row ${n} of ${register} was refused: ${JSON.stringify(row)}`);
      }
    }
    for (const id of facts.disabled ?? []) {
      const off = (await api.disablePack({ id }, owner)) as Answer;
      assert.ok(off.ok, `${where}'s facts.disabled could not turn ${id} off: ${JSON.stringify(off)}`);
    }

    const doc = json<Doc>(fixture.keys, 'pack', where)!;
    if (IN_APP.has(fixture.name)) {
      assert.equal(doc.declarations?.length, 1, `${where} goes in through the app, and the app sets one declaration at a time`);
      return (await api.setDeclaration({ body: doc.declarations![0] }, owner)) as Answer;
    }
    return await put(doc);
  } finally {
    sql.close();
  }
}

for (const fixture of family) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the install path`, async () => {
    const raises = fixture.keys.get('raises')!;
    const answer = raises === DECLARE ? await throughDeclare(fixture, where) : await throughRecord(fixture, where);

    assert.equal(answer.ok, false, `${where}'s pack was installed`);
    assert.ok('refusal' in answer, `${where} answered with a conflict where a refusal was named`);
    const refusal = answer.refusal;
    assert.equal(refusal.code, fixture.keys.get('code'), `${where} was refused ${refusal.code}: ${refusal.fix}`);

    /* AN ABSENT `at` IS A CLAIM TOO, as the write runner and `run-via.mjs` both hold: every fixture in
       this family names one, so an answer with none has broken it. */
    assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

    assert.ok(refusal.fix.trim().length > 0, `${where} was refused with an empty fix`);
    assert.ok(/[.?!]$/.test(refusal.fix.trim()), `${where} was refused with "${refusal.fix}", which is not a sentence`);
  });
}
