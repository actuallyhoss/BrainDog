/**
 * The `via: import` runner: seven fixtures, each a `.brainl` export refused on the way back in.
 *
 * `40 §6`'s import row says *"export the record, apply the verb, import"*, and names one verb per
 * code in `tamper:`. This file reads the verb off each fixture, applies it, calls `kernel.import`
 * and holds the answer to the fixture's `code` and `at`. The harness was already written, twice:
 * `brainl.test.ts` exports signed records and damages them, and `migrate.test.ts` damages the
 * ledger. What neither did was read a fixture, so the seven files were enumeration entries with a
 * sentence attached and their addresses were checked by nothing.
 *
 * IT DRIVES THE KERNEL AND NOT `@braindog/record`, which is where `40 §6`'s table puts it, for the
 * reason `refusals-write.test.ts` gives: all seven `raises:` name `packages/kernel/src/brainl.ts` or
 * `packages/kernel/src/migrate.ts`, and a runner one layer above the raiser goes green when the
 * layer between them starts answering for itself.
 *
 * ─── NO `record:` KEY, BECAUSE THE SEEDS IT WOULD NAME DO NOT EXIST ─────────────────────────────
 *
 * `40 §6` gives this family a `record:` input, a seed record of `40 §4`, and `40 §4.1`'s
 * `seed.json` and its eight records are specified and not built. A fixture naming `record: empty`
 * would be a key that looks load-bearing and that nothing can resolve. So the record is built here,
 * one register and three rows, signed with `./signer.ts`, and it is the same record for all seven:
 * each verb is the only difference between a file that imports and a file that is refused, which
 * the first test below checks by importing the untampered file cleanly.
 *
 * ─── THE TWO LEDGER VERBS DAMAGE THE TARGET, NOT THE FILE ───────────────────────────────────────
 *
 * The `migration` table travels in a `.brainl` and is skipped on import, because the ledger is a
 * fact about the database it is in (`brainl.ts`, `SKIPPED`). Editing the export's ledger rows
 * therefore reaches neither `SCHEMA_MISMATCH` nor `SCHEMA_NEWER`: the file is refused for its
 * checksum, or imported with the edit thrown away. What does reach both is editing the TARGET's
 * ledger and reopening it, because `openRecord` makes the refusal sticky and `import` answers it
 * before it reads a line. So `migration-text` and `migration-ahead` are verbs whose object is the
 * record being imported into, and `40 §6`'s sentence says "export the record, apply the verb,
 * import" as if every verb were applied to the export.
 *
 * ─── A SEVENTH VERB `40 §6` DOES NOT LIST ───────────────────────────────────────────────────────
 *
 * `40 §6` names six verbs for seven codes, and `FILE_MALFORMED` has none. It is `not-brainl` here: the first line
 * replaced by the start of an HTML page, which is what a download saves when the link it followed answered with an
 * error page. `truncate`, cutting the last line mid-row, was measured and does not reach this code. The last line of a
 * signed export is its `dog_sig` row, which no manifest hashes, so cutting it is answered `SIGNATURE_INVALID` at
 * `dog_sig` by `signatureOf`, before any reader parses a row.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { refused, type Result } from '@braindog/ports';

import { family as familyOf, type Fixture } from '../../../fixtures/corpus.ts';
import { b64url, openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const ACTOR = 'p_1';
const SIGNER = testSigner();

const OBLIGATIONS: Declaration = {
  id: 'register.obligations',
  kind: 'register',
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'party', type: 'text' },
    ],
  } as never,
};

const ROWS = [
  { what: 'Invoice 41', party: 'Halden' },
  { what: 'Invoice 42', party: 'Northwind' },
  { what: 'Invoice 43', party: 'Osric' },
];

type Opened = { k: Kernel; sql: NodeSql };

async function source(): Promise<Opened> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW), { sign: SIGNER });
  const installed = await k.install([OBLIGATIONS]);
  assert.ok(installed.ok, `the register did not install: ${JSON.stringify(installed)}`);
  for (const row of ROWS) {
    const made = k.create('obligations', row, { actor: ACTOR });
    assert.ok(made.ok, `a seed row was refused: ${JSON.stringify(made)}`);
  }
  return { k, sql };
}

async function exported(k: Kernel): Promise<string[]> {
  const out = await k.export();
  assert.ok(out.ok, `the export was refused: ${JSON.stringify(out)}`);
  return out.value;
}

/** The lines of one `#table` block, as `[header, end)`: the header line and the line after its last row. */
function span(lines: readonly string[], table: string): [number, number] {
  const from = lines.findIndex((l) => l.startsWith(`#table ${table} `));
  assert.ok(from >= 0, `the export carries no ${table} table`);
  const next = lines.findIndex((l, i) => i > from && l.startsWith('#'));
  return [from, next < 0 ? lines.length : next];
}

/** A fresh target, or the target a ledger verb has damaged and then reopened. */
async function empty(damage?: string): Promise<Opened> {
  const sql = openSqlite();
  const clock = fixedClock(NOW);
  await openRecord(sql, clock);
  if (damage === undefined) return { k: await openRecord(sql, clock), sql };
  sql.exec(damage);
  /* REOPENED, BECAUSE THE REFUSAL IS DECIDED AT OPEN. `applyMigrations` reads the ledger once, in
     `openRecord`, and the kernel carries what it found; damaging the ledger under a kernel that is
     already open changes nothing that kernel will say. */
  return { k: await openRecord(sql, clock), sql };
}

/**
 * The verbs, one per code. Each takes the untampered export and says what to import into what.
 *
 * `into` is a fresh empty record for the four verbs that damage the file, the source record itself
 * for `not-empty`, and a fresh record whose ledger was damaged and reopened for the two ledger verbs.
 */
type Verb = (lines: string[], from: Opened) => Promise<{ file: string[]; into: Opened }>;

const VERBS: Record<string, Verb> = {
  /* A SIGNATURE OF THE RIGHT LENGTH THAT SIGNS NOTHING. Every other part of `dog_sig` is left alone,
     so the key id still matches the key and only the verify can fail. */
  sig: async (lines) => {
    const at = span(lines, 'dog_sig')[0] + 1;
    const [alg, keyId, publicKey] = JSON.parse(lines[at]!) as [string, string, string, string];
    const file = [...lines];
    file[at] = JSON.stringify([alg, keyId, publicKey, b64url(new Uint8Array(64))]);
    return { file, into: await empty() };
  },

  /* ONE ROW EDITED AND NOTHING ELSE, so the table's hash moves and its count does not. */
  row: async (lines) => {
    const [from, to] = span(lines, 'entry');
    const at = lines.findIndex((l, i) => i > from && i < to && l.includes('Invoice 42'));
    assert.ok(at >= 0, 'no entry row holds Invoice 42');
    const file = [...lines];
    file[at] = file[at]!.replace('Invoice 42', 'Invoice 24');
    return { file, into: await empty() };
  },

  /* 99 AND NOT TODAY'S FORMAT PLUS ONE, for the reason `schema-newer.yaml` gives about the ledger. */
  format: async (lines) => ({ file: ['#dogl 99', ...lines.slice(1)], into: await empty() }),

  'not-brainl': async (lines) => ({ file: ['<!doctype html>', ...lines.slice(1)], into: await empty() }),

  /* THE UNTAMPERED FILE, INTO THE RECORD IT CAME FROM, which holds three rows. */
  'not-empty': async (lines, from) => ({ file: lines, into: from }),

  'migration-text': async (lines) => ({
    file: lines,
    into: await empty("UPDATE migration SET checksum = 'not the one that was applied' WHERE version = 3"),
  }),

  'migration-ahead': async (lines) => ({
    file: lines,
    into: await empty("INSERT INTO migration (version, applied_at, checksum) VALUES (99, '2026-01-01T00:00:00.000Z', 'x')"),
  }),
};

const family: Fixture[] = familyOf('import');

/* THE COUNT IS ASSERTED SO THAT AN EIGHTH CANNOT ARRIVE UNDRIVEN, and so is the verb set: seven
   fixtures sharing six verbs would leave one code driven by another code's damage. */
test('every import fixture in the corpus is driven here, one verb each, and there are seven of them', () => {
  assert.equal(family.length, 7);
  const verbs = family.map((f) => f.keys.get('tamper'));
  for (const [i, f] of family.entries())
    assert.ok(verbs[i] !== undefined && verbs[i]! in VERBS, `${f.name} carries \`tamper: ${verbs[i]}\`, which is no verb here`);
  assert.equal(new Set(verbs).size, 7, `two fixtures share a verb: ${verbs.join(', ')}`);
});

/* THE CONTROL. Without it a verb that broke the file in some way of its own would pass for the
   right reason by accident; with it, the verb is the only thing between this file and a clean import. */
test('the untampered export imports cleanly into a fresh record', async () => {
  const from = await source();
  const into = await empty();
  try {
    const out = await into.k.import(await exported(from.k));
    assert.ok(out.ok, `the untampered file was refused: ${JSON.stringify(out)}`);
  } finally {
    from.sql.close();
    into.sql.close();
  }
});

for (const fixture of family) {
  const where = `fixtures/refusals/${fixture.name}`;
  const verb = fixture.keys.get('tamper') ?? '';

  test(`${fixture.name} raises ${fixture.keys.get('code')} from an import after \`${verb}\``, async () => {
    const from = await source();
    const { file, into } = await VERBS[verb]!(await exported(from.k), from);
    try {
      const before = into.sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n;
      const answer: Result<unknown> = await into.k.import(file);

      assert.equal(answer.ok, false, `${where}'s file was imported after \`${verb}\``);
      assert.ok(refused(answer), `${where} answered with a conflict where a refusal was named`);
      assert.equal(answer.refusal.code, fixture.keys.get('code'), `${where}: ${answer.refusal.fix}`);
      /* THE LEDGER ADDRESS WAS DROPPED AT THIS SURFACE WHEN THIS RUNNER WAS WRITTEN, and this line is what found it.
         `applyMigrations` returns `at: migration[<n>]` and `migrate.test.ts` asserts it there, but every kernel method
         answers a sticky refusal through `schemaRefusal`, which rebuilt the envelope from `code` and `fix` alone. An
         import into a record whose ledger was refused came back with no `at`, for both ledger codes. */
      assert.equal(answer.refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);
      assert.ok(/[.?!]$/.test(answer.refusal.fix.trim()), `${where} was refused with "${answer.refusal.fix}", which is not a sentence`);

      /* A REFUSED IMPORT WRITES NOTHING, which is the half of every one of these codes a caller
         cannot see in the envelope. The ledger targets are counted too: a sticky refusal that let
         the rows through would be the half-imported record `importBrainl` exists to prevent. */
      assert.equal(into.sql.one<{ n: number }>('SELECT count(*) AS n FROM entry')?.n, before, `${where}'s refused import changed the rows`);
    } finally {
      from.sql.close();
      if (into !== from) into.sql.close();
    }
  });
}
