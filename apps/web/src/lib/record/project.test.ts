import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agentsOf, blockOf, blocksOf, briefOf, isProject, moneyLines, rowsOf, shapeOf, spans, type Facts } from './project.ts';

const none: Facts = { brief: [], next: null, money: [], people: [], agents: { now: [], runs: [] }, runsOn: [] };
const row = { key: '1', title: 'Kiln', detail: '', href: null };

const f = (...ids: string[]) => ids.map((id) => ({ id, type: id === 'cost' ? 'money' : 'text' }));

test('A LIST IS PLACED BY WHAT IT DECLARES, NEVER BY ITS NAME', () => {
  assert.equal(isProject({ scopes: {}, fields: [] }), true);
  assert.equal(isProject({ fields: [] }), false);
  assert.equal(isProject(undefined), false);
  assert.equal(blockOf({ meets: {}, fields: [] }), 'crew');
  assert.equal(blockOf({ seq_prefix: 'S', fields: [] }), 'workers');
  assert.equal(blockOf({ hand: {}, state: 'state', fields: [] }), 'next');
  assert.equal(blockOf({ fields: f('name', 'provider', 'cost') }), 'runs-on');
  assert.equal(blockOf({ fields: f('name', 'cost') }), 'money');
  assert.equal(blockOf({ fields: f('name') }), null);
  assert.equal(blockOf(undefined), null);
});

test('A BLOCK WITH NOTHING TO SAY IS LEFT OUT, AND THE REST KEEP ONE ORDER', () => {
  assert.deepEqual(blocksOf(none), []);
  const all: Facts = { brief: ['A shop'], next: 'Ship it', money: [{ key: 'in', value: 5, currency: 'GBP', share: 1 }], people: [row], agents: { now: [], runs: [row] }, runsOn: [row] };
  assert.deepEqual(blocksOf(all), ['brief', 'next', 'money', 'crew', 'workers', 'runs-on']);
  assert.deepEqual(blocksOf({ ...all, brief: [], money: [], runsOn: [] }), ['next', 'crew', 'workers']);
});

test('AN AGENT WORKING NOW COUNTS AS THE AGENTS BLOCK EVEN WITH NO RUN ROWS', () => {
  const a = agentsOf('Kiln', [{ agent: 'Claude', project: 'Kiln', doing: 'x' }, { agent: 'Cursor', project: 'Other', doing: null }], []);
  assert.equal(a.now.length, 1);
  assert.deepEqual(blocksOf({ ...none, agents: a }), ['workers']);
  assert.equal(agentsOf('', [{ agent: 'Claude', project: null, doing: null }], []).now.length, 0);
});

test('MONEY DRAWS ONLY WHAT IS MORE THAN NOTHING, IN ONE CURRENCY, AS A SHARE OF THE LARGEST', () => {
  assert.deepEqual(moneyLines({ in: null, out: { value: 0, currency: 'GBP' } }), []);
  const m = moneyLines({ in: { value: 400, currency: 'GBP' }, out: { value: 100, currency: 'GBP' }, owed: { value: 50, currency: 'USD' } });
  assert.deepEqual(m.map((x) => [x.key, x.share]), [['in', 1], ['out', 0.25]]);
});

test("THE BRIEF IS THE ROW'S OWN WORDS, THEN ITS NOTE, THEN WHAT CHANGED", () => {
  assert.deepEqual(briefOf({ about: ' A shop ', note: 'x' }, [{ note: 'n' }]), ['A shop']);
  assert.deepEqual(briefOf({ note: '# Heading\n\nSecond line' }, []), ['Second line']);
  assert.deepEqual(briefOf({}, [{ note: 'one' }, { note: '' }, { note: 'two' }, { note: 'three' }]), ['one', 'two']);
  assert.deepEqual(briefOf({}, []), []);
  assert.deepEqual(briefOf({ note: 'Status in Old Tool: live. Kind: work.\n# Kiln' }, [{ note: 'Moved the date' }], 'Kiln'), ['Moved the date']);
});

test('WHAT IT RUNS ON IS BY NAME ONLY, AND A BLOCK TAKES ONLY ITS OWN LISTS', () => {
  const groups = [
    { block: 'runs-on' as const, rows: [{ key: '3', cells: ['Stripe key', 'kept in the vault at /secret'], href: '/r/k/3' }] },
    { block: 'crew' as const, rows: [{ key: '1', cells: ['Mara', 'Designer'] }, { key: '2', cells: ['', 'x'] }] },
  ];
  assert.deepEqual(rowsOf('runs-on', groups), [{ key: 'runs-on#3', title: 'Stripe key', detail: '', href: '/r/k/3' }]);
  assert.deepEqual(rowsOf('crew', groups).map((r) => [r.title, r.detail]), [['Mara', 'Designer']]);
  assert.deepEqual(rowsOf('workers', groups), []);
});

test('THE SHAPE IS WORKED OUT ONCE FOR BOTH PAGES: facts, the rows behind them, and where the next step opens', () => {
  const out = shapeOf({
    fields: { name: 'Lanternfish', about: 'Fan pages.', next: '' },
    title: 'name',
    incoming: [{ decl: { hand: 'owner', state: 'state', fields: [] }, rows: [{ key: '4', cells: ['Draft the launch'], href: '/r/task/4' }] }],
    history: [{ note: 'Moved the date', by: 'Mara', at: '3 Sep' }],
    money: {},
    working: [{ agent: 'Builder', project: 'Lanternfish', doing: 'the page' }],
  });
  assert.deepEqual(out.facts.brief, ['Fan pages.']);
  assert.equal(out.facts.next, 'Draft the launch');
  assert.equal(out.nextHref, '/r/task/4');
  assert.deepEqual(out.facts.agents.now.map((w) => w.agent), ['Builder']);
  assert.equal(out.data.brief?.[0]?.detail, 'Mara, 3 Sep');
});

test('A BLOCK WHOSE PARTNER IS LEFT OUT TAKES THE WHOLE ROW', () => {
  assert.deepEqual(spans(['brief', 'next', 'money', 'crew', 'workers']), { brief: 2, next: 2, money: 1, crew: 1, workers: 2 });
  assert.deepEqual(spans(['crew', 'runs-on']), { crew: 2, 'runs-on': 2 });
});
