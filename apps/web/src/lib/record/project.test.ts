import { test } from 'node:test';
import assert from 'node:assert/strict';

import { agentsOf, blockOf, blocksOf, briefOf, isProject, moneyLines, repeatOf, rowsOf, runsOnSet, saysNext, withoutRepeats, shapeOf, spans, type Facts } from './project.ts';

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

test('A DECLARED BLOCK REPEATS THE SHAPE BY THE SOURCE IT DECLARES, never by its title', () => {
  assert.equal(repeatOf('runs_on'), 'runs-on');
  assert.equal(repeatOf('register.tasks'), null);
  assert.equal(repeatOf(undefined), null);
});

test('A SECTION LEFT HEADING ONLY WHAT THE SHAPE SAYS GOES WITH IT, unless it holds actions or they are not counted yet', () => {
  const page = [
    { kind: 'section', panel: 'actions', area: 'rail' },
    { kind: 'cards', source: 'runs_on', area: 'rail' },
    { kind: 'cards', source: 'register.things', area: 'main' },
  ];
  const drawn = (a: number | null) => withoutRepeats(page, ['runs-on'], a).map((b) => (b as { drawn?: boolean }).drawn !== false);
  assert.deepEqual(drawn(0), [false, false, true]);
  assert.deepEqual(drawn(2), [true, false, true]);
  assert.deepEqual(drawn(null), [true, false, true]);
  assert.deepEqual(withoutRepeats(page, [], 0), page);
});

test('WHAT IT RUNS ON IS A FEW NAMES GROUPED BY KIND, one of each in turn, and then how many more', () => {
  const row = (kind: string, n: number) => ({ key: `${kind}${n}`, title: `${kind}-${n}`, detail: '', href: null, kind });
  const rows = [...[1, 2, 3, 4, 5, 6].map((n) => row('Keys', n)), ...[1, 2, 3].map((n) => row('Tools', n)), row('Services', 1)];
  const set = runsOnSet(rows, 8);
  assert.deepEqual(set.groups.map((g) => [g.kind, g.names.length]), [['Keys', 3], ['Tools', 3], ['Services', 1]].map(([k, n]) => [k, k === 'Keys' ? 4 : n]));
  assert.equal(set.more, 2);
  assert.deepEqual(runsOnSet([row('Keys', 1)]), { groups: [{ kind: 'Keys', names: ['Keys-1'] }], more: 0 });
});

test('A DECLARED BLOCK THAT SAYS THE NEXT STEP ALONE IS LEFT OUT, by its field and not its title', () => {
  const stands = { kind: 'cards', heading: 'Anything', columns: [{ field: 'next' }, { field: 'progress' }] };
  const other = { kind: 'cards', columns: [{ field: 'health' }] };
  assert.equal(saysNext(stands, { next: 'Ship it', progress: '' }), true);
  assert.equal(saysNext(stands, { next: 'Ship it', progress: 40 }), false);
  assert.equal(saysNext(other, { next: 'Ship it' }), false);
  const out = withoutRepeats([stands, other], ['next'], null, { next: 'Ship it' });
  assert.deepEqual(out.map((b) => (b as { drawn?: boolean }).drawn !== false), [false, true]);
  assert.deepEqual(withoutRepeats([stands], ['brief'], null, { next: 'Ship it' }), [stands]);
});

test('A SECTION HEADING ONLY A LEFT-OUT NEXT STEP GOES WITH IT', () => {
  const page = [{ kind: 'section', area: 'rail' }, { kind: 'cards', columns: [{ field: 'next' }], area: 'rail' }];
  assert.deepEqual(withoutRepeats(page, ['next'], null, { next: 'Ship it' }).map((b) => (b as { drawn?: boolean }).drawn !== false), [false, false]);
});
