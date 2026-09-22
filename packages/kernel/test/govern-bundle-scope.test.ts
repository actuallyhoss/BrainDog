/**
 * A bundle filed under a list's name carries nothing about another list.
 *
 * `loop/research-batch-nineteen-audit.md` §4. `namesFault` kept a second REGISTER out of a bundle filed as
 * `register.obligations`, and nothing else, so a rule over Diary rode in one: filed by the owner's `propose` token,
 * shown whole to the member invited to Obligations alone, and installed at acceptance. The same held for a metric
 * whose `source` is Diary, a page whose table or figure reads Diary, an ingest that writes Diary and a digest that
 * mails Diary's rows. Each case below was filed before the guard asked which lists a declaration names, not only
 * which it declares.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeOf, fixOf } from '@braindog/ports';

import { openRecord, type Declaration, type Kernel } from '../src/index.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';

const NOW = Date.UTC(2026, 8, 22, 12);

type Field = Record<string, unknown>;

const register = (id: string, name: string, fields: Field[]): Declaration => ({
  id: `register.${id}`,
  kind: 'register',
  body: { id, name, title: fields[0]!.id, fields } as never,
});

const OBLIGATIONS_FIELDS: Field[] = [
  { id: 'what', type: 'text', required: true },
  { id: 'state', type: 'enum', values: ['open', 'paid'] },
];
const OBLIGATIONS = register('obligations', 'Obligations', OBLIGATIONS_FIELDS);
const DIARY = register('diary', 'Diary', [
  { id: 'body', type: 'text' },
  { id: 'mood', type: 'enum', values: ['low', 'fine'] },
]);
/** One more enum value on Obligations: the harmless change each bundle is named for. */
const WIDER = register('obligations', 'Obligations', [OBLIGATIONS_FIELDS[0]!, { id: 'state', type: 'enum', values: ['open', 'paid', 'part'] }]);

const rule = (register: string, then: unknown[] = [{ tag: 'seen' }], once_per?: string[]): Declaration => ({
  id: `rule.${register}-watch`,
  kind: 'rule',
  body: { rule: `${register}-watch`, register, then, ...(once_per ? { once_per } : {}) } as never,
});
const metric = (register: string): Declaration => ({
  id: `metric.${register}-count`,
  kind: 'metric',
  body: { metric: `${register}-count`, name: 'Count', source: `register.${register}`, value: { count: 'id' }, format: 'int', target: { gte: 0 }, window: '30d' } as never,
});
const table = (register: string): Declaration => ({
  id: `page.${register}-table`,
  kind: 'page',
  body: {
    page: `${register}-table`,
    title: 'Look',
    blocks: [{ kind: 'table', heading: 'Rows', span: 12, source: `register.${register}`, columns: [{ field: register === 'diary' ? 'body' : 'what' }], limit: 50, empty: 'None.' }],
  } as never,
});
/** A page of figures names no list itself: the list is behind the metric, which is how the Money page leaked once. */
const figures = (id: string): Declaration => ({
  id: 'page.figures',
  kind: 'page',
  body: { page: 'figures', title: 'Figures', blocks: [{ kind: 'stat', cells: [{ metric: id }] }] } as never,
});
/**
 * A figure a page reads by a key that is not `metric`, or in its prose. `pages.ts` reads each of these as a metric id:
 * a note's `{{diary-count}}`, a forecast's `late:`, a series line's `then:` and `each:`. Measured before the walk read
 * them, each was filed under `register.obligations` with `metric.diary-count` already installed.
 */
const note = (said: string): Declaration => ({
  id: 'page.said',
  kind: 'page',
  body: { page: 'said', title: 'Said', blocks: [{ kind: 'note', tone: 'warn', heading: 'Count', span: 12, body: said }] } as never,
});
const forecast = (late: string): Declaration => ({
  id: 'page.ahead',
  kind: 'page',
  body: {
    page: 'ahead',
    title: 'Ahead',
    blocks: [{ kind: 'forecast', source: 'forecast.runway', opening: { metric: 'obligations-count' }, from: [{ register: 'obligations' }], late }],
  } as never,
});
const series = (key: 'then' | 'each', id: string): Declaration => ({
  id: 'page.months',
  kind: 'page',
  body: { page: 'months', title: 'Months', blocks: [{ kind: 'series', heading: 'By month', span: 12, series: [{ metric: 'obligations-count', [key]: id, label: 'Rows' }], back: 6 }] } as never,
});
/** A page per Obligations row, whose `{{what}}` is the row's own field and not a figure. */
const template: Declaration = {
  id: 'page.each-obligation',
  kind: 'page',
  body: { page: 'each-obligation', title: 'Obligation', for: { register: 'obligations' }, blocks: [{ kind: 'note', tone: 'warn', heading: 'What', span: 12, body: '{{what}}' }] } as never,
};
const ingest = (register: string): Declaration => ({
  id: `ingest.${register}-in`,
  kind: 'ingest',
  body: { ingest: `${register}-in`, channel: 'email', extract: { body: { after: 'Dear diary ' } }, writes: { register } } as never,
});
const digest = (register: string): Declaration => ({
  id: `digest.${register}-weekly`,
  kind: 'digest',
  body: {
    digest: `${register}-weekly`,
    schedule: { day: 'mon', at: '08:00' },
    channels: ['in-app'],
    sections: [{ heading: 'Rows', source: `register.${register}`, as: 'table', columns: [{ field: register === 'diary' ? 'body' : 'what' }] }],
  } as never,
});

async function record(): Promise<{ k: Kernel; sql: NodeSql }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  /* Diary's figure is already installed, so a page can read it without the bundle carrying it. */
  assert.ok((await k.install([OBLIGATIONS, DIARY, metric('diary')])).ok);
  return { k, sql };
}

const change = (declaration_id: string, to: unknown) => ({
  question: 'Should this change?',
  body_kind: 'change' as const,
  body: { declaration_id, to },
});
const bundle = (...declarations: Declaration[]) => ({ declarations: [WIDER, ...declarations] });
const filed = (sql: NodeSql) => sql.all('SELECT 1 FROM suggestion').length;
const accept = { decide: { option: 'accept' as const, reason: 'yes' } };

const RIDERS: [string, Declaration[], RegExp][] = [
  /* The audit's own. */
  ['a rule on Diary', [rule('diary')], /rule\.diary-watch.*diary/],
  /* A rule on Obligations that writes rows into Diary is about Diary as much as one that watches it. */
  ['a rule on Obligations that creates Diary rows', [rule('obligations', [{ create: { register: 'diary', bound: 1, fields: { body: '{what}' } } }], ['row'])], /diary/],
  ['a metric over Diary', [metric('diary')], /metric\.diary-count.*diary/],
  ['a page with a table of Diary', [table('diary')], /page\.diary-table.*diary/],
  ['a page of figures, whose figure counts Diary', [metric('obligations'), figures('diary-count'), metric('diary')], /diary/],
  /* A figure the bundle does not carry is one this check cannot read, and an unknown is not a licence. */
  ['a page of figures over a metric the bundle does not carry', [figures('somewhere-count')], /page\.figures/],
  ['a note whose prose reads an installed Diary figure', [note('{{diary-count}} rows')], /page\.said.*diary-count/],
  ['a note whose typed prose reads an installed Diary figure', [note('{{quantity: diary-count}} rows')], /page\.said.*diary-count/],
  ['a forecast whose late mark is a Diary figure', [metric('obligations'), forecast('diary-count')], /page\.ahead.*diary-count/],
  ['a series whose planned line is a Diary figure', [metric('obligations'), series('then', 'diary-count')], /page\.months.*diary-count/],
  ['a series whose repeating line is a Diary figure', [metric('obligations'), series('each', 'diary-count')], /page\.months.*diary-count/],
  ['an ingest that writes Diary', [ingest('diary')], /ingest\.diary-in.*diary/],
  ['a digest that mails Diary rows', [digest('diary')], /digest\.diary-weekly.*diary/],
];

test('A BUNDLE NAMED FOR OBLIGATIONS THAT CARRIES ANYTHING ABOUT DIARY IS REFUSED WHEN IT IS PROPOSED', async () => {
  /* Every case is tried before any is asserted, so a failure names all of them and not the first. */
  const wrong: string[] = [];
  for (const [what, riders, said] of RIDERS) {
    const { k, sql } = await record();
    const out = k.propose(change('register.obligations', bundle(...riders)), 'p_1');
    if (out.ok) wrong.push(`${what}: filed`);
    else if (codeOf(out) !== 'VALUE_MALFORMED' || (out as { refusal: { at: string } }).refusal.at !== 'body.to' || !said.test(fixOf(out)))
      wrong.push(`${what}: ${codeOf(out)} ${fixOf(out)}`);
    else if (filed(sql) !== 0) wrong.push(`${what}: a row was written`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

test('AND ONE ALREADY IN THE QUEUE IS REFUSED WHEN IT IS ACCEPTED, installing nothing', async () => {
  const { k, sql } = await record();
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG90', 'change', ?, 'open', 'p_1', ?)",
    JSON.stringify({ declaration_id: 'register.obligations', to: bundle(rule('diary')) }),
    new Date(NOW).toISOString(),
  );
  const out = k.decide('SG90', accept, 'p_owner');
  assert.equal(codeOf(out), 'VALUE_MALFORMED', JSON.stringify(out));
  assert.equal(sql.one<{ status: string }>("SELECT status FROM suggestion WHERE id = 'SG90'")?.status, 'open');
  assert.equal(sql.all("SELECT 1 FROM declaration WHERE id = 'rule.diary-watch'").length, 0);
  sql.close();
});

test('and a bundle whose every declaration is about Obligations is still filed, accepted and installed', async () => {
  const { k, sql } = await record();
  const riders = [rule('obligations'), metric('obligations'), table('obligations'), figures('obligations-count'), ingest('obligations'), digest('obligations'), note('{{obligations-count}} rows, `{{diary-count}}` is text'), template];
  const made = k.propose(change('register.obligations', bundle(...riders)), 'p_1');
  assert.ok(made.ok, fixOf(made));
  const out = k.decide(made.value.id, accept, 'p_owner');
  assert.ok(out.ok, fixOf(out));
  const put = await k.install((out.value.install as { declarations: Declaration[] }).declarations);
  assert.ok(put.ok, fixOf(put));
  for (const d of riders) assert.equal(sql.all('SELECT 1 FROM declaration WHERE id = ? AND superseded_at IS NULL', d.id).length, 1, d.id);
  sql.close();
});

test('a bundle filed under a name that is not a list is not held to one', async () => {
  /* The record shows a change to a rule only to whoever reads the whole record, so nothing in it reaches anybody it is not about. */
  const { k, sql } = await record();
  const made = k.propose(change('rule.diary-watch', { declarations: [rule('diary'), metric('obligations')] }), 'p_1');
  assert.ok(made.ok, fixOf(made));
  sql.close();
});
