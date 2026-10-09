/**
 * The poll form's proposal (`poll-form.ts`): the live feed add-on filled by its own `fillFeed`, one poll of the
 * address, a map a number, bound to the project or the organisation the page is about, with a key only when one was
 * named, a date from the answer when a number says so, money as an amount, and the add-on's own refusals said.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pollBindsTo, pollFault, pollIdOf, pollProposal, pollRow, type PollDraft, type PollRow } from './poll-form.ts';

const row = (r: Partial<PollRow>): PollRow => ({ ...pollRow(), ...r });

const DRAFT: PollDraft = {
  url: ' https://stats.northwind.example/v1/numbers.json ',
  every: '1h',
  grant: '',
  rows: [row({ path: 'data.mrr', name: 'Monthly recurring revenue', unit: 'GBP' }), row({ path: 'data.users', name: 'Active users' }), row({})],
};

const ORG = { register: 'organisations', seq: 2, title: 'Northwind Labs Ltd' };
const PROJECT = { register: 'things', seq: 4, title: 'Sketchpad', organisation: 'organisations#2' };

type Map = Record<string, { value?: unknown; path?: unknown; type?: unknown; currency?: unknown; minor?: unknown; arrived?: unknown }>;
const declsOf = (p: { body: { doc: unknown } }) => (p.body.doc as { declarations: (Record<string, unknown> & { map: Map[] })[] }).declarations;

test('THE FORM FILES THE LIVE FEED ADD-ON WITH ONE POLL OF THE ADDRESS, a map a number, for the organisation, and no key when none is named', () => {
  assert.equal(pollFault(DRAFT, ORG), null);
  const p = pollProposal(DRAFT, ORG);
  assert.equal(p.body_kind, 'pack');
  assert.equal(p.body.install, 'feed-northwind-labs-ltd-stats');
  assert.equal((p.body.doc as { version?: unknown }).version, '2.0.0');
  assert.deepEqual((p.body.doc as { requires: { packs: unknown } }).requires.packs, {});
  const decls = declsOf(p);
  assert.equal(decls.length, 1);
  assert.equal(decls[0]!.ingest, 'feed_northwind_labs_ltd_stats');
  assert.equal('grant' in decls[0]!, false);
  assert.equal('project' in decls[0]!, false);
  assert.equal(decls[0]!.url, 'https://stats.northwind.example/v1/numbers.json');
  assert.deepEqual(decls[0]!.map.map((m) => [m.name?.value, m.value?.path, m.organisation?.value, m.unit?.value, m.source?.value]), [
    ['Monthly recurring revenue', 'data.mrr', 'organisations#2', 'GBP', 'polled'],
    ['Active users', 'data.users', 'organisations#2', undefined, 'polled'],
  ]);
  assert.match(p.question, /^Poll stats\.northwind\.example every hour for Northwind Labs Ltd’s numbers: Monthly recurring revenue, Active users\?$/u);

  const keyed = pollProposal({ ...DRAFT, grant: ' northwind stats ' }, { ...ORG, title: 'Northwind', seq: 1 });
  assert.equal(declsOf(keyed)[0]!.grant, 'northwind stats');
});

test('ON A PROJECT’S PAGE THE FEED IS THE PROJECT’S: the poll names it, each reading lands on it, and on the organisation that lists it', () => {
  assert.equal(pollBindsTo('things'), 'project');
  assert.equal(pollBindsTo('organisations'), 'organisation');
  assert.equal(pollBindsTo('things', 'project_ref'), null);
  assert.equal(pollBindsTo('people'), null);
  const decl = declsOf(pollProposal(DRAFT, PROJECT))[0]!;
  assert.equal(decl.project, 'things#4');
  assert.deepEqual(decl.map.map((m) => [m.thing?.value, m.organisation?.value]), [
    ['things#4', 'organisations#2'],
    ['things#4', 'organisations#2'],
  ]);
  const alone = declsOf(pollProposal(DRAFT, { ...PROJECT, organisation: null }))[0]!;
  assert.equal('organisation' in alone.map[0]!, false);
});

test('A DATED MEASURE READS ITS DAY FROM THE ANSWER, and one left alone is dated when it arrives', () => {
  const draft = { ...DRAFT, every: '1d' as const, rows: [row({ path: 'days[-1].count', name: 'Drawings', dated: 'day', datePath: ' days[-1].day ' }), row({ path: 'total', name: 'Total' })] };
  assert.equal(pollFault(draft, PROJECT), null);
  const maps = declsOf(pollProposal(draft, PROJECT))[0]!.map;
  assert.deepEqual(maps[0]!.at, { path: 'days[-1].day', type: 'day' });
  assert.deepEqual(maps[1]!.at, { arrived: true });
  /* A date with no path to it is said by the form, in its own words, before the add-on is asked. */
  assert.match(pollFault({ ...draft, rows: [row({ path: 'n', name: 'Drawings', dated: 'instant' })] }, PROJECT)?.fix ?? '', /Drawings’s date/u);
});

test('A MONEY MEASURE IS WRITTEN AS AN AMOUNT IN ITS CURRENCY, and a currency that is not three letters is refused in the add-on’s words', () => {
  const draft = { ...DRAFT, rows: [row({ path: 'data.mrr_cents', name: 'Monthly recurring revenue', unit: ' usd ', money: 'minor' }), row({ path: 'data.users', name: 'Active users' })] };
  assert.equal(pollFault(draft, PROJECT), null);
  const [money, count] = declsOf(pollProposal(draft, PROJECT))[0]!.map;
  assert.deepEqual(money!.amount, { path: 'data.mrr_cents', type: 'money', currency: 'USD', minor: true });
  assert.equal('value' in money!, false);
  assert.equal('unit' in money!, false);
  assert.deepEqual(count!.value, { path: 'data.users', type: 'decimal' });
  const bad = pollFault({ ...draft, rows: [row({ path: 'data.mrr', name: 'Revenue', unit: 'dollars', money: 'whole' })] }, PROJECT);
  assert.deepEqual(bad, { at: 'rows', fix: 'Revenue is money, so it names its currency in three letters, such as USD.' });
});

test('AN ID PAST THE ADD-ON’S LIMIT IS REFUSED IN ITS SENTENCE, and the id the form makes itself always fits', () => {
  const long = { ...DRAFT, id: 'northwind-labs-ltd-stats-northwind-example' };
  const fault = pollFault(long, ORG);
  assert.equal(fault?.at, 'rows');
  assert.equal(fault?.fix, "northwind-labs-ltd-stats-northwind-example is 42 characters, and a feed's id is 27 at most, because its poll's name is 32 at most.");
  assert.throws(() => pollProposal(long, ORG), /27 at most/u);

  const made = pollIdOf('A very long organisation name indeed', 'https://numbers.some-long-host.example/x');
  assert.ok(made.length <= 27 && !made.endsWith('-'), made);
  assert.ok(pollIdOf('A very long organisation name indeed', 'https://x.example', 21).length <= 25);
  assert.equal(pollIdOf('', 'nonsense'), 'numbers');
});

test('WHAT CANNOT BE FILED IS SAID BY THE FIELD IT IS ABOUT', () => {
  assert.equal(pollFault({ ...DRAFT, url: 'http://stats.example/x' })?.at, 'url');
  assert.equal(pollFault({ ...DRAFT, url: 'stats.example' })?.at, 'url');
  assert.equal(pollFault({ ...DRAFT, rows: [] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, rows: [row({ path: 'data..mrr', name: 'x' })] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, rows: [row({ path: 'data.mrr', name: ' ' })] })?.at, 'rows');
  assert.equal(pollFault({ ...DRAFT, grant: 'x'.repeat(41) })?.at, 'grant');
  assert.equal(pollFault({ ...DRAFT, rows: [row({ path: 'plans[0].count', name: 'Plans' })] }), null);
});
