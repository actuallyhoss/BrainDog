/**
 * The shell's read: the record's `boot` drawn in the shell's shape, and one request for the tab; any refusal, a 401 or
 * no record at all among them, is the record's own sentence and is asked again.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { readFileSync } from 'node:fs';
import { APPEND_AT, forget, layoutOf, newsOf, onAppendOnly, readBoot, refusedShell, rereadBoot, signsIn, waitsOf, workingOf, type Fetch } from './boot-live.ts';
import { hueFor } from '../ui/face.ts';
import { tabsOf } from '../page/tabs.ts';

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
  /* IN POUNDS, AS ITS `boot` SAYS: a record that names no currency is asked what its money is in (`home-currency.test.ts`). */
  record: { slug: 'the-studio', name: 'The Studio', locale: 'en', currency: 'GBP' },
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
  /* HER OWN NAME AS boot SAID IT, so her face on the bar is her own letter. */
  assert.deepEqual(shell.me, { person: 'p_1', name: 'Ada', level: 'write', owner: false, records: [{ slug: 'the-studio', name: 'The Studio', level: 'write' }], lists: null });
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
  assert.deepEqual(items[1], { at: '2026-09-15T09:00:00.000Z', by: 'you', text: 'Asked: renew the domain?', href: '/decide/SG4', asked: true });
  assert.equal(newsOf([line({ kind: 'export', note: null })] as never, null)[0]?.text, 'Export');
  assert.equal(newsOf([line({ kind: 'export' })] as never, null)[0]?.href, '/audit');
});

test("an export's note is said as a sentence, not in the kernel's words", () => {
  const at = (note: string) => newsOf([line({ kind: 'export', note })] as never, null)[0]?.text;
  assert.equal(at('snapshot 2026-09-16T20-14-56Z-now 786432 bytes'), 'Took a copy of your BrainDog');
  assert.equal(at('sections all, grants redacted'), 'Exported all of your BrainDog');
  assert.equal(at('sections header, data, grants redacted'), 'Exported part of your BrainDog');
});

test("a pack's settings saved are said as what they did, never as \"Edit\"", () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'edit', note: null, target_kind: 'pack', ...over })] as never, null)[0]?.text;
  assert.equal(at({ target: 'pack:usecase-personal', from: { speaks: false }, to: { speaks: true } }), 'Personal speaks for this BrainDog now');
  assert.equal(at({ target: 'pack:usecase-personal', to: { speaks: false } }), 'Personal added beside the starter that speaks');
  assert.equal(at({ target: 'pack:usecase-personal', to: { label_goals: 'Aims' } }), 'Changed the settings of Personal');
});

test('a use case added beside another says so, and "speaks" is said only when the voice moves', () => {
  const texts = (lines: Record<string, unknown>[]) => newsOf(lines.map((l, i) => line({ note: null, rowid: 100 - i, ...l })) as never, null).map((n) => n.text);
  const voice = (id: string, from: boolean | null, to: boolean, batch: string | null = null) => ({ kind: 'edit', target_kind: 'pack', target: `pack:usecase-${id}`, from: { speaks: from }, to: { speaks: to }, batch });
  const installed = (id: string) => ({ kind: 'install', target_kind: 'pack', target: `pack:usecase-${id}` });
  /* Newest first, as the log sends them. Personal went in beside Student, which spoke unwritten. */
  assert.deepEqual(texts([voice('personal', null, false, 'A'), voice('student', null, true, 'A'), installed('personal'), installed('student')]), [
    'Personal added beside Student',
    'Added the Personal starter',
    'Added the Student starter',
  ]);
  /* A third beside a voice already written down names the one that spoke before. */
  assert.deepEqual(texts([voice('team', null, false, 'B'), installed('team'), voice('personal', null, false, 'A'), voice('student', null, true, 'A')]), [
    'Team board added beside Student',
    'Added the Team board starter',
    'Personal added beside Student',
  ]);
  /* A real switch: the one that spoke is set not to. */
  assert.deepEqual(texts([voice('student', true, false, 'A'), voice('personal', false, true, 'A')]), ['Personal speaks for this BrainDog now']);
  /* Switched to on arrival, when the one before had never been written down. */
  assert.deepEqual(texts([voice('team', null, true, 'A'), voice('student', null, false, 'A'), installed('team'), installed('student')]), [
    'Team board speaks for this BrainDog now',
    'Added the Team board starter',
    'Added the Student starter',
  ]);

  /* TWO WRITES, NOTHING LOGGED BETWEEN THEM, ARE TWO CHANGES. A switch to Student, then Team board added beside it: read by
     where the lines sit, the three were one switch, and Team board's line was dropped. */
  const twoWrites = [voice('team', null, false, 'B'), voice('student', false, true, 'A'), voice('personal', true, false, 'A')];
  assert.deepEqual(texts(twoWrites), ['Team board added beside Student', 'Student speaks for this BrainDog now']);
  /* The lines of one write are read together wherever they sit, and a line with no batch is read alone. */
  assert.deepEqual(texts([voice('personal', null, false, 'A'), installed('personal'), voice('student', null, true, 'A')]), ['Personal added beside Student', 'Added the Personal starter']);
  assert.deepEqual(texts([voice('personal', null, false), voice('student', null, true)]), ['Personal added beside Student']);
});

test('ANOTHER PERSON IN THE FEED IS NAMED WHEN boot SAID THE NAME, and is Someone on this record when it did not, never an id', () => {
  const ada = 'p_01M2PAZ28BN3FTKQB266DVT4HX';
  const cy = 'p_01M2PB0000000000000000000C';
  const events = [line({ actor: ada, kind: 'decide', title: 'Renew' }), line({ actor: cy, kind: 'decide', title: 'Renew' }), line({ actor: 'p_1', kind: 'decide', title: 'Renew' })];
  assert.deepEqual(newsOf(events as never, 'p_1', new Map([[ada, 'Ada Lovelace']])).map((i) => i.by), ['Ada Lovelace', 'Someone you share with', 'you']);
  const shell = layoutOf({ ...BOOT, names: { [ada]: 'Ada Lovelace' }, whatsNew: { events: [line({ actor: ada, kind: 'decide', title: 'Renew' })], upTo: 1, sinceCapped: false } } as never);
  assert.deepEqual(shell.names, { [ada]: 'Ada Lovelace' });
  assert.equal(shell.whatsNew[0]?.by, 'Ada Lovelace');
});

test("THE READER'S OWN LINES ARE you, never Someone on this record and never her own name, as the first run's boot sends them", () => {
  /* THE WALK'S OWN SHAPE (`tools/people/expect/first-run.mjs`): the owner's id is a minted one, `boot` names her among
     `names`, and every line she wrote is signed with that id. Seen as "Someone on this record added Nadia" on Today,
     which is the page's feed block and not this one: the shell's news already said it right, and this holds it there. */
  const mariam = 'p_01M45MN5M03SECPTPXD5P98F44';
  const mine = [line({ actor: mariam, kind: 'create', register: 'people', seq: 2, title: 'Nadia', target: 'entry:x', target_kind: 'entry' }), line({ actor: mariam, kind: 'decide', title: 'Renew' })];
  const shell = layoutOf({ ...BOOT, me: { kind: 'person', person: mariam, name: 'Mariam', level: 'owner' }, names: { [mariam]: 'Mariam' }, whatsNew: { events: mine, upTo: 2, sinceCapped: false } } as never);
  assert.equal(shell.me.person, mariam);
  assert.deepEqual(shell.whatsNew.map((i) => i.by), ['you', 'you']);
  /* Read with no reader, which is what a caller that forgot to hand one over does, she is her name and still no id. */
  assert.deepEqual(newsOf(mine as never, null, new Map([[mariam, 'Mariam']])).map((i) => i.by), ['Mariam', 'Mariam']);
  assert.deepEqual(newsOf(mine as never, null).map((i) => i.by), ['Someone you share with', 'Someone you share with']);
});

test('what was applied, kept on a decision, is not a line of its own in the feed', () => {
  const items = newsOf([line({ kind: 'note', target: 'decision:D7', target_kind: 'decision', note: 'Applied what was accepted.' }), line({ kind: 'decide', title: 'Add Personal?' })] as never, null);
  assert.deepEqual(items.map((i) => i.text), ['Decided: Add Personal?']);
});

test('THE REASON A QUESTION WAS ACCEPTED FOR IS PART OF ITS DECISION LINE, never a line of its own', () => {
  const items = newsOf(
    [
      line({ rowid: 12, kind: 'resolve', target: 'suggestion:SG2', target_kind: 'suggestion', to: 'addressed', note: 'Yes, for the proof.', title: 'Add Personal?' }),
      line({ rowid: 11, kind: 'decide', target: 'decision:D2', target_kind: 'decision', title: 'Add Personal?', settles: 'SG2' }),
      /* A resolve with no decision before it (a no) keeps its own line. */
      line({ rowid: 5, kind: 'resolve', target: 'suggestion:SG1', target_kind: 'suggestion', to: 'wont-fix', note: 'Not this week.', title: 'Add Student?' }),
    ] as never,
    null,
  );
  assert.deepEqual(items.map((i) => i.text), ['Decided: Add Personal? Yes, for the proof.', 'Not this week.']);
  const bare = newsOf([line({ rowid: 3, kind: 'resolve', target: 'suggestion:SG3', to: 'addressed', note: null }), line({ rowid: 2, kind: 'decide', title: 'Renew', settles: 'SG3' })] as never, null);
  assert.deepEqual(bare.map((i) => i.text), ['Decided: Renew']);
});

test('A MEMBER HELD TO ONE LIST IS SENT NO ROWID, and the reason still folds into its decision by the question it settled', () => {
  /* THE PAIR WAS `rowid - 1`. The record no longer sends a rowid to somebody invited to
     named lists, because the gap between two of hers counted the events she was not shown, so the decision's line says
     which question it settled and the `resolve` is found by that. Here the two sit apart in the answer, with a line of
     somebody else's between them, which `rowid - 1` could never have paired even when the numbers were there. */
  const scoped = [
    line({ id: 'e9', kind: 'resolve', target: 'suggestion:SG7', target_kind: 'suggestion', to: 'addressed', note: 'It is ours.', title: 'File Invoice 43?' }),
    line({ id: 'e8', kind: 'create', register: 'obligations', seq: 4, title: 'Invoice 43', target: 'entry:x', target_kind: 'entry' }),
    line({ id: 'e7', kind: 'decide', target: 'decision:D5', target_kind: 'decision', title: 'File Invoice 43?', settles: 'SG7' }),
    /* A resolve of another question at another moment keeps its own line. */
    line({ id: 'e6', ts: '2026-09-15T08:00:00.000Z', kind: 'resolve', target: 'suggestion:SG1', target_kind: 'suggestion', to: 'wont-fix', note: 'Not this week.', title: 'Add Student?' }),
  ].map(({ rowid: _rowid, ...rest }) => rest);
  assert.ok(!scoped.some((e) => 'rowid' in e));
  const texts = newsOf(scoped as never, null).map((i) => i.text);
  assert.equal(texts.length, 3, JSON.stringify(texts));
  assert.equal(texts[1], 'Decided: File Invoice 43? It is ours.', JSON.stringify(texts));
  assert.ok(!texts.includes('It is ours.'), 'the reason is a line of its own');
  assert.equal(texts[2], 'Not this week.');
  const shell = layoutOf({ ...BOOT, whatsNew: { events: scoped, upTo: 'e.e9', sinceCapped: false } } as never);
  assert.equal(shell.upTo, 'e.e9', 'the cursor she was handed is what Mark all read sends back');
  assert.equal(shell.version, 0, 'a version drawn from a cursor that is not a number');
});

test('access given or taken away reads as a sentence, never as "Access grant"', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'access.grant', note: null, ...over })] as never, null)[0]?.text;
  assert.equal(at({ target_kind: 'member', field: '*', to: 'owner' }), 'Gave someone owner access to everything');
  assert.equal(at({ actor: 'p_1', target: 'person:p_1', target_kind: 'person', field: '*', to: 'owner' }), 'Your BrainDog was made', 'the owner made the record, nobody was let in');
  assert.equal(at({ target_kind: 'member', field: 'obligations', to: 'read' }), 'Gave someone read access on Bills and invoices');
  assert.equal(at({ kind: 'access.revoke', target_kind: 'member', field: '*', from: 'write', to: null }), "Took away someone's write access to everything");
  assert.equal(at({ target_kind: 'token', to: 'propose', note: 'Claude on the laptop' }), 'Made a key that can read and propose: Claude on the laptop');
  assert.equal(at({ target_kind: 'device_grant', to: 'login' }), 'Let a device sign in');
});

test('the making of a BrainDog is one line, and her first own write keeps its own (E5)', () => {
  const at = '2026-09-15T09:00:00.000Z';
  const later = '2026-09-15T09:01:00.000Z';
  const events = [
    line({ id: 'e9', ts: later, kind: 'install', actor: 'system', target: 'pack:reading-list', target_kind: 'pack', to: '1.0.0' }),
    line({ id: 'e8', ts: later, kind: 'create', register: 'orders', seq: 1, title: 'Chocolate cake', target: 'entry:o1', target_kind: 'entry' }),
    line({ id: 'e7', ts: later, kind: 'update', actor: 'system', note: 'BrainDog updated 2 add-ons', pass: { said: 'BrainDog updated 2 add-ons', updated: 2, asked: 0, steps: 2, at: later } }),
    line({ id: 'e6', kind: 'edit', register: 'people', seq: 1, title: 'Nadia', target: 'entry:n1', target_kind: 'entry', field: 'self', from: false, to: true }),
    line({ id: 'e5', kind: 'create', register: 'people', seq: 1, title: 'Nadia', target: 'entry:n1', target_kind: 'entry' }),
    line({ id: 'e4', kind: 'edit', actor: 'p_1', target: 'pack:usecase-shop', target_kind: 'pack', from: { speaks: false }, to: { speaks: true } }),
    line({ id: 'e3', kind: 'install', actor: 'system', target: 'pack:money-core', target_kind: 'pack', to: '3.0.0' }),
    line({ id: 'e2', kind: 'install', actor: 'system', target: 'pack:core', target_kind: 'pack', to: '1.0.0' }),
    line({ id: 'e1', kind: 'access.grant', target: 'person:p_1', target_kind: 'person', field: '*', to: 'owner' }),
  ];
  const texts = newsOf(events as never, null).map((i) => i.text);
  assert.equal(texts.length, 3, JSON.stringify(texts));
  assert.match(texts[0]!, /^Added /u, 'the add-on added after her first order keeps its line');
  assert.deepEqual(texts.slice(1), ['Added Chocolate cake', 'Your BrainDog was made']);
  assert.ok(!texts.some((t) => /this is you|updated 2 add-ons|Bills and invoices/u.test(t)), JSON.stringify(texts));
});

test('a pack install names the list it brought, not the bare verb', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ actor: 'system', target_kind: 'pack', ...over })] as never, null)[0]?.text;
  assert.equal(at({ kind: 'install', target: 'pack:estate' }), 'Added the Services list');
  assert.equal(at({ kind: 'uninstall', target: 'pack:estate' }), 'Removed the Services list');
  assert.equal(at({ kind: 'install', target: 'pack:nobody-knows' }), 'Added the Nobody knows plugin');
  assert.equal(at({ kind: 'install', target: 'pack:usecase-student' }), 'Added the Student starter');
  assert.equal(at({ kind: 'install', target: 'pack:usecase-team' }), 'Added the Team board starter');
  assert.equal(at({ kind: 'uninstall', target: 'pack:usecase-book-club' }), 'Removed the Book club starter');
  assert.equal(at({ kind: 'uninstall', target: 'pack:usecase-new-project' }), 'Removed the New project starter');
});

/**
 * NO RECORD HERE IS A REFUSAL LIKE ANY OTHER, and the sample it used to answer is gone.
 *
 * THESE THREE WERE THE SAMPLE'S DOOR. A 401, a socket that failed and a static host's 404 page at an address with no
 * slug all answered `{ from: 'sample' }`, kept for the tab, and the shell drew The Studio over them. Now each is the
 * refusal it was: the layout sends the 401 to sign-in and draws the other two as a record that could not be reached.
 * NOT KEPT, like every refusal, so the first load after somebody signs in asks the record rather than being handed the
 * answer from before; the kept sample was exactly that bug (`signin-onward.test.ts`).
 */
for (const [what, answer, code] of [
  ['nothing answers', null, 'UNREACHABLE'],
  ['the record says UNAUTHORIZED', () => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }), 'UNAUTHORIZED'],
  ['a static host answers a 404 page', () => new Response('<!doctype html><title>Not found</title>', { status: 404 }), 'UNREACHABLE'],
] as const) {
  test(`${what} at the bare address: the answer is a refusal, ${code}, and it is asked again`, async () => {
    forget();
    const { io, sent } = host(answer);
    const first = await readBoot(`${BASE}`, io);
    assert.equal(first.from, 'refused', JSON.stringify(first));
    assert.equal(first.from === 'refused' ? first.code : null, code);
    await readBoot(`${BASE}`, io);
    assert.equal(sent.length, 2, 'a refusal about whether anybody is signed in was kept for the tab');
    assert.equal(new URL(sent[0]!).pathname, '/api/boot');
    forget();
  });
}

test('A 401 AT THE BARE ADDRESS ANSWERS THE RECORD\'S OWN REFUSAL, word for word, and the shell drawn over it carries it', async () => {
  forget();
  const { io } = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }));
  assert.deepEqual(await readBoot(`${BASE}`, io), { from: 'refused', code: 'UNAUTHORIZED', fix: 'Sign in again.' });
  const shell = refusedShell();
  assert.equal(shell.live, true, 'nothing drawn over a refusal is the in-browser sample');
  assert.equal(shell.index.registers.length, 0);
  assert.deepEqual(shell.refused, { code: 'UNAUTHORIZED', fix: 'Sign in again.' });
  forget();
});

test('THE SHELL MODULE NO LONGER CARRIES A SAMPLE SHELL', async () => {
  const mod: Record<string, unknown> = await import('./boot-live.ts');
  assert.equal(mod.sampleShell, undefined);
});

test('UNDER A SLUG A 401 ASKS FOR SIGN-IN AND IS NEVER THE SAMPLE, which would be drawn dressed as that record', async () => {
  forget();
  const { io, sent } = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in again.' } }));
  assert.deepEqual(await readBoot(`${BASE}/acme`, io), { from: 'refused', code: 'UNAUTHORIZED', fix: 'Sign in again.' });
  assert.equal(new URL(sent[0]!).pathname, '/acme/api/boot');
  forget();
});

test('A KEPT BOOT IS KEPT FOR ITS OWN RECORD, so a tab that moves to another slug asks that one', async () => {
  forget();
  const { io, sent } = host(() => json(200, { ok: true, value: BOOT }));
  await readBoot(`${BASE}/acme`, io);
  await readBoot(`${BASE}/acme`, io);
  await readBoot(`${BASE}/kiln`, io);
  assert.deepEqual(sent.map((u) => new URL(u).pathname), ['/acme/api/boot', '/kiln/api/boot']);
  forget();
});

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

test('A RECORD SETTING ITSELF UP IS ONE LINE: the use case and how many example items', () => {
  const at = (over: Record<string, unknown>) => newsOf([line({ kind: 'setup', note: null, field: null, from: null, register: null, seq: null, title: null, ...over })] as never, null)[0]?.text;
  assert.equal(at({ target: 'pack:usecase-personal', target_kind: 'pack', to: 40 }), 'Set up Personal with 40 example items');
  assert.equal(at({ target: null, target_kind: null, to: 1 }), 'Added 1 example item');
  assert.equal(at({ target: null, target_kind: null, to: 0 }), 'Linked the examples to each other');
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

/* THE RAIL IS WHAT `nav` DOES NOT MARK `cut`. A page that waits is still carried, cut and marked `waits`, so the sidebar can
   hold it under its place's More and the palette can find it (9cc614088, audit 31 Oct f, AF7). */
const railOf = (shell: ReturnType<typeof layoutOf>): string[] => shell.nav.filter((n) => !n.cut).map((n) => n.href);

test('A PLACE OVER SEVERAL LISTS IS JUDGED BY THE LIST ITS SECTION IS NAMED AS: off the rail at no rows, on it at one', () => {
  /* Sam after sign-up: Renewals reads Services, its numbers and the open questions, so boot sends it no `list`. */
  const estate = { slug: 'estate', title: 'Renewals', nav: { section: 'Services', order: 10 }, icon: null, list: null };
  const money = { slug: 'ledger', title: 'Ledger', nav: { section: 'Money', order: 20 }, icon: null, list: null };
  const at = (count: number) =>
    railOf(layoutOf({ ...BOOT, registers: [{ id: 'services', name: 'Services', count }], pages: [estate, money] } as never));
  assert.ok(!at(0).includes('/p/estate'), 'a place with nothing in it is in the rail');
  const waited = layoutOf({ ...BOOT, registers: [{ id: 'services', name: 'Services', count: 0 }], pages: [estate] } as never).nav.find((n) => n.href === '/p/estate');
  assert.ok(waited?.cut === true && waited.waits === true, 'a page that waits is no longer carried for the sidebar and the palette');
  assert.ok(at(1).includes('/p/estate'), 'the place did not come back with its first row');
  /* No list is named Money, so its page is never judged. */
  assert.ok(at(0).includes('/p/ledger'));
  assert.ok(at(1).includes('/p/ledger'));
});

test('A PAGE THAT NAMES ITS PLACE ON THE RAIL NEVER WAITS: Money and Projects stand on day 0, a side page still waits', () => {
  /* A new record asked for Money and Projects: every list is empty, and before U-C2 neither was in the bar. */
  const money = { slug: 'money', title: 'Money', nav: { section: 'Money', order: 10, place: 40 }, icon: null, list: null, lists: ['accounts'] };
  const projects = { slug: 'projects', title: 'Projects', nav: { section: 'Projects', order: 5, place: 30 }, icon: null, list: 'projects', lists: null };
  const board = { slug: 'board', title: 'Board', nav: { section: 'Work', order: 20 }, icon: null, list: null, lists: ['tasks'] };
  const nav = layoutOf({
    ...BOOT,
    registers: [
      { id: 'accounts', name: 'Accounts', count: 0 },
      { id: 'projects', name: 'Projects', count: 0 },
      { id: 'tasks', name: 'Tasks', count: 0 },
    ],
    pages: [money, projects, board],
  } as never).nav.filter((n) => !n.cut).map((n) => n.href);
  assert.deepEqual(nav, ['/p/money', '/p/projects']);
});

test('A PLACE THAT SAYS ITS LISTS IS JUDGED BY ALL OF THEM: off the rail while every one is empty, on it at the first row in any', () => {
  /* Sam's Work reads tasks and milestones, and `boot` now says both (`lists`), so no section name is guessed at. */
  const work = { slug: 'work', title: 'Work', nav: { section: 'Work', order: 10 }, icon: null, list: null, lists: ['tasks', 'milestones'] };
  /* Reads no list of its own, and says so: never judged, though a list is named as its section and holds nothing. */
  const people = { slug: 'team', title: 'People', nav: { section: 'People', order: 20 }, icon: null, list: null, lists: [] };
  const view = { slug: 'tasks-mine', title: 'Mine', nav: { section: 'Views', order: 900 }, icon: null, list: 'tasks', lists: ['tasks'] };
  const loose = { slug: 'notes', title: 'Notes', nav: { section: 'Notes', order: 30 }, icon: null, list: null };
  const at = (tasks: number, milestones: number, over: Record<string, unknown> = {}) =>
    layoutOf({
      ...BOOT,
      registers: [
        { id: 'tasks', name: 'Tasks', count: tasks },
        { id: 'milestones', name: 'Milestones', count: milestones },
        { id: 'contacts', name: 'People', count: 0 },
      ],
      pages: [work, people, view, loose],
      ...over,
    } as never).nav.filter((n) => !n.cut).map((n) => n.href);
  assert.deepEqual(at(0, 0), ['/p/team', '/p/tasks-mine', '/p/notes'], 'a place whose lists all hold nothing is in the rail');
  assert.ok(at(0, 1).includes('/p/work'), 'the place did not come with the first row in its second list');
  assert.ok(at(1, 0).includes('/p/work'));

  /* `lists` WINS OVER `list` AND OVER THE SECTION'S NAME: one list is empty and the page reads a second that is not. */
  const one = { ...work, list: 'tasks', nav: { section: 'Tasks', order: 10 } };
  assert.ok(railOf(layoutOf({ ...BOOT, registers: [{ id: 'tasks', name: 'Tasks', count: 0 }, { id: 'milestones', name: 'Milestones', count: 2 }], pages: [one] } as never)).includes('/p/work'));
  /* A list the caller was not sent is not counted against the page: nothing says it is empty. */
  assert.ok(railOf(layoutOf({ ...BOOT, registers: [{ id: 'tasks', name: 'Tasks', count: 0 }], pages: [{ ...work, lists: ['tasks', 'hidden'] }] } as never)).includes('/p/work'));

  /* A COLLEAGUE'S OWN LIST KEEPS ITS PAGE AT NO ROWS, as it keeps the list (`theirs`). */
  const theirs = layoutOf({
    registers: [{ id: 'tasks', name: 'Tasks', count: 0 }, { id: 'milestones', name: 'Milestones', count: 0 }],
    me: { kind: 'person', person: 'p_9', name: null, level: null },
    pages: [work],
    now: '2026-09-22T09:00:00.000Z',
  } as never);
  assert.deepEqual(railOf(theirs), ['/p/work']);

  /* A HOST THAT SENDS NO `lists` READS AS BEFORE: the one list, else the list its section is named as. */
  const old = [{ slug: 'work', title: 'Work', nav: { section: 'Tasks', order: 10 }, icon: null, list: null }, { slug: 'ms', title: 'Milestones', nav: { section: 'Plan', order: 20 }, icon: null, list: 'milestones' }];
  const before = (tasks: number, milestones: number) =>
    railOf(layoutOf({ ...BOOT, registers: [{ id: 'tasks', name: 'Tasks', count: tasks }, { id: 'milestones', name: 'Milestones', count: milestones }], pages: old } as never));
  assert.deepEqual(before(0, 0), []);
  assert.deepEqual(before(1, 0), ['/p/work']);
  assert.deepEqual(before(0, 1), ['/p/ms']);
});

test('A PLACE WHOSE LISTS ARE ALL A STARTER SET (`lists: null`) IS OUT OF THE RAIL UNTIL THE FIRST ROW OF THE PERSON\'S OWN', () => {
  /* Money on its first day: Categories reads one list, and the eight rows in it were planted. The record leaves a
     starter set out of `lists`, and says `null` where that left none, so the page is not read as one that reads no list. */
  const planted = { slug: 'categories', title: 'Categories', nav: { section: 'Money', order: 10 }, icon: null, list: 'categories', lists: null };
  const several = { slug: 'budget', title: 'Budget', nav: { section: 'Money', order: 20 }, icon: null, list: null, lists: null };
  /* Reads no list and says so: `[]` is still never judged. */
  const none = { slug: 'about', title: 'About', nav: { section: 'Money', order: 30 }, icon: null, list: null, lists: [] };
  const registers = [{ id: 'categories', name: 'Categories', count: 8 }];
  const first = railOf(layoutOf({ ...BOOT, registers, pages: [planted, several, none] } as never));
  assert.deepEqual(first, ['/p/about'], 'a place over nothing but a starter set is in the rail, though its list counts eight');

  /* THE FIRST ROW OF THEIR OWN: the record says the list by name again, and the place comes. */
  const own = layoutOf({
    ...BOOT,
    registers: [{ id: 'categories', name: 'Categories', count: 9 }],
    pages: [{ ...planted, lists: ['categories'] }, { ...several, lists: ['categories'] }, none],
  } as never).nav.filter((n) => !n.cut).map((n) => n.href);
  assert.deepEqual(own, ['/p/categories', '/p/budget', '/p/about']);

  /* A list named as the page's section is not asked either: `null` is the record's word, and no name is guessed at. */
  const guessed = { ...several, nav: { section: 'Categories', order: 20 } };
  assert.deepEqual(railOf(layoutOf({ ...BOOT, registers, pages: [guessed] } as never)), []);

  /* A saved view over the list is somebody's own page and stays. */
  const view = { slug: 'categories-mine', title: 'Mine', nav: { section: 'Views', order: 900 }, icon: null, list: 'categories', lists: null };
  assert.ok(railOf(layoutOf({ ...BOOT, registers, pages: [view] } as never)).includes('/p/categories-mine'));
});

test('A COLLEAGUE\'S OWN LIST KEEPS ITS PLACE WHEN ALL IT HOLDS IS A STARTER SET, and a place over no list of theirs still waits', () => {
  const planted = { slug: 'categories', title: 'Categories', nav: { section: 'Money', order: 10 }, icon: null, list: 'categories', lists: null };
  const several = { slug: 'budget', title: 'Budget', nav: { section: 'Money', order: 20 }, icon: null, list: null, lists: null };
  const theirs = layoutOf({
    registers: [{ id: 'categories', name: 'Categories', count: 8 }],
    me: { kind: 'person', person: 'p_9', name: null, level: null },
    pages: [planted, several],
    now: '2026-09-22T09:00:00.000Z',
  } as never);
  assert.deepEqual(railOf(theirs), ['/p/categories']);
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
  assert.deepEqual(items[0], { at: at(0), by: 'you', text: 'Added 52 items and asked 8 questions at once, and more before these', href: '/audit?by=you&on=2026-09-15' });

  /* The same run with an hour-old line of its own after it: grouped, not "more before these", and the old line kept. */
  const older = line({ rowid: 1, ts: '2026-09-15T07:00:00.000Z', kind: 'create', register: 'tasks', seq: 99, title: 'By hand' });
  const mixed = newsOf([...bulk.slice(0, 20), older] as never, 'p_1');
  assert.deepEqual(mixed.map((m) => m.text), ['Added 12 items and asked 8 questions at once', 'Added By hand']);

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
  assert.deepEqual(items.map((i) => i.text), ['Cleared the examples: removed 3 items in Tasks', 'Added Older']);
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

/* ── the rail a real record draws ────────────────────────────────────────── */

/** One template's worth of pages: one per row, all under one heading, each saying which row it is about. */
const perRow = (register: string, section: string, rows: number, slug = register) =>
  Array.from({ length: rows }, (_, i) => ({
    slug: `${slug}-${i + 1}`,
    title: `${section} ${i + 1}`,
    nav: { section, order: i + 1 },
    icon: null,
    list: null,
    about: { register, seq: i + 1 },
  }));

/** His record, as `boot` sends it: 27 projects, 23 services, 22 skills, and one page somebody wrote. */
const AT_HIS_SCALE = [
  { slug: 'money', title: 'Money', nav: { section: 'Work', order: 1 }, icon: null, list: null },
  ...perRow('things', 'Projects', 27),
  ...perRow('services', 'Services', 23),
  ...perRow('skills', 'Skills', 22),
];

/** The same record's lists, holding the rows those pages are about: a section named as a list with no rows is no place. */
const HIS_LISTS = [
  { id: 'things', name: 'Projects', count: 27 },
  { id: 'services', name: 'Services', count: 23 },
  { id: 'skills', name: 'Skills', count: 22 },
];

test('THE RAIL A LIVE RECORD DRAWS IS CAPPED PER LIST AND HEADING, the same cap the sample applies to its own', () => {
  /**
   * THE CAP SHIPPED INTO THE SAMPLE AND THE PRODUCT'S OWN RAIL NEVER SAW IT. `api.ts`'s `boot()`
   * holds the rule and the sample is four projects forever, so the rule was true at a size where
   * it changes nothing and absent at every size where it matters. Measured here on the shape
   * `boot` really sends, at 27 projects, 23 services and 22 skills over three templates plus one
   * page somebody wrote: 73 rail entries before this, 72 of them one per row, against 16 after.
   * The same three templates through a real record's `boot`, which has no written page in it, are
   * 72 against 15.
   */
  const shell = layoutOf({ ...BOOT, registers: HIS_LISTS, pages: AT_HIS_SCALE } as never);
  const under = (section: string) => shell.nav.filter((n) => n.section === section).length;
  assert.deepEqual([under('Projects'), under('Services'), under('Skills')], [5, 5, 5], `the rail drew ${shell.nav.length} entries`);
  assert.equal(shell.nav.length, 16);
  /* A PAGE SOMEBODY WROTE IS NEVER PUSHED OUT BY ROWS, which is why the count is kept per list. */
  assert.equal(under('Work'), 1);
  /* THE FIVE KEPT ARE THE FIRST FIVE the record sent, which is the order the rail draws them in. */
  assert.deepEqual(
    shell.nav.filter((n) => n.section === 'Projects').map((n) => n.id),
    ['things-1', 'things-2', 'things-3', 'things-4', 'things-5'],
  );
  /* AND NOTHING IS HIDDEN BY IT: every page is still one Home may ask for, and still at its own address. */
  assert.equal(shell.pages.length, AT_HIS_SCALE.length);
});

test('and a host that does not say which row a page is about draws the rail it drew before', () => {
  /**
   * THE RULE IS INERT UNTIL `boot` FORWARDS THE FIELD, and that is where the record stands today:
   * `packages/record/src/index.ts` maps the kernel's page list key by key and does not copy this
   * one, so 72 of 72 rail pages arrive with no `about` at all. An older host sends none either.
   * Both have to draw the rail they drew before rather than a rail cut to five, which is what a
   * counter keyed on the heading alone, or one that treated an absent field as a list of its own,
   * would do to every page in the record at once.
   */
  const older = AT_HIS_SCALE.map((p) => ({ ...p, about: undefined }));
  assert.equal(layoutOf({ ...BOOT, registers: HIS_LISTS, pages: older } as never).nav.length, 73);
  /* AND THE COUNT IS PER RAIL. A counter made once where the module loads would spend the budget
     on the first shell and draw no project at all in the second, which is every navigation after
     the first in a tab that reads two records. */
  const twice = [layoutOf({ ...BOOT, registers: HIS_LISTS, pages: AT_HIS_SCALE } as never), layoutOf({ ...BOOT, registers: HIS_LISTS, pages: AT_HIS_SCALE } as never)];
  assert.deepEqual(
    twice.map((s) => s.nav.length),
    [16, 16],
  );
});

test('THE FIVE A TEMPLATE DRAWS ARE THE ROWS TOUCHED LAST, drawn and tabbed in the record\'s own order', () => {
  /* THE KERNEL NOW LISTS A TEMPLATE'S PAGES IN THE ORDER THE ROWS WERE WRITTEN, so a strip of tabs does not move when a
     row is edited, and the first five of that are the five oldest. Where the list came newest first they were the five
     edited last, and that is what the rail keeps drawing: chosen by `about.updated_at`, placed where the record put them.

     A TABBED SECTION'S PAGES ARE NEVER CUT BY THE BUDGET (`boot-live.ts`): the strip of tabs draws every one of
     them, in the record's own order, and only the rail narrows to the five kept, each entry past that carrying `cut`.
     So `rail` below reads `nav` less anything `cut`, and `tabs`, which `tabsOf` draws from the same `nav` without ever
     reading `cut`, is the same seven pages whichever five the budget kept. */
  const at = (minute: number) => `2026-09-25T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const part = (n: number, minute: number) => ({
    slug: `part-${n}`,
    title: `Part ${n}`,
    nav: { section: 'Launch', order: 20, tabs: true as const },
    icon: null,
    list: null,
    about: { register: 'parts', seq: n, updated_at: at(minute) },
  });
  const desk = { slug: 'desk', title: 'Desk', nav: { section: 'Launch', order: 10, tabs: true as const }, icon: null, list: null, about: null };
  /* Seven parts written in order, then parts 6 and 2 edited. Touched last: 2, 6, 7, 5, 4. */
  const touched = { 1: 1, 2: 30, 3: 3, 4: 4, 5: 5, 6: 20, 7: 7 } as Record<number, number>;
  const drawn = (edits: Record<number, number> = {}) => {
    const pages = [desk, ...[1, 2, 3, 4, 5, 6, 7].map((n) => part(n, edits[n] ?? touched[n]!))];
    const shell = layoutOf({ ...BOOT, pages } as never);
    return {
      rail: shell.nav.filter((n) => n.section === 'Launch' && !n.cut).map((n) => n.id),
      tabs: tabsOf(shell.nav, '/p/desk')?.shown.map((t) => t.href),
    };
  };
  const ALL_TABS = ['/p/desk', '/p/part-1', '/p/part-2', '/p/part-3', '/p/part-4', '/p/part-5', '/p/part-6', '/p/part-7'];
  assert.deepEqual(drawn(), {
    rail: ['desk', 'part-2', 'part-4', 'part-5', 'part-6', 'part-7'],
    tabs: ALL_TABS,
  });
  /* EDITING A PART THAT IS ALREADY DRAWN MOVES NOTHING. */
  assert.deepEqual(drawn({ 4: 40 }), drawn());
  /* EDITING ONE THAT IS NOT BRINGS IT IN WHERE IT WAS WRITTEN, and the one touched longest ago goes. */
  assert.deepEqual(drawn({ 1: 50 }).rail, ['desk', 'part-1', 'part-2', 'part-5', 'part-6', 'part-7']);
  /* THE STRIP NEVER MOVES: every part stays a tab, in the order the rows were written, whichever five the rail keeps. */
  assert.deepEqual(drawn({ 1: 50 }).tabs, ALL_TABS);
});

test('and a second template over one list draws its own five, rather than nothing at all', () => {
  /* THE HEADING IS IN THE KEY, as `api.ts` found when a `Clients` template beside the shipped
     `Projects` one drew 0 of 26: the first template had spent a budget kept per register alone. */
  const shell = layoutOf({ ...BOOT, pages: [...perRow('things', 'Projects', 27), ...perRow('things', 'Clients', 26, 'client')] } as never);
  const under = (section: string) => shell.nav.filter((n) => n.section === section).length;
  assert.deepEqual([under('Projects'), under('Clients')], [5, 5]);
});

/**
 * A RECORD THAT REFUSED IS NOT AN EMPTY RECORD, and until the shell carried the refusal nothing
 * downstream could tell them apart.
 *
 * Measured against a provisioned self-host holding 19 lists and 230 rows: a colleague invited with
 * `Adds only` accepts, and `boot` answers 403
 * `{"code":"LEVEL_REQUIRED","fix":"This needs read, and you have append access. Ask an owner to
 * raise your access.","allowed":["propose","append"]}`. The shell drawn over that answer had zero
 * registers and nothing else, so Home took its "never started" branch and offered `Start here`, the
 * onboarding of a record that already exists and that this reader may not open: 50 words and one
 * control, against the owner's 489 and 27 on the same record at the same minute.
 */
test('A RECORD THAT REFUSED SAYS SO IN THE SHELL, so Home can tell nothing here from nothing for you', async () => {
  forget();
  const fix = 'This needs read, and you have append access. Ask an owner to raise your access.';
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'LEVEL_REQUIRED', fix } }));
  assert.deepEqual(await readBoot(BASE, io), { from: 'refused', code: 'LEVEL_REQUIRED', fix });
  const shell = refusedShell();
  assert.deepEqual(shell.refused, { code: 'LEVEL_REQUIRED', fix });
  assert.equal(shell.index.registers.length, 0, 'the rail is still empty over a refusal');
  forget();
});

/**
 * AND THE SENTENCE IS DROPPED BY THE NEXT READ, not only by `forget()`.
 *
 * THE FIRST VERSION OF THIS TEST CALLED `forget()` BETWEEN THE TWO READS and so proved nothing
 * about the read: commenting out `refusal = null` in `readBoot` left all twenty-seven tests green,
 * which is a test passing against the code it is named after being broken. `forget()` has its own
 * test above. A refused `boot` leaves `kept` null on purpose, so the next read goes to the record
 * again with no `forget()` in front of it, and that is the path a colleague takes the minute an
 * owner raises their access: the refusal must not outlive it.
 */
test('and a shell over a record that answered, or over no record at all, carries no refusal', async () => {
  forget();
  const { io } = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } }));
  assert.equal((await readBoot(BASE, io)).from, 'refused');
  const live = host(() => json(200, { ok: true, value: BOOT }));
  assert.equal((await readBoot(BASE, live.io)).from, 'live');
  assert.equal(layoutOf(BOOT as never).refused, undefined);
  assert.equal(refusedShell().refused, undefined, 'a refusal from a read that came back was still being carried');

  /* AND OVER A HOST WHERE NOBODY IS SIGNED IN. A tab can go from a record that refused to a host that
     answers 401; that host's own sentence is the one carried, never the first host's. It was the
     sample's shell here, with no sentence at all, until the sample went. */
  forget();
  const again = host(() => json(403, { ok: false, refusal: { code: 'FORBIDDEN', fix: 'Ask the owner.' } }));
  assert.equal((await readBoot(BASE, again.io)).from, 'refused');
  const none = host(() => json(401, { ok: false, refusal: { code: 'UNAUTHORIZED', fix: 'Sign in.' } }));
  assert.equal((await readBoot(BASE, none.io)).from, 'refused');
  assert.deepEqual(refusedShell().refused, { code: 'UNAUTHORIZED', fix: 'Sign in.' }, 'a refusal from another host was still being carried');
  forget();
});

/**
 * A COLLEAGUE INVITED TO ONE LIST KEEPS THAT LIST, AND THE SHELL KEEPS THE FACT THAT IT IS ONE.
 *
 * MEASURED through the real seed and the record's own `boot`:
 * a bookkeeper given `write` on an Expenses list made for them, and empty on the day they arrive,
 * gets `boot.registers` of exactly `[Expenses 0]` and `boot.me.level` of `null`. The shell turned the
 * `null` into `read` and dropped the list for having no rows, so the rail was empty and Home said
 * "Nothing in the record yet." with `Start here` over a record of 230 rows. Both facts were in the
 * answer and both were thrown away here.
 */
test('A ONE-LIST COLLEAGUE KEEPS THEIR LIST IN THE RAIL AT ZERO ROWS, and the shell says which lists they hold', () => {
  const shell = layoutOf({
    registers: [{ id: 'expenses', name: 'Expenses', count: 0 }],
    me: { kind: 'person', person: 'p_9', name: null, level: null },
    now: '2026-09-22T09:00:00.000Z',
  } as never);
  assert.deepEqual(shell.index.registers.map((r) => [r.id, r.count]), [['expenses', 0]], 'the one list they came for is not in the rail');
  assert.deepEqual(shell.me.lists, ['expenses']);
  /* THE FALLBACK STAYS FOR EVERY OTHER CALLER, so nothing reading `level` sees a word it does not know. */
  assert.equal(shell.me.level, 'read');
  assert.equal(shell.me.owner, false);

  /* AND A RECORD-WIDE MEMBER, A TOKEN AND AN OWNER HOLD THE RECORD, NOT A LIST OF LISTS. */
  assert.equal(layoutOf(BOOT as never).me.lists, null);
  assert.equal(layoutOf({ ...BOOT, me: { kind: 'token', person: null, name: null, level: null } } as never).me.lists, null);
  assert.equal(layoutOf({ ...BOOT, me: { kind: 'person', person: 'p_1', name: 'Ada', level: 'owner' } } as never).me.lists, null);
  assert.equal(refusedShell(null).me.lists, null);
  /* An owner's empty list still leaves the rail, which is the owner's rule and not this one. */
  assert.deepEqual(layoutOf(BOOT as never).index.registers.map((r) => r.id), ['obligations']);
});

/**
 * WHO IS WORKING IS `boot`'S: the runs it sends as `working`, by the record's one clock, each with the age the
 * record counts (`ran_s`). The rail no longer asks the record to draw a page of its own to count them.
 */
test('the working runs are the ones boot sends, with their age, their project by name and the kind of agent', () => {
  const shell = layoutOf({
    ...BOOT,
    shape: 2,
    working: [
      { spoken: 'S41', seq: 41, agent: 'claude', doing: 'Filing the receipts', project: 'Kiln', since: '2026-09-15T11:00:00.000Z', last_seen: '2026-09-15T11:58:00.000Z', ran_s: 3600 },
    ],
  } as never);
  assert.deepEqual(
    shell.working.map((w) => [w.seq, w.agent, w.doing, w.project, w.quiet, w.ran_s]),
    [[41, 'claude', 'Filing the receipts', 'Kiln', false, 3600]],
  );
  assert.equal(shell.working[0]?.kind, workingOf({ ...BOOT, working: [{ agent: 'claude' }] } as never)[0]?.kind);
});

/**
 * AN OLDER HOST'S `boot` HAS NO `working`, `waits` OR `voice`. Its live runs are read for the working ones (active, not
 * quiet, not stale, as that host judged them), what waits is `null` so each screen says what it said before, and the
 * badge is the record's own count.
 */
test("an older host's boot: working from its live runs, no waits, and the badge from its counts", () => {
  const older = {
    ...BOOT,
    counts: { decide: 7, inbox: 3 },
    sessions: [
      { id: 'r1', seq: 1, spoken: 'S1', state: 'active', version: 1, fields: { agent: 'codex', doing: 'Reading' }, stale: false, quiet: false, age_s: 60, ran_s: 600, same_repo: false },
      { id: 'r2', seq: 2, spoken: 'S2', state: 'active', version: 1, fields: { agent: 'claude' }, stale: false, quiet: true, age_s: 2400, ran_s: 900, same_repo: false },
      { id: 'r3', seq: 3, spoken: 'S3', state: 'idle', version: 1, fields: { agent: 'claude' }, stale: false, quiet: false, age_s: 60, ran_s: 60, same_repo: false },
    ],
  };
  const shell = layoutOf(older as never);
  assert.deepEqual(shell.working.map((w) => w.seq), [1]);
  assert.equal(shell.waits, null);
  assert.equal(shell.lateDays, null);
  assert.deepEqual([shell.open, shell.inbox], [7, 3]);
});

/** WHAT WAITS IS `boot`'S, AND THE BADGE IS ITS COUNT, so the rail, Today and Decide say one number. */
test('what waits is read off boot whole, and the badge and the inbox count are its numbers', () => {
  const waits = { questions: 25, late: 10, hard: 22, inbox: 32, working: 1 };
  const shell = layoutOf({ ...BOOT, shape: 2, counts: { decide: 99, inbox: 99 }, waits, lateDays: 14, working: [] } as never);
  assert.deepEqual(shell.waits, waits);
  assert.deepEqual([shell.open, shell.inbox, shell.lateDays], [25, 32, 14]);
  /* A COUNT THAT IS NOT A WHOLE NUMBER IS NO ANSWER, and an inbox the reader is not told about stays `null`. */
  assert.equal(waitsOf({ ...BOOT, waits: { ...waits, late: -1 } } as never), null);
  assert.equal(waitsOf({ ...BOOT, waits: { ...waits, inbox: null } } as never)?.inbox, null);
});

/** THE POLL'S RE-READ IS ONE `boot`, AND IT IS KEPT: the next screen's shell is the record as it is now. */
test("the poll's re-read asks boot again once and keeps that answer for the next screen", async () => {
  forget();
  let n = 0;
  const { io, sent } = host(() => json(200, { ok: true, value: { ...BOOT, waits: { questions: ++n, late: 0, hard: 0, inbox: 0, working: 0 } } }));
  const first = await readBoot(BASE, io);
  const again = await rereadBoot(BASE, io);
  const kept = await readBoot(BASE, io);
  assert.equal(sent.length, 2, 'the re-read asked more than once, or the next read asked again');
  assert.ok(first.from === 'live' && again.from === 'live' && kept.from === 'live');
  assert.deepEqual([waitsOf(first.boot)?.questions, waitsOf(again.boot)?.questions, waitsOf(kept.boot)?.questions], [1, 2, 2]);
  forget();
});

/**
 * EACH LIST WEARS THE ICON IT DECLARES, AS `boot` SENDS IT. The rail read the icon from `REGISTERS`, which is empty
 * until a screen has read a list's schema, so every list in it wore the same `rows` glyph.
 */
test("a list in the rail wears the icon boot sends with it, and a word with no glyph falls back to the declaration's", () => {
  const shell = layoutOf({
    ...BOOT,
    registers: [
      { id: 'obligations', name: 'Obligations', count: 3, icon: 'calendar' },
      { id: 'services', name: 'Services', count: 2, icon: 'no-such-icon' },
      { id: 'notes', name: 'Notes', count: 1 },
    ],
  } as never);
  const icons = Object.fromEntries(shell.index.registers.map((r) => [r.id, r.icon]));
  assert.equal(icons.obligations, 'calendar', 'the icon boot sent was not drawn');
  assert.notEqual(icons.services, 'no-such-icon', 'a word with no glyph reached the rail');
  assert.equal(icons.notes, 'rows', 'a list nobody gave an icon did not take the plain one');
});

/** A PROJECT IS ALWAYS ITS HUE: the one `boot` sends on `about`, else the hue its name is drawn in elsewhere. */
test("a page about a row carries the hue boot sends, else its name's", () => {
  const shell = layoutOf({
    ...BOOT,
    pages: [
      { slug: 'kiln', title: 'Kiln', nav: { section: 'Projects', order: 1 }, icon: null, about: { register: 'projects', seq: 41, hue: 210 } },
      { slug: 'portage', title: 'Portage', nav: { section: 'Projects', order: 2 }, icon: null, about: { register: 'projects', seq: 42 } },
      { slug: 'odd', title: 'Odd', nav: { section: 'Projects', order: 3 }, icon: null, about: { register: 'projects', seq: 43, hue: 'blue' } },
    ],
  } as never);
  const hues = Object.fromEntries(shell.nav.map((n) => [n.id, n.hue]));
  assert.equal(hues.kiln, 210, "the hue boot sent was not the project's");
  assert.equal(hues.portage, hueFor('Portage'), 'a project with no hue sent did not fall back to its name');
  assert.equal(hues.odd, hueFor('Odd'), 'a hue that is not a turn was drawn');
});


test("HOME KNOWS AN ADDS-ONLY REFUSAL BY THE RECORD'S OWN `at`: the two spellings of level.append are one", () => {
  const record = readFileSync(new URL('../../../../../packages/record/src/append-refusal.ts', import.meta.url), 'utf8');
  const sent = /export const APPEND_READ_AT = '([^']+)';/u.exec(record)?.[1];
  assert.equal(sent, APPEND_AT, "the record's appendReadRefusal sends another at than the one Home branches on");
  assert.equal(onAppendOnly({ code: 'LEVEL_REQUIRED', fix: 'x', at: sent ?? '' }), true);
  assert.equal(onAppendOnly({ code: 'LEVEL_REQUIRED', fix: 'x' }), false, 'a refusal with no at is not the adds-only one');
});
