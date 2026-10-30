/**
 * A bundle filed under a list's name carries nothing about another list.
 *
 * `namesFault` kept a second REGISTER out of a bundle filed as `register.obligations`, and nothing else, so a rule over
 * Diary rode in one: filed by the owner's `propose` token, shown whole to the member invited to Obligations alone, and
 * installed at acceptance. The same held for a metric whose `source` is Diary, a page whose table or figure reads
 * Diary, an ingest that writes Diary and a digest that mails Diary's rows. Each case below was filed before the guard
 * asked which lists a declaration names, not only which it declares.
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
  /* The first case measured. */
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

/**
 * What the filing check did not read, and the record held from the list's readers anyway.
 *
 * THE CHECK WALKED EVERY BODY AS IF IT WERE A PAGE'S, so a script's `reads` and `writes`, an arrival rule's door, a
 * rule with no row, a script naming no list and a door that calls out all named nothing but Obligations to it. Measured
 * at `bccc7ea8`, all six below were filed under `register.obligations`, and Decide then held each one from the member
 * invited to Obligations alone, since `scripts`, `automations` and `actions` refuse her the same declarations. So the
 * kernel filed them as a change to a list whose readers it would not show.
 */
const script = (id: string, reads: string[], writes: string[]): Declaration => ({
  id: `script.${id}`,
  kind: 'script',
  body: {
    script: id,
    title: 'Export',
    runs: { every: '1d' },
    egress: ['https://collector.test'],
    keys: [],
    reads,
    writes,
    source: 'export default async function run(ctx) { await ctx.record.list("diary"); }',
  } as never,
});
const OUTSIDE: [string, Declaration[], RegExp, Declaration[]][] = [
  ['a script that reads Diary', [script('peek', ['diary'], [])], /script\.peek.*diary/, []],
  ['a script that writes Diary', [script('post', [], ['diary'])], /script\.post.*diary/, []],
  [
    'an arrival rule on the door into Diary',
    [{ id: 'rule.arrived', kind: 'rule', body: { rule: 'arrived', on: { arrival: { ingest: 'letters' } }, steps: [{ notify: { say: 'It came in.' } }] } as never }],
    /rule\.arrived.*diary/,
    /* An arrival names its door by an id with no dash (`flow-lint.ts` NAME), so the door is not `ingest('diary')`'s. */
    [{ ...ingest('diary'), id: 'ingest.letters', body: { ...(ingest('diary').body as object), ingest: 'letters' } as never }],
  ],
  ['a rule on a clock, which has no row', [{ id: 'rule.nightly', kind: 'rule', body: { rule: 'nightly', on: { every: '1d' }, steps: [{ notify: { say: 'Night.' } }] } as never }], /rule\.nightly.*across all of this BrainDog/, []],
  ['a script that names no list', [script('ping', [], [])], /script\.ping.*across all of this BrainDog/, []],
  [
    'a door that polls into Obligations',
    [{ id: 'ingest.rate', kind: 'ingest', body: { ingest: 'rate', channel: 'poll', url: 'https://api.rate.example.test/v1', every: '1h', extract: { what: { after: 'rate ' } }, writes: { register: 'obligations' } } as never }],
    /ingest\.rate.*across all of this BrainDog/,
    [],
  ],
];

test('A BUNDLE NAMED FOR OBLIGATIONS CARRYING A SCRIPT, AN ARRIVAL RULE, A CLOCK OR A DOOR THAT CALLS OUT IS REFUSED', async () => {
  const wrong: string[] = [];
  for (const [what, riders, said, installed] of OUTSIDE) {
    const { k, sql } = await record();
    if (installed.length > 0) assert.ok((await k.install(installed)).ok, what);
    const out = k.propose(change('register.obligations', bundle(...riders)), 'p_1');
    if (out.ok) wrong.push(`${what}: filed`);
    else if (codeOf(out) !== 'VALUE_MALFORMED' || (out as { refusal: { at: string } }).refusal.at !== 'body.to' || !said.test(fixOf(out)))
      wrong.push(`${what}: ${codeOf(out)} ${fixOf(out)}`);
    else if (filed(sql) !== 0) wrong.push(`${what}: a row was written`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

/* `{{trigger.row.what}}` IS THE RUN'S ROW, NOT A LIST CALLED `trigger`. Measured at `bccc7ea8`: a rule on Obligations
   saying what came in was refused under `register.obligations` as reading `register.trigger`. */
test("a rule on Obligations whose step says {{trigger.row.what}} is filed under register.obligations, since trigger is the run's", async () => {
  const { k, sql } = await record();
  const says: Declaration = {
    id: 'rule.says',
    kind: 'rule',
    body: { rule: 'says', on: { written: { register: 'obligations', op: ['create'] } }, once_per: ['entry'], steps: [{ notify: { say: '{{trigger.row.what}} came in' } }] } as never,
  };
  const made = k.propose(change('register.obligations', bundle(says)), 'p_1');
  assert.ok(made.ok, fixOf(made));
  sql.close();
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

/**
 * A declaration under the id of one installed about Diary, with a body about Obligations.
 *
 * The guard read each declaration's new body and not what it replaces: `metric.diary-count` redefined over Obligations
 * was filed under `register.obligations` and installed, and every page reading the Diary figure then read Obligations
 * under a question the queue showed as a change to Obligations. The same held for the rule, the page and the digest
 * below, each measured filed before the guard read the installed body.
 */
const renamed = (d: Declaration, id: string): Declaration => {
  const [kind, name] = id.split('.') as [string, string];
  return { ...d, id, body: { ...(d.body as object), [kind]: name } as never };
};
const REPLACING: [string, Declaration, Declaration, ...Declaration[]][] = [
  ['the Diary figure, counting Obligations', metric('diary'), renamed(metric('obligations'), 'metric.diary-count')],
  ['the rule on Diary, watching Obligations', rule('diary'), renamed(rule('obligations'), 'rule.diary-watch')],
  ['the page of Diary, tabling Obligations', table('diary'), renamed(table('obligations'), 'page.diary-table')],
  ['the Diary digest, mailing Obligations', digest('diary'), renamed(digest('obligations'), 'digest.diary-weekly')],
  /* No list is named on a page of figures, so what it replaces is read through the installed metric behind its figure. */
  ['the page whose figure counts Diary, now counting Obligations', figures('diary-count'), figures('obligations-count'), metric('obligations')],
];

test('A BUNDLE NAMED FOR OBLIGATIONS THAT REPLACES A DECLARATION ABOUT DIARY IS REFUSED, however its new body reads', async () => {
  const wrong: string[] = [];
  for (const [what, was, now, ...also] of REPLACING) {
    const { k, sql } = await record();
    const put = await k.install([was]);
    if (!put.ok) {
      wrong.push(`${what}: the Diary one would not install, ${fixOf(put)}`);
      sql.close();
      continue;
    }
    const out = k.propose(change('register.obligations', bundle(now, ...also)), 'p_1');
    if (out.ok) wrong.push(`${what}: filed`);
    else if (codeOf(out) !== 'VALUE_MALFORMED' || !new RegExp(`${now.id.replace('.', '\\.')}.*replaces.*diary`).test(fixOf(out)))
      wrong.push(`${what}: ${codeOf(out)} ${fixOf(out)}`);
    else if (filed(sql) !== 0) wrong.push(`${what}: a row was written`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

test('AND ONE ALREADY IN THE QUEUE THAT REPLACES THE DIARY FIGURE IS REFUSED WHEN IT IS ACCEPTED', async () => {
  const { k, sql } = await record();
  const now = renamed(metric('obligations'), 'metric.diary-count');
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG91', 'change', ?, 'open', 'p_1', ?)",
    JSON.stringify({ declaration_id: 'register.obligations', to: bundle(now) }),
    new Date(NOW).toISOString(),
  );
  const out = k.decide('SG91', accept, 'p_owner');
  assert.equal(codeOf(out), 'VALUE_MALFORMED', JSON.stringify(out));
  assert.equal(sql.one<{ source: string }>("SELECT json_extract(body, '$.source') AS source FROM declaration WHERE id = 'metric.diary-count' AND superseded_at IS NULL")?.source, 'register.diary');
  sql.close();
});

test('and a bundle that replaces a declaration already about Obligations is still filed', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([metric('obligations'), rule('obligations')])).ok);
  const wider = { ...metric('obligations'), body: { ...(metric('obligations').body as object), window: '90d' } as never };
  const made = k.propose(change('register.obligations', bundle(wider, rule('obligations', [{ tag: 'looked' }]))), 'p_1');
  assert.ok(made.ok, fixOf(made));
  sql.close();
});

/**
 * A figure no live metric declares, read by an installed page of Diary, defined over Obligations.
 *
 * THE GUARD READ WHAT A METRIC REPLACES ONLY WHILE THAT METRIC WAS LIVE, and a page reads a figure by name whatever
 * its metric's state. With `metric.diary-count` retired, or never declared, a bundle under `register.obligations`
 * defining `metric.diary-count` over Obligations replaced nothing the guard could read, and a page of Diary then showed
 * Obligations' count. Each case below was measured filed before the guard asked which installed pages read the figure.
 */
const diaryLook: Declaration = {
  id: 'page.diary-look',
  kind: 'page',
  body: {
    page: 'diary-look',
    title: 'Diary',
    blocks: [
      { kind: 'stat', cells: [{ metric: 'diary-count' }] },
      { kind: 'table', heading: 'Rows', span: 12, source: 'register.diary', columns: [{ field: 'body' }], limit: 50, empty: 'None.' },
    ],
  } as never,
};
const obligationsLook: Declaration = {
  id: 'page.obligations-look',
  kind: 'page',
  body: {
    page: 'obligations-look',
    title: 'Obligations',
    blocks: [
      { kind: 'stat', cells: [{ metric: 'obligations-count' }] },
      { kind: 'table', heading: 'Rows', span: 12, source: 'register.obligations', columns: [{ field: 'what' }], limit: 50, empty: 'None.' },
    ],
  } as never,
};
const diaryMail: Declaration = {
  ...digest('diary'),
  body: { ...(digest('diary').body as { sections: unknown[] }), sections: [...(digest('diary').body as { sections: unknown[] }).sections, { heading: 'Count', source: 'metric.diary-count', as: 'figure' }] } as never,
};
const UNDECLARED: [string, (k: Kernel) => Promise<boolean>][] = [
  ['the Diary figure retired, a Diary page still reading it', async (k) => (await k.install([OBLIGATIONS, DIARY, metric('diary'), diaryLook])).ok && k.retire(['metric.diary-count']).ok],
  ['the Diary figure never declared, a Diary page reading it', async (k) => (await k.install([OBLIGATIONS, DIARY, diaryLook])).ok],
  /* A page that names no list but the figure's is nobody's to redefine from one list's question. */
  ['the Diary figure retired, a page of that figure alone reading it', async (k) => (await k.install([OBLIGATIONS, DIARY, metric('diary'), figures('diary-count')])).ok && k.retire(['metric.diary-count']).ok],
  /* A DIGEST READS A FIGURE BY NAME AS A PAGE DOES (`digest.ts`, a `metric.<id>` section), and asking only the pages
     filed this one: the Diary digest would have mailed Obligations' count to whoever takes it. */
  ['the Diary figure retired, a Diary digest still mailing it', async (k) => (await k.install([OBLIGATIONS, DIARY, metric('diary'), diaryMail])).ok && k.retire(['metric.diary-count']).ok],
];

test('A BUNDLE NAMED FOR OBLIGATIONS THAT DEFINES A FIGURE A DIARY PAGE OR DIGEST READS IS REFUSED, whatever the figure\'s metric state', async () => {
  const wrong: string[] = [];
  for (const [what, arrange] of UNDECLARED) {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    if (!(await arrange(k))) {
      wrong.push(`${what}: the record would not arrange`);
      sql.close();
      continue;
    }
    const out = k.propose(change('register.obligations', bundle(renamed(metric('obligations'), 'metric.diary-count'))), 'p_1');
    if (out.ok) wrong.push(`${what}: filed`);
    else if (codeOf(out) !== 'VALUE_MALFORMED' || !/metric\.diary-count.*(?:page|digest)\./.test(fixOf(out))) wrong.push(`${what}: ${codeOf(out)} ${fixOf(out)}`);
    else if (filed(sql) !== 0) wrong.push(`${what}: a row was written`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

test('and a bundle that defines a figure only a page of Obligations reads is still filed', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  assert.ok((await k.install([OBLIGATIONS, DIARY, obligationsLook])).ok);
  const made = k.propose(change('register.obligations', bundle(metric('obligations'))), 'p_1');
  assert.ok(made.ok, fixOf(made));
  sql.close();
});

/**
 * A declaration under the id of an installed one whose every figure has no live metric, replaced under Obligations.
 *
 * `replacedAbout` read the installed body's lists and dropped the figures it could not resolve, so a page or digest
 * whose only figure was Diary's, retired or never declared, read as about no list at all, and a bundle under
 * `register.obligations` replaced it with an Obligations body: all four shapes below were measured filed, accepted and
 * installed (`{"ok":true,"value":{"id":"SG1"}}`). The same figure redefined from the same question was already refused
 * by `pageOfOthers`, so the guard disagreed with itself about one page.
 */
const tabled: Declaration = { ...table('obligations'), id: 'page.figures', body: { ...(table('obligations').body as object), page: 'figures' } as never };
const mailing = (sections: unknown[]): Declaration => ({
  id: 'digest.weekly',
  kind: 'digest',
  body: { digest: 'weekly', schedule: { day: 'mon', at: '08:00' }, channels: ['in-app'], sections } as never,
});
const retiring = async (k: Kernel, was: Declaration) => (await k.install([OBLIGATIONS, DIARY, metric('diary'), was])).ok && k.retire(['metric.diary-count']).ok;
const DEAD: [string, (k: Kernel) => Promise<boolean>, Declaration][] = [
  ['a stat of a retired Diary figure, replaced by an Obligations table', (k) => retiring(k, figures('diary-count')), tabled],
  ['a stat of a figure never declared, replaced by an Obligations table', async (k) => (await k.install([OBLIGATIONS, DIARY, figures('diary-count')])).ok, tabled],
  ['a note whose prose reads a retired Diary figure, replaced by an Obligations table', (k) => retiring(k, { ...note('{{diary-count}} rows'), id: 'page.figures', body: { ...(note('{{diary-count}} rows').body as object), page: 'figures' } as never }), tabled],
  [
    'a digest whose only section is a retired Diary figure, replaced by an Obligations digest',
    (k) => retiring(k, mailing([{ heading: 'Count', source: 'metric.diary-count', as: 'figure' }])),
    mailing([{ heading: 'Rows', source: 'register.obligations', as: 'table', columns: [{ field: 'what' }] }]),
  ],
];

test('A BUNDLE NAMED FOR OBLIGATIONS THAT REPLACES A PAGE OR DIGEST OF A DEAD FIGURE IS REFUSED, since nothing says whose it is', async () => {
  const wrong: string[] = [];
  for (const [what, arrange, now] of DEAD) {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    if (!(await arrange(k))) {
      wrong.push(`${what}: the record would not arrange`);
      sql.close();
      continue;
    }
    const out = k.propose(change('register.obligations', bundle(now)), 'p_1');
    if (out.ok) wrong.push(`${what}: filed`);
    else if (codeOf(out) !== 'VALUE_MALFORMED' || !new RegExp(`${now.id.replace('.', '\\.')}.*replaces one that reads a figure no live metric declares`).test(fixOf(out)))
      wrong.push(`${what}: ${codeOf(out)} ${fixOf(out)}`);
    else if (filed(sql) !== 0) wrong.push(`${what}: a row was written`);
    sql.close();
  }
  assert.deepEqual(wrong, []);
});

/* A PAGE OF OBLIGATIONS THAT ALSO READS A DEAD FIGURE IS STILL OBLIGATIONS' TO REPLACE, as `replacedAbout` says: the
   list it names is shown to whoever reads it already, and the dead figure draws nothing. Checked by making the dead
   figure refuse whatever else the body names, which left every other test in `govern*.test.ts` green. */
test('and a bundle that replaces an Obligations page also reading a dead figure is still filed', async () => {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const both: Declaration = { ...tabled, body: { ...(tabled.body as { blocks: unknown[] }), blocks: [...(tabled.body as { blocks: unknown[] }).blocks, { kind: 'stat', cells: [{ metric: 'diary-count' }] }] } as never };
  assert.ok(await retiring(k, both));
  const made = k.propose(change('register.obligations', bundle(tabled)), 'p_1');
  assert.ok(made.ok, fixOf(made));
  sql.close();
});

/**
 * A page per skill, as `packages/seed/src/packs/agents.ts` writes `page.skill`, filed under `register.skills`.
 *
 * The guard read the diff's `row: '{{spoken}}'` as a figure the bundle did not carry and refused the seed's own page
 * under the list it is `for` ("reads the figure spoken, which it does not carry"), while `pages.ts` `fill` answers
 * `{{spoken}}` with the row's spoken id before it reads a field or a metric.
 */
const SKILLS_FIELDS: Field[] = [
  { id: 'name', type: 'text', required: true },
  { id: 'trigger', type: 'text', required: true },
  { id: 'body', type: 'document' },
  { id: 'state', type: 'enum', values: ['active', 'retired'] },
];
const SKILLS = register('skills', 'Skills', SKILLS_FIELDS);
const skill: Declaration = {
  id: 'page.skill',
  kind: 'page',
  body: {
    page: 'skill',
    title: '{{name}}',
    for: { register: 'skills', where: 'state is active' },
    icon: 'skill',
    requires: ['register.skills'],
    blocks: [
      { kind: 'note', span: 12, body: '{{trigger}}' },
      { kind: 'diff', heading: 'Versions', span: 12, source: 'register.skills', row: '{{spoken}}', field: 'body', versions: 5, empty: 'One version so far.' },
    ],
  } as never,
};

test('a Skills page per row whose diff reads {{spoken}} is filed under register.skills, accepted and installed', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([SKILLS])).ok);
  const made = k.propose(change('register.skills', { declarations: [SKILLS, skill] }), 'p_1');
  assert.ok(made.ok, fixOf(made));
  const out = k.decide(made.value.id, accept, 'p_owner');
  assert.ok(out.ok, fixOf(out));
  const put = await k.install((out.value.install as { declarations: Declaration[] }).declarations);
  assert.ok(put.ok, fixOf(put));
  assert.equal(sql.all("SELECT 1 FROM declaration WHERE id = 'page.skill' AND superseded_at IS NULL").length, 1);
  sql.close();
});

test('but outside a template nothing fills {{spoken}}, so a note saying it under register.skills is still refused', async () => {
  const { k, sql } = await record();
  assert.ok((await k.install([SKILLS])).ok);
  const out = k.propose(change('register.skills', { declarations: [SKILLS, note('This is {{spoken}}.')] }), 'p_1');
  assert.equal(codeOf(out), 'VALUE_MALFORMED', JSON.stringify(out));
  assert.match(fixOf(out), /page\.said.*figure spoken/);
  sql.close();
});
