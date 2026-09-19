/**
 * The shell's read: the record's `boot` drawn in the sample's shape, the sample when there is no record, the record's
 * sentence for any other refusal, and one request for the tab.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forget, layoutOf, newsOf, readBoot, signsIn, type Fetch } from './boot-live.ts';

const BASE = 'http://record.test';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function host(answer: (() => Response) | null): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    sent.push(String(url));
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  }) as Fetch;
  return { io, sent };
}

const line = (over: Record<string, unknown>) => ({
  rowid: 1,
  id: 'e1',
  ts: '2026-09-15T09:00:00.000Z',
  actor: 'p_1',
  kind: 'create',
  target: null,
  target_kind: null,
  field: null,
  from: null,
  to: null,
  note: null,
  register: null,
  seq: null,
  title: null,
  ...over,
});

const BOOT = {
  registers: [
    { id: 'obligations', name: 'Obligations', count: 3 },
    { id: 'services', name: 'Services', count: 0 },
  ],
  now: '2026-09-15T12:00:00.000Z',
  waiting: [{ id: 'SG4', body_kind: 'options', opened_by: 'p_2', opened_at: '2026-09-14T08:00:00.000Z', question: 'Renew the domain?' }],
  record: { slug: 'the-studio', name: 'The Studio', locale: 'en' },
  me: { kind: 'person', person: 'p_1', name: 'Ada', level: 'write' },
  pages: [
    { slug: 'money', title: 'Money', nav: { section: 'Work', order: 2 }, icon: 'no-such-icon' },
    { slug: 'loose', title: 'Loose', nav: null, icon: null },
  ],
  counts: { decide: 30, inbox: null },
  whatsNew: {
    events: [
      line({ rowid: 9, actor: 'rule:renewal', register: 'obligations', seq: 3, title: 'Rent', target: 'entry:x', target_kind: 'entry' }),
      line({ rowid: 8, kind: 'suggest', actor: 'p_2', target: 'SG4', target_kind: 'suggestion', title: 'Renew the domain?' }),
    ],
    upTo: 9,
    sinceCapped: true,
  },
};

test("the record's boot is drawn in the shell's shape, with nothing of the sample in it", () => {
  const shell = layoutOf(BOOT as never);
  assert.equal(shell.live, true);
  assert.equal(shell.index.name, 'The Studio');
  assert.deepEqual(shell.pages, ['money', 'loose'], 'a page with no place in the rail was left out of what Home may ask for');
  assert.deepEqual(
    shell.index.registers.map((r) => [r.id, r.count, r.views.length]),
    [['obligations', 3, 0]],
    'an empty list reached the rail',
  );
  assert.deepEqual(
    shell.lists.map((l) => l.id),
    BOOT.registers.map((r) => r.id),
    'an empty list could not be filed into or given an exception on',
  );
  assert.deepEqual(shell.nav.map((n) => [n.href, n.section, n.icon]), [['/p/money', 'Work', 'doc']]);
  assert.deepEqual(shell.me, { person: 'p_1', level: 'write', owner: false, records: [{ slug: 'the-studio', name: 'The Studio', level: 'write' }] });
  assert.deepEqual(shell.questions.map((q) => [q.id, q.title]), [['SG4', 'Renew the domain?']]);
  assert.equal(shell.inbox, 0, 'a count the record withheld became a number');
  assert.equal(shell.open, 30, 'the rail counted the list boot caps, not the questions the record has open');
  assert.equal(shell.now, Date.parse('2026-09-15T12:00:00.000Z'));
  assert.equal(shell.upTo, 9);
  assert.equal(shell.sinceCapped, true);
  assert.deepEqual(shell.pen, []);
  assert.deepEqual(shell.people, []);
});

test('only a host that says nobody signs in is spared the account read', () => {
  assert.equal(signsIn({ ...BOOT, signIn: false } as never), false);
  assert.equal(signsIn({ ...BOOT, signIn: true } as never), true);
  assert.equal(signsIn(BOOT as never), true, 'a host older than the field stopped being asked');
});

test('a line of the log becomes a feed item in words, and the reader is "you"', () => {
  const items = newsOf(BOOT.whatsNew.events as never, 'p_2');
  assert.deepEqual(items[0], { at: '2026-09-15T09:00:00.000Z', by: 'rule.renewal', text: 'Added Rent', href: '/r/obligations/3' });
  assert.deepEqual(items[1], { at: '2026-09-15T09:00:00.000Z', by: 'you', text: 'Asked: Renew the domain?', href: '/decide/SG4' });
  assert.equal(newsOf([line({ kind: 'export', note: null })] as never, null)[0]?.text, 'Export');
  assert.equal(newsOf([line({ kind: 'export' })] as never, null)[0]?.href, '/audit');
});

test("an export's note is said as a sentence, not in the kernel's words", () => {
  const at = (note: string) => newsOf([line({ kind: 'export', note })] as never, null)[0]?.text;
  assert.equal(at('snapshot 2026-09-16T20-14-56Z-now 786432 bytes'), 'Took a copy of the record');
  assert.equal(at('sections all, grants redacted'), 'Exported the whole record');
  assert.equal(at('sections header, data, grants redacted'), 'Exported part of the record');
});

test("a pack's settings saved are said as what they did, never as \"Edit\"", () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'edit', note: null, target_kind: 'pack', ...over })] as never, null)[0]?.text;
  assert.equal(at({ target: 'pack:usecase-personal', from: { speaks: false }, to: { speaks: true } }), 'Personal speaks for this BrainDog now');
  assert.equal(at({ target: 'pack:usecase-personal', to: { speaks: false } }), 'Personal added beside the use case that speaks');
  assert.equal(at({ target: 'pack:usecase-personal', to: { label_goals: 'Aims' } }), 'Changed the settings of Personal');
});

test('a use case added beside another says so, and "speaks" is said only when the voice moves', () => {
  const texts = (lines: Record<string, unknown>[]) => newsOf(lines.map((l, i) => line({ note: null, rowid: 100 - i, ...l })) as never, null).map((n) => n.text);
  const voice = (id: string, from: boolean | null, to: boolean, batch: string | null = null) => ({ kind: 'edit', target_kind: 'pack', target: `pack:usecase-${id}`, from: { speaks: from }, to: { speaks: to }, batch });
  const installed = (id: string) => ({ kind: 'install', target_kind: 'pack', target: `pack:usecase-${id}` });
  /* Newest first, as the log sends them. Personal went in beside Student, which spoke unwritten. */
  assert.deepEqual(texts([voice('personal', null, false, 'A'), voice('student', null, true, 'A'), installed('personal'), installed('student')]), [
    'Personal added beside Student',
    'Added the Personal use case',
    'Added the Student use case',
  ]);
  /* A third beside a voice already written down names the one that spoke before. */
  assert.deepEqual(texts([voice('team', null, false, 'B'), installed('team'), voice('personal', null, false, 'A'), voice('student', null, true, 'A')]), [
    'Team board added beside Student',
    'Added the Team board use case',
    'Personal added beside Student',
  ]);
  /* A real switch: the one that spoke is set not to. */
  assert.deepEqual(texts([voice('student', true, false, 'A'), voice('personal', false, true, 'A')]), ['Personal speaks for this BrainDog now']);
  /* Switched to on arrival, when the one before had never been written down. */
  assert.deepEqual(texts([voice('team', null, true, 'A'), voice('student', null, false, 'A'), installed('team'), installed('student')]), [
    'Team board speaks for this BrainDog now',
    'Added the Team board use case',
    'Added the Student use case',
  ]);

  /* TWO WRITES, NOTHING LOGGED BETWEEN THEM, ARE TWO CHANGES. A switch to Student, then Team board added beside it: read by
     where the lines sit, the three were one switch, and Team board's line was dropped. */
  const twoWrites = [voice('team', null, false, 'B'), voice('student', false, true, 'A'), voice('personal', true, false, 'A')];
  assert.deepEqual(texts(twoWrites), ['Team board added beside Student', 'Student speaks for this BrainDog now']);
  /* The lines of one write are read together wherever they sit, and a line with no batch is read alone. */
  assert.deepEqual(texts([voice('personal', null, false, 'A'), installed('personal'), voice('student', null, true, 'A')]), ['Personal added beside Student', 'Added the Personal use case']);
  assert.deepEqual(texts([voice('personal', null, false), voice('student', null, true)]), ['Personal added beside Student']);
});

test('ANOTHER PERSON IN THE FEED IS NAMED WHEN boot SAID THE NAME, and is Someone on this record when it did not, never an id', () => {
  const ada = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const cy = 'p_01M2PB0000000000000000000C';
  const events = [line({ actor: ada, kind: 'decide', title: 'Renew' }), line({ actor: cy, kind: 'decide', title: 'Renew' }), line({ actor: 'p_1', kind: 'decide', title: 'Renew' })];
  assert.deepEqual(newsOf(events as never, 'p_1', new Map([[ada, 'Ada Lovelace']])).map((i) => i.by), ['Ada Lovelace', 'Someone on this record', 'you']);
  const shell = layoutOf({ ...BOOT, names: { [ada]: 'Ada Lovelace' }, whatsNew: { events: [line({ actor: ada, kind: 'decide', title: 'Renew' })], upTo: 1, sinceCapped: false } } as never);
  assert.deepEqual(shell.names, { [ada]: 'Ada Lovelace' });
  assert.equal(shell.whatsNew[0]?.by, 'Ada Lovelace');
});

test('what was applied, kept on a decision, is not a line of its own in the feed', () => {
  const items = newsOf([line({ kind: 'note', target: 'decision:D7', target_kind: 'decision', note: 'Applied what was accepted.' }), line({ kind: 'decide', title: 'Add Personal?' })] as never, null);
  assert.deepEqual(items.map((i) => i.text), ['Decided: Add Personal?']);
});

test('THE REASON A QUESTION WAS ACCEPTED FOR IS PART OF ITS DECISION LINE, never a line of its own', () => {
  const items = newsOf(
    [
      line({ rowid: 12, kind: 'resolve', target: 'suggestion:SG2', target_kind: 'suggestion', to: 'addressed', note: 'Yes, for the proof.', title: 'Add Personal?' }),
      line({ rowid: 11, kind: 'decide', target: 'decision:D2', target_kind: 'decision', title: 'Add Personal?' }),
      /* A resolve with no decision before it (a no) keeps its own line. */
      line({ rowid: 5, kind: 'resolve', target: 'suggestion:SG1', target_kind: 'suggestion', to: 'wont-fix', note: 'Not this week.', title: 'Add Student?' }),
    ] as never,
    null,
  );
  assert.deepEqual(items.map((i) => i.text), ['Decided: Add Personal? Yes, for the proof.', 'Not this week.']);
  const bare = newsOf([line({ rowid: 3, kind: 'resolve', target: 'suggestion:SG3', to: 'addressed', note: null }), line({ rowid: 2, kind: 'decide', title: 'Renew' })] as never, null);
  assert.deepEqual(bare.map((i) => i.text), ['Decided: Renew']);
});

test('access given or taken away reads as a sentence, never as "Access grant"', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'access.grant', note: null, ...over })] as never, null)[0]?.text;
  assert.equal(at({ target_kind: 'member', field: '*', to: 'owner' }), 'Gave someone owner access to this record');
  assert.equal(at({ actor: 'p_1', target: 'person:p_1', target_kind: 'person', field: '*', to: 'owner' }), 'Started this record as its owner', 'the owner made the record, nobody was let in');
  assert.equal(at({ target_kind: 'member', field: 'obligations', to: 'read' }), 'Gave someone read access on Money');
  assert.equal(at({ kind: 'access.revoke', target_kind: 'member', field: '*', from: 'write', to: null }), "Took away someone's write access to this record");
  assert.equal(at({ target_kind: 'token', to: 'propose', note: 'Claude on the laptop' }), 'Made a key that can read and propose: Claude on the laptop');
  assert.equal(at({ target_kind: 'device_grant', to: 'login' }), 'Let a device sign in');
});

test('a pack install names the list it brought, not the bare verb', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ actor: 'system', target_kind: 'pack', ...over })] as never, null)[0]?.text;
  assert.equal(at({ kind: 'install', target: 'pack:estate' }), 'Added the Services list');
  assert.equal(at({ kind: 'uninstall', target: 'pack:estate' }), 'Removed the Services list');
  assert.equal(at({ kind: 'install', target: 'pack:nobody-knows' }), 'Added the nobody-knows add-on');
  assert.equal(at({ kind: 'install', target: 'pack:usecase-student' }), 'Added the Student use case');
  assert.equal(at({ kind: 'install', target: 'pack:usecase-team' }), 'Added the Team board use case');
  assert.equal(at({ kind: 'uninstall', target: 'pack:usecase-book-club' }), 'Removed the Book club use case');
  assert.equal(at({ kind: 'uninstall', target: 'pack:usecase-new-project' }), 'Removed the New project use case');
});

for (const [what, answer] of [
  ['nothing answers', null],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } })],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 })],
] as const) {
  test(`${what}: the shell draws the sample, and asks once for the tab`, async () => {
    forget();
    const { io, sent } = host(answer);
    assert.deepEqual(await readBoot(BASE, io), { from: 'sample' });
    assert.deepEqual(await readBoot(BASE, io), { from: 'sample' });
    assert.equal(sent.length, 1);
    assert.equal(new URL(sent[0]!).pathname, '/api/boot');
    forget();
  });
}

test("any other refusal is the record's sentence, and is asked again", async () => {
  forget();
  const { io, sent } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } }));
  assert.deepEqual(await readBoot(BASE, io), { from: 'refused', code: 'FORBIDDEN', fix: 'Ask the owner.' });
  await readBoot(BASE, io);
  assert.equal(sent.length, 2, 'a refusal about the record was kept for the tab');
  forget();
});

test('a live boot is kept for the tab until it is forgotten', async () => {
  forget();
  const { io, sent } = host(() => json(200, { ok: true, value: BOOT }));
  const first = await readBoot(BASE, io);
  assert.equal(first.from, 'live');
  await readBoot(BASE, io);
  assert.equal(sent.length, 1, 'every navigation asked the record again');
  forget();
  await readBoot(BASE, io);
  assert.equal(sent.length, 2);
  forget();
});

test('A RECORD SETTING ITSELF UP IS ONE LINE: the use case and how many example rows', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'setup', note: null, field: null, from: null, register: null, seq: null, title: null, ...over })] as never, null)[0]?.text;
  assert.equal(at({ target: 'pack:usecase-personal', target_kind: 'pack', to: 40 }), 'Set up Personal with 40 example rows');
  assert.equal(at({ target: null, target_kind: null, to: 1 }), 'Added 1 example row');
  assert.equal(at({ target: null, target_kind: null, to: 0 }), 'Linked the example rows to each other');
});

test('THE SAMPLE SAYS ONE COUNT OF OPEN QUESTIONS: the rail and Home, the Decide figure and the queue Decide draws', async () => {
  const { sampleShell } = await import('./boot-live.ts');
  const { boot, metric } = await import('./api.ts');
  const { ARRANGING, QUEUE } = await import('./data.ts');
  const shell = sampleShell(boot() as never, 0);
  /* BY ID AND NOT BY IDENTITY. `QUEUE` bands each question as it composes the list, so its entries are
     copies of these rather than these; what the count needs is that every arrangement is in it. */
  assert.ok(ARRANGING.every((q) => QUEUE.some((x) => x.id === q.id)), 'Decide draws the arranging proposals, so the count holds them');
  assert.equal(shell.open, QUEUE.length);
  assert.equal(metric('open-questions').value, String(QUEUE.length));
});

test('A SAVED VIEW ON A RECORD SITS UNDER ITS LIST in the rail and at its page, and holds its list there even with no rows in it yet', () => {
  const shell = layoutOf({
    ...BOOT,
    pages: [
      ...BOOT.pages,
      { slug: 'obligations-late', title: 'Late to pay', nav: { section: 'Views', order: 900 }, icon: null, list: 'obligations' },
      { slug: 'services-cheap', title: 'Cheap services', nav: { section: 'Views', order: 900 }, icon: null, list: 'services' },
    ],
  } as never);
  /* `services` holds nothing, and would be dropped from the rail on its own; its view keeps it, and nests under it. */
  assert.deepEqual(shell.index.registers.map((r) => [r.id, r.views]), [
    ['obligations', [{ key: 'obligations-late', name: 'Late to pay', href: '/p/obligations-late' }]],
    ['services', [{ key: 'services-cheap', name: 'Cheap services', href: '/p/services-cheap' }]],
  ]);
  /* The rail drops from Views every page it has already nested, so neither view is left under the generic heading. */
  const placed = new Set(shell.index.registers.flatMap((r) => r.views.map((v) => v.href)));
  assert.deepEqual(shell.nav.filter((n) => !placed.has(n.href)).map((n) => n.href), ['/p/money']);
  assert.deepEqual(
    shell.nav.map((n) => n.href),
    ['/p/money', '/p/obligations-late', '/p/services-cheap'],
    'the palette still reads every view as a page',
  );
});

test('AN IMPORT IS ONE LINE OF THE FEED with its counts and a link to that day in the log, and a few writes by hand keep their own lines', () => {
  const at = (s: number) => new Date(Date.parse('2026-09-15T09:00:00.000Z') - s * 1000).toISOString();
  /* Newest first: eight questions, then fifty-two rows, a second apart, by the reader on an open self-host. */
  const bulk = [
    ...Array.from({ length: 8 }, (_, i) => line({ rowid: 100 - i, ts: at(i), kind: 'suggest', target: `SG${i + 1}`, target_kind: 'suggestion', title: `Question ${i}` })),
    ...Array.from({ length: 52 }, (_, i) => line({ rowid: 92 - i, ts: at(8 + i), kind: 'create', register: 'tasks', seq: i + 1, title: `Task ${i}` })),
  ];
  const items = newsOf(bulk as never, 'p_1');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { at: at(0), by: 'you', text: 'Added 52 rows and asked 8 questions at once, and more before these', href: '/audit?by=you&on=2026-09-15' });

  /* The same run with an hour-old line of its own after it: grouped, not "more before these", and the old line kept. */
  const older = line({ rowid: 1, ts: '2026-09-15T07:00:00.000Z', kind: 'create', register: 'tasks', seq: 99, title: 'By hand' });
  const mixed = newsOf([...bulk.slice(0, 20), older] as never, 'p_1');
  assert.deepEqual(mixed.map((m) => m.text), ['Added 12 rows and asked 8 questions at once', 'Added By hand']);

  /* Nine writes a second apart are not bulk; nor are ten a minute apart. */
  assert.equal(newsOf(bulk.slice(0, 9) as never, 'p_1').length, 9);
  const slow = Array.from({ length: 12 }, (_, i) => line({ rowid: 50 - i, ts: at(i * 60), kind: 'create', register: 'tasks', seq: i + 1, title: `T${i}` }));
  assert.equal(newsOf(slow as never, 'p_1').length, 12);
  /* Another writer breaks the run. */
  const two = bulk.slice(0, 20).map((l, i) => (i === 10 ? { ...l, actor: 'agent:claude' } : l));
  assert.equal(newsOf(two as never, 'p_1').length, 2 + 9);
});

test("ONE WRITE'S LINES ARE ONE LINE from three, led by the note they share: clearing the examples", () => {
  const cleared = ['Northwind app', 'Northwind current account', 'Write the pricing page copy'].map((title, i) =>
    line({ rowid: 20 - i, kind: 'delete', batch: 'b1', note: 'Cleared the examples', register: 'tasks', seq: i + 1, title }),
  );
  const items = newsOf([...cleared, line({ rowid: 5, ts: '2026-09-15T08:00:00.000Z', title: 'Older' , register: 'tasks', seq: 9 })] as never, 'p_1');
  assert.deepEqual(items.map((i) => i.text), ['Cleared the examples: removed 3 rows', 'Added Older']);
  assert.equal(items[0]!.href, '/audit?by=you&on=2026-09-15');
  /* Two lines of one write keep their own lines. */
  assert.equal(newsOf(cleared.slice(0, 2) as never, 'p_1').length, 2);
});

test('THE DAY A ROW WAS FINISHED, filled by the record in the same write as its state, is part of that line and not one of its own', () => {
  const moved = [
    line({ rowid: 31, kind: 'edit', batch: 'w1', field: 'reached_on', from: null, to: '2026-09-15', register: 'milestones', seq: 2, title: 'Idea', target: 'entry:m2' }),
    line({ rowid: 30, id: 'w1', kind: 'state', batch: null, field: 'status', from: 'underway', to: 'reached', register: 'milestones', seq: 2, title: 'Idea', target: 'entry:m2' }),
  ];
  const texts = newsOf(moved as never, 'p_1').map((i) => i.text);
  assert.equal(texts.length, 1);
  assert.ok(!texts.some((t) => /reached on/iu.test(t)), texts.join(' | '));
  /* Reopened: the day emptied beside the move back is folded too. */
  const reopened = moved.map((l) => (l.kind === 'edit' ? { ...l, from: '2026-09-15', to: null } : { ...l, from: 'reached', to: 'underway' }));
  assert.equal(newsOf(reopened as never, 'p_1').length, 1);
  /* A day a person set on its own, with no move beside it, keeps its line. */
  assert.equal(newsOf([moved[0]!] as never, 'p_1').length, 1);
});
