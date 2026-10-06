/**
 * A person's or an organisation's row as a person reads it: where they were met in plain words, never a commit's hash
 * or a run's number; the organisation they belong to by its name; the Self marker and the identities on the record's
 * own person; and a row merged into another never drawn, the kept one drawn in its place.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import './fixtures/fill.ts';
import { identitiesOf, identitySaid, personWords, seenIn } from './names.ts';
import { rowReader, type Fetch } from './row-live.ts';

const NOW = Date.UTC(2026, 9, 6, 12);

test('WHERE SOMEONE WAS MET IS SAID IN WORDS, newest first, one line a place, and never with a hash or a run number', () => {
  const lines = [
    '2026-08-27 · commit 8b1e4d0 in portage',
    '2026-09-02 · commit c47d19e in portage',
    '2026-09-28 · mail: Renewal quote',
    '2026-10-01 · mail from encore.example',
    '2026-10-03 · bank text',
    '2025-12-11 · import',
    '2026-09-30 · agent run S740',
    'no day in front, so not a meeting',
  ];
  assert.deepEqual(seenIn(lines, NOW), [
    'A bank text, 3 Oct',
    'A mail from Encore, 1 Oct',
    'An agent run, 30 Sep',
    'A mail about “Renewal quote”, 28 Sep',
    '2 commits in portage, last on 2 Sep',
    'An import, 11 Dec 2025',
  ]);
  for (const said of seenIn(lines, NOW)) assert.doesNotMatch(said, /8b1e4d0|c47d19e|S740|encore\.xyz|—/u, said);
});

test('A LINE IN NO SHAPE `meet` WRITES IS SAID AS WRITTEN, less any id or path in it', () => {
  assert.deepEqual(seenIn(['2026-10-02 · note 01J9Z3K4M5N6P7Q8R9S0T1V2W3 in /Users/x/notes.md'], NOW), ['Note, 2 Oct']);
  assert.deepEqual(seenIn(['2026-10-02 · a call with the studio'], NOW), ['A call with the studio, 2 Oct']);
  assert.deepEqual(seenIn([42, null], NOW), []);
});

test('AN IDENTITY IS AN ADDRESS OR A HANDLE BY ITS SERVICE, and a folder, a repository or a domain is never one', () => {
  assert.equal(identitySaid('email:sam@brain.dog'), 'sam@brain.dog');
  assert.equal(identitySaid('github:sam'), 'GitHub · sam');
  assert.equal(identitySaid('git:jokonkwo'), 'Git · jokonkwo');
  assert.equal(identitySaid('phone:+201000000000'), '+201000000000');
  assert.equal(identitySaid('folder:/Users/sam/Developer'), null);
  assert.equal(identitySaid('remote:github.com/sam/braindog'), null);
  assert.equal(identitySaid('domain:brain.dog'), null);
  assert.deepEqual(
    identitiesOf({ email: 'sam@brain.dog', keys: ['email:sam@brain.dog', 'github:sam', 'folder:/Users/sam'], handles: ['git:sam'], aliases: ['Sam Avery'] }),
    ['sam@brain.dog', 'GitHub · sam', 'Git · sam', 'Sam Avery'],
    'each once, and the folder left out',
  );
});

/* ── against the record ─────────────────────────────────────────────────── */

const BASE = 'http://record.test';
const ORG = '01JORG00000000000000000000';
const SELF = '01JSELF0000000000000000000';
const FOLD = '01JFOLD0000000000000000000';
const MID = '01JMID00000000000000000000';
const KEEP = '01JKEEP0000000000000000000';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A people list that declares the parts by its own field names, as People 3.0.0 does, and an organisations list. */
const DECLARED: Record<string, unknown> = {
  contacts: {
    id: 'contacts',
    name: 'Contacts',
    one: 'contact',
    title: 'name',
    meets: { name: 'name', email: 'email', met: 'seen', merged_into: 'folded_into', org: 'works_at', self: 'me', keys: 'keys', handles: 'handles' },
    fields: [
      { id: 'name', type: 'text' },
      { id: 'email', type: 'email' },
      { id: 'keys', type: 'list', of: 'text' },
      { id: 'handles', type: 'list', of: 'text' },
      { id: 'seen', type: 'list', of: 'text' },
      { id: 'works_at', type: 'ref', to: 'firms' },
      { id: 'me', type: 'bool' },
      { id: 'folded_into', type: 'ref', to: 'contacts' },
    ],
  },
  firms: { id: 'firms', name: 'Firms', one: 'firm', title: 'name', fields: [{ id: 'name', type: 'text' }] },
};

type Row = { id: string; seq: number; fields: Record<string, unknown>; deleted_at: string | null };
const row = (id: string, seq: number, fields: Record<string, unknown>, deleted = false): Row => ({ id, seq, fields, deleted_at: deleted ? '2026-10-01T09:00:00.000Z' : null });

const CONTACTS: Row[] = [
  row(SELF, 1, { name: 'Sam', email: 'sam@brain.dog', keys: ['email:sam@brain.dog', 'github:sam', 'folder:/Users/sam/Developer'], me: true, works_at: ORG, seen: ['2026-09-02 · commit c47d19e in portage'] }),
  /* ROHAN WAS MET TWICE AND FOLDED TWICE: number 2 into number 4, and number 4 into number 3, the one kept. */
  row(FOLD, 2, { name: 'rohanmehta', folded_into: MID }, true),
  row(KEEP, 3, { name: 'Rohan Mehta', works_at: ORG, seen: ['2026-09-01 · commit 3f2a91c in portage', '2026-09-05 · commit 9a8b7c6 in portage'] }),
  row(MID, 4, { name: 'S. Mehta', folded_into: KEEP }, true),
];

function host(): { io: Fetch; sent: string[] } {
  const sent: string[] = [];
  const io = (async (url: string | URL | Request) => {
    const at = new URL(String(url));
    const register = at.searchParams.get('register') ?? '';
    sent.push(`${at.pathname.slice(5)} ${register}`);
    if (at.pathname === '/api/schema') return json(200, { ok: true, value: DECLARED[register] ?? null });
    if (at.pathname === '/api/get') {
      const seq = Number(JSON.parse(at.searchParams.get('seq') ?? '0'));
      const r = CONTACTS.find((c) => c.seq === seq && c.deleted_at === null);
      return json(200, { ok: true, value: r ? { ...r, register, version: 1, created_at: '2026-09-01T09:00:00.000Z' } : null });
    }
    if (at.pathname === '/api/list' && register === 'firms')
      return json(200, { ok: true, value: { rows: [{ id: ORG, seq: 1, fields: { name: 'Brightloom' }, version: 1, created_at: '' }], cursor: null } });
    if (at.pathname === '/api/list' && register === 'contacts') {
      const where = at.searchParams.get('where');
      const deleted = at.searchParams.get('includeDeleted') === 'true';
      const leaf = where === null ? null : (JSON.parse(where) as { field: 'id' | 'seq'; is: string | number });
      const rows = CONTACTS.filter((c) => (deleted || c.deleted_at === null) && (leaf === null || c[leaf.field] === leaf.is));
      return json(200, { ok: true, value: { rows: rows.map((r) => ({ ...r, version: 1, created_at: '' })), cursor: null } });
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, sent };
}

test("THE RECORD'S OWN PERSON CARRIES THE SELF MARKER AND THEIR IDENTITIES, with their organisation by its name", async () => {
  const out = await rowReader(BASE, host().io).read('contacts', 1);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.entry?.seq, 1);
  assert.equal(out.folded, undefined, 'a row nobody merged is drawn as itself');
  assert.deepEqual(out.person, {
    seen: ['A commit in portage, 2 Sep'],
    org: { register: 'firms', seq: 1, name: 'Brightloom' },
    self: true,
    identities: ['sam@brain.dog', 'GitHub · sam'],
  });
  assert.equal(personWords.self, 'Self');
  assert.equal(personWords.identities, 'Your identities');
});

test('A ROW MERGED INTO ANOTHER IS NEVER DRAWN: the trail is followed to the row kept, which is drawn in its place', async () => {
  const { io, sent } = host();
  const out = await rowReader(BASE, io).read('contacts', 2);
  assert.equal(out.from, 'live');
  if (out.from !== 'live') return;
  assert.equal(out.entry?.seq, 3, 'number 2 went into 4, and 4 into 3');
  assert.equal(out.entry?.fields.name, 'Rohan Mehta');
  assert.equal(out.folded, 2, 'the number asked for, so the page moves its address to the kept one');
  assert.deepEqual(out.person?.seen, ['2 commits in portage, last on 5 Sep']);
  assert.equal(out.person?.self, false);
  assert.deepEqual(out.person?.identities, [], 'identities are listed on the record’s own person alone');
  assert.ok(sent.includes('get contacts'));
});

test('A ROW THAT IS NOT THERE AND WAS NEVER MERGED IS STILL NO ROW, and another list asks nothing more', async () => {
  const out = await rowReader(BASE, host().io).read('contacts', 99);
  assert.equal(out.from, 'live');
  if (out.from === 'live') assert.equal(out.entry, null);
  const firm = await rowReader(BASE, host().io).read('firms', 1);
  if (firm.from === 'live') assert.equal(firm.person, undefined, 'a list that keeps no people says nothing of one');
});

test('A MAIL ABOUT ONE SUBJECT TWICE IS COUNTED, a commit in a folder is said by its last part, and a hex-looking word stays', () => {
  assert.deepEqual(seenIn(['2026-09-28 · mail: Renewal quote', '2026-09-30 · mail: Renewal quote'], NOW), ['2 mails about “Renewal quote”, last on 30 Sep']);
  assert.deepEqual(seenIn(['2026-09-02 · commit c47d19e in /Users/x/Developer/portage'], NOW), ['A commit in portage, 2 Sep']);
  assert.deepEqual(seenIn(['2026-09-02 · a defaced sign'], NOW), ['A defaced sign, 2 Sep']);
});

test('A LIVE ROW WHOSE MERGE FIELD GOES NOWHERE IS STILL DRAWN AS ITSELF', async () => {
  const stale = row('01JSTALE000000000000000000', 5, { name: 'Ada', folded_into: '01JGONE0000000000000000000' });
  CONTACTS.push(stale);
  try {
    const out = await rowReader(BASE, host().io).read('contacts', 5);
    assert.equal(out.from, 'live');
    if (out.from !== 'live') return;
    assert.equal(out.entry?.seq, 5);
    assert.equal(out.folded, undefined);
  } finally {
    CONTACTS.pop();
  }
});
