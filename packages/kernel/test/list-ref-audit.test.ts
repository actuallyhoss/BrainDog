/**
 * `list` by a ref, against the six findings `loop/research-batch-twenty-two-audit.md` raised on `5fde092b`.
 *
 * ONE TEST PER FINDING, AND EACH ONE WAS WATCHED FAILING FIRST. `where-ref.test.ts` holds what the
 * commit claimed and still holds; these are the six places the audit broke it by running it: an
 * oracle on a list the caller cannot read, a shared title answered with one row's jobs, a rule over
 * a row not yet written that installed dead, a row id taken on trust, a deleted row refused by the
 * id the record itself names it with, and a mismatch that depended on install order.
 *
 * THE FIRST ONE IS DRIVEN AT THE KERNEL, through `list`'s `reads`, because the kernel is where the
 * lookup happens and it cannot know who is asking. The record's `list` is what has to hand it over,
 * and that wiring is one line in `packages/record/src/index.ts` that this change does not make.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

const THINGS: Declaration = {
  id: 'register.things',
  kind: 'register',
  body: { id: 'things', name: 'Things', title: 'name', seq_prefix: 'P', fields: [{ id: 'name', type: 'text', required: true }] } as never,
};

const JOBS: Declaration = {
  id: 'register.jobs',
  kind: 'register',
  body: {
    id: 'jobs',
    name: 'Jobs',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'thing', type: 'ref', to: 'things' },
      { id: 'also', type: 'list', of: 'ref', to: 'things' },
      { id: 'tags', type: 'list', of: 'text' },
    ],
  } as never,
};

const DIARY: Declaration = {
  id: 'register.diary',
  kind: 'register',
  body: { id: 'diary', name: 'Diary', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } as never,
};

type Made = (register: string, fields: Record<string, unknown>) => string;

async function record(...more: Declaration[]): Promise<{ k: Kernel; made: Made }> {
  const k = await openRecord(openSqlite(), fixedClock(NOW));
  const installed = await k.install([THINGS, JOBS, DIARY, ...more]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const made: Made = (register, fields) => {
    const out = k.create(register, fields as never, { actor: 'p_1' }) as { ok: boolean; value: { id: string } };
    assert.ok(out.ok, JSON.stringify(out));
    return out.value.id;
  };
  return { k, made };
}

const whats = (out: unknown): string[] | string => {
  const x = out as { ok: boolean; value: { rows: { fields: { what: string } }[] }; refusal?: { code: string } };
  return x.ok ? x.value.rows.map((r) => r.fields.what).sort() : (x.refusal?.code ?? '?');
};

/* SORTED, because the rules pass runs in no order a test should lean on. */
const tagsOf = (k: Kernel, id: string): string[] | null => {
  const tags = (k.get(id) as { fields: { tags?: string[] } } | null)?.fields.tags;
  return tags ? [...tags].sort() : null;
};

test('1: a caller who cannot read the list a ref points at gets one answer whether the row exists or not', async () => {
  const { k, made } = await record();
  const harrow = made('things', { name: 'Harrow Divorce Case' });
  made('things', { name: 'Kiln' });
  made('jobs', { what: 'Paperwork', thing: harrow });
  made('jobs', { what: 'Glaze' });
  made('diary', { what: 'Monday' });

  /* She is invited to Jobs alone. Every one of these named something that exists or something that
     does not, and before the repair they answered ok 0, REF_UNKNOWN or REF_REGISTER_MISMATCH by which. */
  const hers = (register: string) => register === 'jobs';
  const asked: unknown[] = [
    { field: 'thing', is: 'Harrow Divorce Case' },
    { field: 'thing', is: 'Nobody At All' },
    { field: 'thing', is: 'P1' },
    { field: 'thing', is: 'P99' },
    { field: 'thing', is: 'things#2' },
    { field: 'thing', is: 'things#99' },
    { field: 'thing', is: 'diary#1' },
    { field: 'thing', is: 'nosuchlist#1' },
    'thing is Harrow Divorce Case',
    'thing is Nobody At All',
    'thing is P1',
    'thing is diary#1',
  ];
  const answers = asked.map((where) => whats(k.list({ register: 'jobs', where: where as never, reads: hers })));
  assert.deepEqual(new Set(answers.map((a) => JSON.stringify(a))), new Set([JSON.stringify([])]), JSON.stringify(answers));

  /* And the negation is the whole list either way, so it counts nothing either. */
  const not = (said: string) => whats(k.list({ register: 'jobs', where: { field: 'thing', not: said } as never, reads: hers }));
  assert.deepEqual(not('Harrow Divorce Case'), not('Nobody At All'));

  /* A member who reads Things as well is still refused for a row that is not there. */
  const everything = () => true;
  assert.equal(whats(k.list({ register: 'jobs', where: { field: 'thing', is: 'Nobody At All' } as never, reads: everything })), 'REF_UNKNOWN');
  assert.deepEqual(whats(k.list({ register: 'jobs', where: { field: 'thing', is: 'Harrow Divorce Case' } as never, reads: everything })), ['Paperwork']);
  /* And a spoken id on a list she cannot read reads as words, not as a row of that list. */
  const notDiary = (register: string) => register !== 'diary';
  assert.equal(whats(k.list({ register: 'jobs', where: { field: 'thing', is: 'diary#1' } as never, reads: notDiary })), 'REF_UNKNOWN');
});

test('2: two rows sharing a title are both what the title names, in the tree and the sentence', async () => {
  const { k, made } = await record();
  const kiln = made('things', { name: 'Kiln' });
  const second = made('things', { name: 'Kiln' });
  const marlow = made('things', { name: 'Marlow' });
  made('jobs', { what: 'Glaze', thing: kiln });
  made('jobs', { what: 'Fire', thing: kiln });
  made('jobs', { what: 'Second kiln job', thing: second, also: [second] });
  made('jobs', { what: 'Invoice', thing: marlow, also: [kiln] });

  const kilns = ['Fire', 'Glaze', 'Second kiln job'];
  for (const where of [{ field: 'thing', is: 'Kiln' }, { field: 'thing', in: ['Kiln'] }, 'thing is Kiln', 'thing is Kiln or Marlow'])
    assert.deepEqual(
      whats(k.list({ register: 'jobs', where: where as never })),
      typeof where === 'string' && where.includes('Marlow') ? [...kilns, 'Invoice'].sort() : kilns,
      JSON.stringify(where),
    );
  for (const where of [{ field: 'thing', not: 'Kiln' }, 'thing is not Kiln'])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Invoice'], JSON.stringify(where));
  for (const where of [{ field: 'also', has: 'Kiln' }, 'also has Kiln'])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Invoice', 'Second kiln job'], JSON.stringify(where));
  for (const where of [{ field: 'also', lacks: 'Kiln' }, 'also lacks Kiln'])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Fire', 'Glaze'], JSON.stringify(where));

  /* THE WIDENED LEAF KEEPS ITS OTHER KEYS. `has` over two Kilns became `any` of two leaves that had
     dropped `via`, and answered two rows where the same leaf over one Kiln is refused. */
  assert.equal(whats(k.list({ register: 'jobs', where: { field: 'also', has: 'Kiln', via: 'thing' } as never })), 'MATCH_OP_UNSUPPORTED');
});

test('3: a rule over a row not yet written matches as if that row matched nothing, not as if the rule were unreadable', async () => {
  const rule = (id: string, when: unknown): Declaration => ({
    id: `rule.${id}`,
    kind: 'rule',
    body: { rule: id, register: 'jobs', when, then: [{ tag: id }] } as never,
  });
  const { k, made } = await record(
    rule('notlaunch', { field: 'thing', not: 'Launch' }),
    rule('saidnot', 'thing is not Launch'),
    rule('either', { field: 'thing', in: ['Kiln', 'Launch'] }),
    rule('lacking', { field: 'also', lacks: 'Launch' }),
    rule('onlaunch', { field: 'thing', is: 'Launch' }),
  );
  const kiln = made('things', { name: 'Kiln' });
  const before = made('jobs', { what: 'Glaze', thing: kiln });
  assert.deepEqual(tagsOf(k, before), ['either', 'lacking', 'notlaunch', 'saidnot']);

  const launch = made('things', { name: 'Launch' });
  const announce = made('jobs', { what: 'Announce', thing: launch, also: [launch] });
  assert.deepEqual(tagsOf(k, announce), ['either', 'onlaunch']);
});

test('4: a row id is looked up, so one naming no row or a row of another list is refused like a spoken id', async () => {
  const { k, made } = await record();
  const gone = made('things', { name: 'Gone' });
  made('jobs', { what: 'Orphan', thing: gone });
  const job = made('jobs', { what: 'Plain' });
  assert.ok(k.update('things', gone, { deleted_at: '2026-09-21' } as never, { actor: 'p_1' }).ok);
  const nobody = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

  for (const where of [{ field: 'thing', is: nobody }, `thing is ${nobody}`, { field: 'thing', in: [gone, nobody] }])
    assert.equal(whats(k.list({ register: 'jobs', where: where as never })), 'REF_UNKNOWN', JSON.stringify(where));
  for (const where of [{ field: 'thing', is: job }, `thing is ${job}`, { field: 'also', has: job }])
    assert.equal(whats(k.list({ register: 'jobs', where: where as never })), 'REF_REGISTER_MISMATCH', JSON.stringify(where));
  for (const where of [{ field: 'thing', is: gone }, `thing is ${gone}`])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Orphan'], JSON.stringify(where));
});

test('5: a deleted row is found by its spoken id, its title and its row id alike, and by whatever nameOf calls it', async () => {
  const { k, made } = await record();
  made('things', { name: 'Kiln' });
  const gone = made('things', { name: 'Gone' });
  made('jobs', { what: 'Orphan', thing: gone, also: [gone] });
  assert.ok(k.update('things', gone, { deleted_at: '2026-09-21' } as never, { actor: 'p_1' }).ok);

  const named = k.nameOf(gone);
  assert.equal(named, 'P2');
  for (const where of [
    { field: 'thing', is: named },
    { field: 'thing', is: 'things#2' },
    { field: 'thing', is: 'Gone' },
    { field: 'thing', is: gone },
    { field: 'also', has: named },
    `thing is ${named}`,
    'thing is Gone',
    `thing is ${gone}`,
  ])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Orphan'], JSON.stringify(where));

  /* AND ONCE PURGED, `nameOf` HANDS OUT THE BARE ROW ID, so that is what the filter has to take. This
     held before the repair only because a row id was never looked up; finding 4's lookup would have
     refused it as naming no row, had the purge's own record of the list been left unread. */
  assert.equal(k.purge({ cutoffMs: NOW + 86_400_000 }).rows, 1);
  assert.equal(k.nameOf(gone), gone);
  for (const where of [{ field: 'thing', is: gone }, `thing is ${gone}`])
    assert.deepEqual(whats(k.list({ register: 'jobs', where: where as never })), ['Orphan'], JSON.stringify(where));
});

test('6: a rule naming a row of the wrong list is refused whether its lists arrive with it or before it', async () => {
  const rule = (when: unknown): Declaration => ({
    id: 'rule.wrong',
    kind: 'rule',
    body: { rule: 'wrong', register: 'jobs', when, then: [{ tag: 'wrong' }] } as never,
  });
  for (const when of [{ field: 'thing', is: 'jobs#1' }, 'thing is jobs#1', { field: 'thing', is: 'jobs#9' }]) {
    const together = await openRecord(openSqlite(), fixedClock(NOW));
    const withThem = (await together.install([THINGS, JOBS, rule(when)])) as { ok: boolean; refusal?: { code: string } };

    const apart = await openRecord(openSqlite(), fixedClock(NOW));
    assert.ok((await apart.install([THINGS, JOBS])).ok);
    const after = (await apart.install([rule(when)])) as { ok: boolean; refusal?: { code: string } };

    assert.equal(after.refusal?.code, 'REF_REGISTER_MISMATCH', JSON.stringify(when));
    assert.equal(withThem.refusal?.code, 'REF_REGISTER_MISMATCH', JSON.stringify(when));
  }
});
