/**
 * The `via: write` runner: sixteen fixtures, driven through the kernel's own write path.
 *
 * `52 §5.3` files these as tests and not as gates, in one line: *"the script owns the enumeration,
 * the tests own the behaviour"*. `tools/gates/refusal-fixtures.mjs` holds every code to having a
 * fixture and every fixture to naming a file that still says its code. What nothing did until now
 * was take a fixture's input, run the surface and compare the answer. That gap is why twelve
 * fixtures spent months carrying an `at` prefix (`fields.<id>`, `args.<k>`) that no refusal has
 * ever contained: `40 §6`'s own table said so, and nothing executed the table.
 *
 * IT DRIVES THE KERNEL AND NOT `@braindog/record`, which is where `40 §6`'s table puts it. All
 * sixteen `raises:` name a file of the kernel's write path (`index.ts`, `coerce.ts`, or `referenced.ts`, which that
 * path calls), and a
 * runner one layer above the raiser is a runner that goes green when the layer between them starts
 * answering for itself. The register is the surface that raises the code, so the register is the
 * surface the fixture is driven against.
 *
 * ─── WHAT A FIXTURE CARRIES ─────────────────────────────────────────────────────────────────────
 *
 *   declare:  one register, as `40 §6`'s Input keys column says
 *   rows:     the rows that exist before the write. An entry with a `seq` is an UPDATE of that row
 *             rather than a create, which is how `version-stale` gets a row at version 2 to be
 *             stale against. `seq` cannot collide with a field, because a patch naming a field the
 *             register has not got is `FIELD_UNKNOWN` and could never be a prior row.
 *   write:    `register`, `seq?`, `patch`, `version?`. No `seq` is a create.
 *
 * `principal:` is in the column and no fixture here carries one. The kernel's `WriteContext` takes
 * an `actor` string and not a principal; a level is what the surface above it checks. Writing
 * `principal: { kind: person, level: owner }` into every file and mapping each onto the same `p_1`
 * would be a key that looks load-bearing and is not.
 *
 * ─── THE INPUT IS JSON, WHICH IS YAML ───────────────────────────────────────────────────────────
 *
 * Nothing in this repository parses YAML: `42 §2` puts the one parser behind a `@braindog/declare`
 * subpath that does not exist, and `refusal-fixtures.mjs` reads column-0 scalars with forty lines
 * of its own for exactly that reason. So the bodies here are YAML **flow** collections, which are
 * JSON, spread over several lines with every continuation indented. Three things hold at once:
 * the gate's reader sees one key line and skips the rest; the corpus reader joins the lines so
 * `JSON.parse` can have them; and the day `./yaml` lands, a real parser reads the same files
 * unchanged and gets the same mappings. A literal block scalar would have been easier to type and
 * would have made `declare` a string instead of a map, which is the one thing that would not
 * survive.
 *
 * THE READER IS IN `fixtures/corpus.ts`, WHICH IS WHERE THE FIXTURES ARE. It was a copy in this
 * file and a second copy in `apps/web/test/refusals-render.test.ts` for one commit, differing only
 * in which continuation each had reached for first, and that module's header records why one
 * module beside the corpus beats a workspace package neither runner can depend on. What stays here
 * is the one step after it: a flow collection is text until something calls `JSON.parse`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, conflicted, refused, type Result } from '@braindog/ports';

import { family as familyOf, type Fixture, type Keys } from '../../../fixtures/corpus.ts';
import { openRecord, type Entry, type RegisterDecl } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 5, 12);
const ACTOR = 'p_1';

const json = <T>(keys: Keys, key: string, where: string): T | undefined => {
  const raw = keys.get(key);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${where}'s \`${key}:\` is not a flow collection this reader can hand to JSON.parse: ${String(e)}`);
  }
};

const family: Fixture[] = familyOf('write');

/* THE COUNT IS ASSERTED SO THAT AN EIGHTEENTH CANNOT ARRIVE UNDRIVEN. `40 §6`'s table says the write
   family is sixteen; `currency-fixed` (REC-B04, batch 40) made it seventeen. A new one finds out here that it needs a
   body, rather than joining a family that nothing runs. */
test('every write fixture in the corpus is driven here, and there are seventeen of them', () => {
  assert.equal(family.length, 17);
  for (const f of family) assert.ok(f.keys.has('declare'), `${f.name} carries no \`declare:\`, so nothing drives it`);
});

type Write = { register: string; seq?: number; patch: Record<string, unknown>; version?: number };
type Row = Record<string, unknown> & { seq?: number };

for (const fixture of family) {
  const where = `fixtures/refusals/${fixture.name}`;

  test(`${fixture.name} raises ${fixture.keys.get('code')} from the write path`, async () => {
    const decl = json<RegisterDecl>(fixture.keys, 'declare', where)!;
    const spec = json<Write>(fixture.keys, 'write', where)!;
    const rows = json<Row[]>(fixture.keys, 'rows', where) ?? [];

    const sql = openSqlite();
    try {
      const k = await openRecord(sql, fixedClock(NOW));
      /* Through the real install, not an INSERT. A fixture that reaches around the pack pipeline is
         a fixture that keeps passing after the pipeline stops accepting its declaration. */
      const installed = await k.install([{ id: `register.${decl.id}`, kind: 'register' as const, body: decl as never }]);
      assert.ok(installed.ok, `${where}'s \`declare:\` did not install: ${JSON.stringify(installed)}`);

      for (const [n, row] of rows.entries()) {
        const { seq, ...patch } = row;
        const before =
          seq === undefined
            ? k.create(decl.id, patch, { actor: ACTOR })
            : k.update(decl.id, `${decl.id}#${seq}`, patch, { actor: ACTOR });
        assert.ok(before.ok, `${where}'s row ${n} was refused: ${JSON.stringify(before)}`);
      }

      const ctx = { actor: ACTOR, ...(spec.version === undefined ? {} : { version: spec.version }) };
      const answer: Result<Entry> =
        spec.seq === undefined
          ? k.create(spec.register, spec.patch, ctx)
          : k.update(spec.register, `${spec.register}#${spec.seq}`, spec.patch, ctx);

      assert.equal(answer.ok, false, `${where}'s write was accepted`);

      /* A RACE IS NOT A REFUSAL, AND `derived:` IS THE FIXTURE SAYING SO. The kernel answers a
         version clash with `{ version, current, actor }`, which carries no `code` and no address,
         so a runner reading `.refusal` here would throw rather than fail. `codeOf` is what reads
         the envelope as the code, and it is the only thing that can. */
      if (fixture.keys.has('derived')) {
        assert.ok(conflicted(answer), `${where} is derived from an envelope and the answer is a plain refusal`);
        assert.equal(codeOf(answer), fixture.keys.get('code'));
        assert.equal(fixture.keys.has('at'), false, `${where} claims an address, and a conflict envelope has no slot for one`);
        return;
      }

      assert.ok(refused(answer), `${where} answered with a conflict where a refusal was named`);
      const refusal = answer.refusal;
      assert.equal(refusal.code, fixture.keys.get('code'));

      /* THE ADDRESS, COMPARED AGAINST A REAL ONE FOR THE FIRST TIME. This is the assertion the
         corpus has never had, and the one that would have caught twelve fixtures writing
         `fields.<id>` where the kernel emits the bare field id. */
      assert.equal(refusal.at, fixture.keys.get('at'), `${where} claims \`at: ${fixture.keys.get('at')}\``);

      /* A SENTENCE, NOT THE FIXTURE'S SENTENCE. A fixture's `fix:` is the reader's summary; the
         kernel's quotes the caller's own values back and so exists only at runtime. What holds of
         every one is that it is a sentence, which is 30 §6's whole requirement of a fix. */
      assert.ok(refusal.fix.trim().length > 0, `${where} was refused with an empty fix`);
      assert.ok(/[.?!]$/.test(refusal.fix.trim()), `${where} was refused with "${refusal.fix}", which is not a sentence`);
    } finally {
      sql.close();
    }
  });
}
