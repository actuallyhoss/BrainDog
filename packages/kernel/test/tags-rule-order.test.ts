/**
 * A rule that tags and a list whose `tags` is typed, installed in either order, and a `list<enum>` that holds the word.
 *
 * TWO GAPS LEFT BY WAVE THIRTY-EIGHT's CHECK (`loop/BACKLOG.md`, "Left by wave thirty-eight"). That check asked a list's
 * `tags` about the rules that tag it only when the list's declaration arrived, and it asked the shape alone:
 *
 *   - `tags: list<enum>` with `late` among its values, under `rule.late` tagging `late`, was refused "would refuse every
 *     tag it writes", though every write that rule makes is a value the enum takes. Driven before this file: refused
 *     FIELD_TYPE_CHANGED on a configuration that works.
 *   - The other order was never asked. `tags: int` first (no rule tags the list, so it is the list's own choice), then
 *     `rule.late` alone: the rule installed, and the next Rent went in without its tag, no refusal and no event.
 *
 * ONE SENTENCE WHICHEVER ORDER, and it names the rule and, for an enum, the word. A templated tag on the run path is
 * filled from the run's vars or trigger, so no word exists at install to compare, and it is let through in silence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);

const WHAT = { id: 'what', type: 'text', required: true };

const jobs = (...more: Record<string, unknown>[]): Declaration => ({
  id: 'register.jobs',
  kind: 'register',
  body: { id: 'jobs', name: 'Jobs', title: 'what', fields: [WHAT, ...more] } as never,
});

const enumTags = (...values: string[]) => ({ id: 'tags', type: 'list', of: 'enum', values });

const LATE: Declaration = {
  id: 'rule.late',
  kind: 'rule',
  body: { rule: 'late', register: 'jobs', when: 'what is Rent', then: [{ tag: 'late' }] } as never,
};

async function open(...first: Declaration[]): Promise<Kernel> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const out = await k.install([jobs(), ...first]);
  assert.ok(out.ok, fixOf(out));
  return k;
}

function rent(k: Kernel): unknown {
  const made = k.create('jobs', { what: 'Rent' }, { actor: 'p_1' });
  assert.ok(made.ok, fixOf(made));
  return k.get((made.value as { id: string }).id)?.fields.tags;
}

const noEmDash = (fix: string) => assert.ok(!fix.includes(String.fromCharCode(0x2014)), 'no em dash in a sentence a stranger reads');

/* ─── (1) A list<enum> THAT HOLDS THE WORD ─── */

test('A tags list<enum> WHOSE VALUES HOLD THE WORD A RULE TAGS installs under that rule, and the rule still tags', async () => {
  const k = await open(LATE);
  const out = await k.install([jobs(enumTags('late', 'chase'))]);
  assert.ok(out.ok, `list<enum> [late, chase] refused under a rule that tags late: ${fixOf(out)}`);
  assert.deepEqual(rent(k), ['late']);
});

test('A tags list<enum> WITHOUT THE WORD is refused, naming the rule and the word the enum lacks', async () => {
  const k = await open(LATE);
  const out = await k.install([jobs(enumTags('chase'))]);
  assert.equal(out.ok, false, 'list<enum> [chase] installed under a rule that tags late');
  assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
  assert.match(fixOf(out), /rule\.late/);
  assert.match(fixOf(out), /list<enum> without late/);
  assert.match(fixOf(out), /add late to its values/);
  assert.equal((out as { refusal?: { at?: string } }).refusal?.at, 'register.jobs.fields.tags.type');
  noEmDash(fixOf(out));
  assert.deepEqual(rent(k), ['late'], 'the refusal kept the rule tagging');
});

test('NARROWING A list<enum> tags OFF THE WORD A RULE TAGS is refused, though the shape did not change', async () => {
  const k = await open(LATE);
  assert.ok((await k.install([jobs(enumTags('late', 'chase'))])).ok);
  const out = await k.install([jobs(enumTags('chase'))]);
  assert.equal(out.ok, false, 'late dropped from the values under a rule that tags late');
  assert.match(fixOf(out), /rule\.late/);
  assert.match(fixOf(out), /without late/);
});

test('AN untag OF A WORD THE ENUM LACKS IS NOT REFUSED: it writes back the words the row already holds', async () => {
  /* WITH A tag OF A WORD THE ENUM HOLDS BESIDE IT, so the row shows the patch landed. An untag alone on a row with no tags
     leaves `tags` unwritten whether or not the write went in, which is not a measurement of anything. */
  const clearing: Declaration = {
    id: 'rule.clear',
    kind: 'rule',
    body: { rule: 'clear', register: 'jobs', when: 'what is Rent', then: [{ tag: 'chase' }, { untag: 'late' }] } as never,
  };
  const k = await open(clearing);
  const out = await k.install([jobs(enumTags('chase'))]);
  assert.ok(out.ok, fixOf(out));
  assert.deepEqual(rent(k), ['chase']);
});

test('A TEMPLATED TAG ON THE RUN PATH IS NOT JUDGED AT INSTALL, in either order', async () => {
  const templated: Declaration = {
    id: 'rule.mark',
    kind: 'rule',
    body: {
      rule: 'mark',
      on: { written: { register: 'jobs', op: ['create'] } },
      steps: [{ set_var: { name: 'word', to: 'late' } }, { tag: '{{vars.word}}' }],
    } as never,
  };
  const first = await open(templated);
  const narrowed = await first.install([jobs(enumTags('chase'))]);
  assert.ok(narrowed.ok, fixOf(narrowed));

  const second = await open();
  assert.ok((await second.install([jobs(enumTags('chase'))])).ok);
  const after = await second.install([templated]);
  assert.ok(after.ok, fixOf(after));
});

test('BRACES THE RUN DOES NOT FILL ARE THE LITERAL WORD, and a list<enum> without it refuses the rule', async () => {
  /* `fill` REPLACES ONLY `{{vars.<path>}}` AND `{{trigger.<path>}}` WHOLE, the path of letters, digits, `_` and `.`, so
     `{{vars.a-b}}` and an unclosed `{{trigger.x` reach the write as they were typed. Checked by prefix alone, both
     installed over `[chase]` in silence, and every write that tagged was then refused. */
  for (const word of ['{{vars.a-b}}', '{{trigger.x', '{{vars.}}']) {
    const k = await open();
    assert.ok((await k.install([jobs(enumTags('chase'))])).ok);
    const rule: Declaration = {
      id: 'rule.mark',
      kind: 'rule',
      body: { rule: 'mark', on: { written: { register: 'jobs', op: ['create'] } }, steps: [{ tag: word }] } as never,
    };
    const out = await k.install([rule]);
    assert.equal(out.ok, false, `a run-path tag ${word}, which nothing fills, installed over list<enum> [chase]`);
    assert.match(fixOf(out), /list<enum> without/);
  }
});

test('ON THE then: PATH NOTHING FILLS A TAG, so {{vars.word}} there is the literal word and is judged', async () => {
  const k = await open();
  assert.ok((await k.install([jobs(enumTags('chase'))])).ok);
  const literal: Declaration = {
    id: 'rule.mark',
    kind: 'rule',
    body: { rule: 'mark', register: 'jobs', when: 'what is Rent', then: [{ tag: '{{vars.word}}' }] } as never,
  };
  const out = await k.install([literal]);
  assert.equal(out.ok, false, 'a then: tag of {{vars.word}} installed over list<enum> [chase]');
  assert.match(fixOf(out), /list<enum> without \{\{vars\.word\}\}/);
});

test('A LIST RESENT WITH THE tags AN EARLIER BUILD LET IN UNDER A RULE is not blamed for it', async () => {
  /* `taggerOf` ASKS AGAINST `was`, so a pack update that resends Jobs with a new field and the same `tags: int` is not
     refused for a fault the change did not make. Written into the table as that build left it. */
  const sql = openSqlite();
  const first = await openRecord(sql, fixedClock(NOW));
  assert.ok((await first.install([jobs(enumTags('late', 'chase')), LATE])).ok);
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'register.jobs' AND superseded_at IS NULL", JSON.stringify(jobs({ id: 'tags', type: 'int' }).body));
  const k = await openRecord(sql, fixedClock(NOW));

  const note = { id: 'note', type: 'text' };
  const same = await k.install([jobs({ id: 'tags', type: 'int' }, note)]);
  assert.ok(same.ok, `Jobs resent with the tags: int it already held was refused: ${fixOf(same)}`);
});

/* ─── (2) THE REVERSE ORDER: tags NARROWED FIRST, THE RULE ALONE AFTER ─── */

test('tags: int FIRST AND THEN A RULE THAT TAGS, alone: the rule is refused with the same sentence', async () => {
  const k = await open();
  assert.ok((await k.install([jobs({ id: 'tags', type: 'int' })])).ok, 'no rule tags jobs yet, so int is the list’s own choice');
  const out = await k.install([LATE]);
  assert.equal(out.ok, false, 'rule.late installed over tags: int, and every tag it writes would be dropped');
  assert.equal(codeOf(out), 'FIELD_TYPE_CHANGED');
  assert.match(
    fixOf(out),
    /^register\.jobs\.tags: every list takes tags as list<text>, and rule\.late tags jobs at then\[0\], so int would refuse every tag it writes\. Leave tags out, or declare it as list<text>\.$/,
  );
  assert.equal((out as { refusal?: { at?: string } }).refusal?.at, 'rule.late.then[0]');
  noEmDash(fixOf(out));
});

test('A list<enum> WITHOUT THE WORD FIRST AND THEN THE RULE: refused, naming the word; WITH IT: installs and tags', async () => {
  const lacking = await open();
  assert.ok((await lacking.install([jobs(enumTags('chase'))])).ok);
  const out = await lacking.install([LATE]);
  assert.equal(out.ok, false, 'rule.late installed over list<enum> [chase]');
  assert.match(fixOf(out), /rule\.late/);
  assert.match(fixOf(out), /list<enum> without late/);

  const holding = await open();
  assert.ok((await holding.install([jobs(enumTags('late', 'chase'))])).ok);
  const kept = await holding.install([LATE]);
  assert.ok(kept.ok, fixOf(kept));
  assert.deepEqual(rent(holding), ['late']);
});

test('A RULE REACHED THROUGH ITS DOOR IS ASKED TOO: an arrival rule whose door writes the narrowed list', async () => {
  const k = await open();
  assert.ok((await k.install([jobs({ id: 'tags', type: 'text' })])).ok);
  const byDoor: Declaration = {
    id: 'rule.arrived',
    kind: 'rule',
    body: { rule: 'arrived', on: { arrival: { ingest: 'jobs_in' } }, steps: [{ tag: 'fresh' }] } as never,
  };
  const door: Declaration = {
    id: 'ingest.jobs_in',
    kind: 'ingest',
    body: {
      ingest: 'jobs_in',
      channel: 'webhook',
      match: { all: [{ field: 'body', contains: 'job' }] },
      extract: { what: { text: { after: 'job ' } } },
      writes: { register: 'jobs', confidence: 'exact' },
    } as never,
  };
  const out = await k.install([door, byDoor]);
  assert.equal(out.ok, false, 'an arrival rule tagging jobs installed over tags: text');
  assert.match(fixOf(out), /rule\.arrived/);
});

test('A RULE ABOUT ANOTHER LIST, OR ONE THAT DOES NOT TAG, installs beside a narrowed tags', async () => {
  const k = await open();
  assert.ok((await k.install([jobs({ id: 'tags', type: 'int' })])).ok);
  const noting: Declaration = {
    id: 'rule.say',
    kind: 'rule',
    body: { rule: 'say', register: 'jobs', when: 'what is Rent', then: [{ note: 'rent' }] } as never,
  };
  const out = await k.install([noting]);
  assert.ok(out.ok, fixOf(out));
});

test("A PACK'S RULE STAGED OVER A NARROWED tags IS REFUSED TOO, since every pack install comes through stageInstall", async () => {
  /* `stageInstall` RUNS NO `contradicted`, so a check added there alone left the pack path as it was: driven before this
     line, `rule.late` staged over `tags: int` returned ok, and the Rent written after it held no tag. */
  const k = await open();
  assert.ok((await k.install([jobs({ id: 'tags', type: 'int' })])).ok);
  const staged = await k.stageInstall([{ ...LATE, pack: 'third' }]);
  assert.equal(staged.ok, false, "a pack's rule.late staged over tags: int");
  assert.equal(codeOf(staged), 'FIELD_TYPE_CHANGED');
  assert.match(fixOf(staged), /rule\.late tags jobs at then\[0\], so int would refuse every tag it writes/);
});

test('A RULE RESENT WITH THE SAME BYTES OVER A LIST THAT ALREADY REFUSES ITS TAG IS NOT BLAMED; ANY EDIT TO IT IS', async () => {
  /* A RECORD AN EARLIER BUILD LEFT: `rule.late` installed, and then `tags: int` under it, which the build before wave
     thirty-eight let through. Written into the table as that build left it, and read by a record opened over it. */
  const sql = openSqlite();
  const first = await openRecord(sql, fixedClock(NOW));
  assert.ok((await first.install([jobs(), LATE])).ok);
  sql.exec("UPDATE declaration SET body = ? WHERE id = 'register.jobs' AND superseded_at IS NULL", JSON.stringify(jobs({ id: 'tags', type: 'int' }).body));
  const k = await openRecord(sql, fixedClock(NOW));

  const resent = await k.install([LATE]);
  assert.ok(resent.ok, `a pack update resending rule.late unchanged was refused for a fault it did not make: ${fixOf(resent)}`);

  const edited = await k.install([{ ...LATE, body: { ...(LATE.body as object), when: 'what is Water' } as never }]);
  assert.equal(edited.ok, false, 'an edited rule.late installed over tags: int');
  assert.match(fixOf(edited), /rule\.late tags jobs at then\[0\]/);
});
