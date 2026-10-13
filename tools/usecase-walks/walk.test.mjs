/**
 * The kit's own test (`loop/scope/area-usecases-a.md`, USE-A01 job 3): a list that cannot be met turns the verdict
 * red, and a record left behind fails the run. The walk is the real one (`walk.mjs` `walk`), over doors and a browser
 * made here, so nothing is signed up and no page is opened: what is tested is that the kit cannot say green when it
 * should not.
 *
 * THE PERSON IS THE REAL FILE (`tools/people/free.json`), so a line added to her list that no kind of check reads is
 * red here before it is red on a host.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { age, plan, planFaults, ROUND } from './age.mjs';
import { failed, fresh, judge, linesOf, parse, STAGES, verdictOf, walk, WIDTHS } from './walk.mjs';

const dina = JSON.parse(readFileSync(new URL('../people/free.json', import.meta.url), 'utf8'));

/** The sentence a free owner reads today when they invite somebody: two sentences, and a door that is shut. */
const TODAY = 'Free is for one person, so nobody else can join this record. Move it to Cloud in Settings to invite colleagues.';
/** The sentence they should read where no plan is sold. */
const SHORT = 'Free is for one person, so nobody else can join this record.';

/** What each page says on a host where everything on Dina's list is true. */
const SCREENS = {
  '/': 'Today\nSix tasks this week, and two are late.',
  '/r/tasks': 'Tasks\nRenew the passport\nBook the dentist',
  '/people': 'People\nYou are the only person here.',
  '/settings/billing': 'Billing\nFree\nOne record, one person, 20 Slash credits and 1,000 runs a month.\nCloud, $12 a month, when you want more.',
  '/usage': 'Usage\n14 of 1,000 runs this month.',
  '/slash': 'Slash\n20 of 20 credits left this month.',
  '/settings/agents': 'Agents\nWalk, made today.',
};

const RAIL = [
  { name: 'Today', path: '/' },
  { name: 'Tasks', path: '/r/tasks' },
  { name: 'People', path: '/people' },
];

/** A browser that shows `screens`, and says `said` after the invite. Every page it is asked for is counted. */
function seerOf({ screens = SCREENS, said = [SHORT], rail = RAIL } = {}) {
  const seer = {
    opened: 0,
    closed: 0,
    taken: [],
    async open() {
      seer.opened++;
    },
    async rail() {
      return rail;
    },
    async see(page, width, stage) {
      seer.taken.push(`${stage} ${page.path} ${width}`);
      const text = screens[page.path];
      return { state: text === undefined ? null : 'ready', text: text ?? '', drawings: 0, errors: [], failed: [], raw: {}, image: null };
    },
    async act() {
      return { said, image: null };
    },
    async close() {
      seer.closed++;
    },
  };
  return seer;
}

/**
 * A host in a few lines: one record, made at sign-up and gone when it is deleted. `over` breaks one door: `signUp`,
 * `erase` and `left` answer what they are told to, so each failure the walk must name can be planted.
 */
function doorsOf(over = {}) {
  const host = { there: false, written: [], erased: 0 };
  const doors = {
    host,
    cookie: () => '__Host-bd_s=not-a-session',
    async signUp(person) {
      if (over.signUp) return over.signUp;
      host.there = true;
      return { ok: true, made: true, slug: person.slug, name: 'Dina' };
    },
    accept: async () => over.accept ?? { ok: true },
    key: async () => over.key ?? { ok: true },
    async age(stage) {
      const client = { create: async (e) => (host.written.push(e), { ok: true, value: {} }) };
      return age(client, plan(dina, stage, Date.parse('2026-10-13T09:00:00Z')));
    },
    async erase() {
      host.erased++;
      if (over.erase) return over.erase;
      host.there = false;
      return { ok: true };
    },
    left: async () => ('left' in over ? over.left : host.there),
  };
  return doors;
}

const walked = (person, { doors = doorsOf(), seer = seerOf(), out = null } = {}) => walk(person, { origin: 'https://walk.braindog.test', doors, seer, out, now: () => Date.parse('2026-10-13T09:00:00Z') });

/** Dina with one more line on her list. */
const withLine = (line) => ({ ...dina, walk: { ...dina.walk, expect: [...dina.walk.expect, line] } });

test('a host where everything on her list is true is green, and the record it made is gone', async () => {
  const doors = doorsOf();
  const seer = seerOf();
  const verdict = await walked(dina, { doors, seer });
  assert.deepEqual(verdict.lines.filter((l) => !l.pass), []);
  assert.deepEqual(verdict.steps.filter((s) => !s.ok), []);
  assert.equal(verdict.colour, 'green');
  assert.equal(failed(verdict), false);
  assert.deepEqual(verdict.record, { name: 'Dina', made: true, deleted: true });
  assert.equal(doors.host.there, false);
  assert.equal(seer.closed, 1);
});

test('every page of the rail and every page her file names is taken at 390 and 1440, three times', async () => {
  const seer = seerOf();
  const doors = doorsOf();
  await walked(dina, { doors, seer });
  const pages = RAIL.length + dina.walk.pages.length;
  assert.equal(seer.taken.length, pages * WIDTHS.length * STAGES.length);
  for (const stage of STAGES) for (const width of WIDTHS) assert.ok(seer.taken.includes(`${stage} /usage ${width}`), `${stage} at ${width}`);
  assert.equal(doors.host.written.length, plan(dina, 'week').length + plan(dina, 'quarter').length);
});

test('a line that cannot be met turns the verdict red, names the line, and quotes what the screen said in its place', async () => {
  const planted = { id: 'planted', says: 'Billing says 5,000 runs', kind: 'says', on: 'Billing', path: '/settings/billing', match: '\\b5,000 runs\\b' };
  const verdict = await walked(withLine(planted));
  assert.equal(verdict.colour, 'red');
  assert.equal(failed(verdict), true);
  const red = verdict.lines.filter((l) => !l.pass);
  assert.deepEqual(red.map((l) => l.id), ['planted']);
  assert.match(red[0].quote, /does not say it/u);
  assert.match(red[0].where, /^Billing at 390 on day 0$/u);
  assert.ok(linesOf(verdict).some((l) => l.startsWith('red. Billing says 5,000 runs')));
  /* The record is still deleted: a red list is no reason to leave one behind. */
  assert.equal(verdict.record.deleted, true);
});

test('a record left behind fails the run though every line is green', async () => {
  const doors = doorsOf({ erase: { ok: false, why: 'Only the owner can delete a record.' } });
  const verdict = await walked(dina, { doors });
  assert.deepEqual(verdict.lines.filter((l) => !l.pass), []);
  assert.equal(verdict.record.made, true);
  assert.equal(verdict.record.deleted, false);
  assert.match(verdict.record.left, /refused: Only the owner can delete a record\./u);
  assert.equal(verdict.colour, 'red');
  assert.equal(failed(verdict), true);
  assert.ok(linesOf(verdict).some((l) => /was left behind/u.test(l)));
});

test('a record the host says it deleted and still lists fails the run, and so does a host that will not say', async () => {
  const listed = await walked(dina, { doors: doorsOf({ left: true }) });
  assert.equal(failed(listed), true);
  assert.match(listed.record.left, /still listed/u);
  const silent = await walked(dina, { doors: doorsOf({ left: null }) });
  assert.equal(failed(silent), true);
  assert.match(silent.record.left, /would not say/u);
});

test('a sign-up that is refused is red on every line, and there is nothing to delete', async () => {
  const doors = doorsOf({ signUp: { ok: false, why: 'sign-up was refused: Sign-up is not open here yet.' } });
  const verdict = await walked(dina, { doors });
  assert.equal(verdict.colour, 'red');
  assert.equal(verdict.lines.every((l) => !l.pass), true);
  assert.equal(verdict.record.made, false);
  assert.equal(doors.host.erased, 0);
  assert.match(linesOf(verdict).join('\n'), /Sign up with no plan and no card: sign-up was refused/u);
});

test('a walk that stops halfway still deletes the record it made', async () => {
  const seer = seerOf();
  seer.rail = async () => {
    throw new Error('the browser closed');
  };
  const doors = doorsOf();
  const verdict = await walked(dina, { doors, seer });
  assert.equal(verdict.colour, 'red');
  assert.match(verdict.steps.find((s) => s.step === 'Finish the walk').saw, /the browser closed/u);
  assert.equal(doors.host.there, false);
  assert.equal(verdict.record.deleted, true);
});

test("today's invite refusal is red: it is two sentences and names a door that is shut", () => {
  const line = dina.walk.expect.find((l) => l.id === 'invite-refused');
  const now = judge(line, { pages: [], acts: [{ id: 'invite', name: 'People', said: [TODAY] }] });
  assert.equal(now.pass, false);
  assert.match(now.quote, /is 2 sentences, not 1/u);
  const door = judge({ ...line, sentences: undefined }, { pages: [], acts: [{ id: 'invite', name: 'People', said: [TODAY] }] });
  assert.equal(door.pass, false);
  assert.equal(judge(line, { pages: [], acts: [{ id: 'invite', name: 'People', said: [SHORT] }] }).pass, true);
  assert.equal(judge(line, { pages: [], acts: [{ id: 'invite', name: 'People', said: [], why: 'the page has no address field to type into' }] }).pass, false);
  assert.equal(judge(line, { pages: [], acts: [] }).pass, false);
});

test('Billing that says Cloud before Free is red, and so is a page that never settled', () => {
  const line = dina.walk.expect.find((l) => l.id === 'billing-free-first');
  const page = (text, state = 'ready') => ({ pages: [{ name: 'Billing', path: '/settings/billing', width: 390, stage: 'day 0', state, text, raw: {} }], acts: [] });
  assert.equal(judge(line, page('Billing\nFree\nCloud, when you want more.')).pass, true);
  const wrong = judge(line, page('Billing\nCloud, $12 a month\nFree'));
  assert.equal(wrong.pass, false);
  assert.match(wrong.quote, /"Cloud, \$12 a month" comes before "Free"/u);
  assert.match(judge(line, page('', null)).quote, /never settled/u);
  assert.match(judge(line, page('', 'refused')).quote, /refused/u);
  assert.match(judge(line, { pages: [], acts: [] }).quote, /never opened/u);
});

test('Usage that prints an error is red though it says the word runs', () => {
  const line = dina.walk.expect.find((l) => l.id === 'usage-draws');
  const page = (text) => ({ pages: [{ name: 'Usage', path: '/usage', width: 1440, stage: 'day 0', state: 'ready', text, raw: {} }], acts: [] });
  assert.equal(judge(line, page('Usage\n14 of 1,000 runs this month.')).pass, true);
  const broken = judge(line, page('Usage\nThe runs could not be read. Try again.'));
  assert.equal(broken.pass, false);
  assert.match(broken.quote, /could not be read/u);
});

test('a slot never filled, or a business she never said on a page of the rail, is red', () => {
  const line = dina.walk.expect.find((l) => l.id === 'nothing-raw');
  const page = (over) => ({ pages: [{ name: 'Today', path: '/', width: 390, stage: 'day 0', state: 'ready', text: 'Today', raw: {}, rail: true, ...over }], acts: [] });
  assert.equal(judge(line, page({})).pass, true);
  assert.equal(judge(line, page({ raw: { placeholders: { count: 1, e: ['{{revenue.monthly}}'] } } })).quote, '{{revenue.monthly}}');
  assert.match(judge(line, page({ text: 'Today\nSend your first invoice' })).quote, /first invoice/u);
  /* Settings may say the word of its own bill. */
  assert.equal(judge(line, page({ text: 'Billing\nNo invoices yet', rail: false })).pass, true);
});

test('a line of a kind the kit does not know is red, and every line of her real list is of a kind it knows', () => {
  assert.equal(judge({ id: 'x', says: 'Something new', kind: 'smells' }, { pages: [], acts: [] }).pass, false);
  for (const line of dina.walk.expect) assert.ok(['says', 'draws', 'opens', 'act', 'never'].includes(line.kind), line.id);
  assert.equal(verdictOf({ person: { ...dina, walk: { ...dina.walk, expect: [] } }, origin: 'x', seen: { pages: [], acts: [] }, steps: [], record: {} }).colour, 'red');
});

test('ageing writes fifty at a time, each entry with its own day, and stops at the first round the record refuses', async () => {
  assert.deepEqual(planFaults(dina, 'week'), []);
  assert.deepEqual(planFaults(dina, 'quarter'), []);
  assert.deepEqual(planFaults({ walk: {} }, 'week'), ['walk.week.lists names no list to write to']);
  const now = Date.parse('2026-10-13T09:00:00Z');
  const entries = plan(dina, 'quarter', now);
  assert.ok(entries.length > ROUND);
  assert.equal(entries[0].fields.by, '2026-07-15');
  assert.equal(new Set(entries.map((e) => e.op_id)).size, entries.length);
  assert.equal(new Set(entries.map((e) => e.fields.what)).size, entries.length);
  const rounds = [];
  let inFlight = 0;
  let most = 0;
  const client = {
    async create(e) {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      return e.op_id.endsWith('-55') ? { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This record is full for the month.' } } : { ok: true, value: {} };
    },
  };
  const done = await age(client, entries, { say: (s) => rounds.push(s.written) });
  assert.equal(most, ROUND);
  assert.deepEqual(rounds, [50, 61]);
  assert.equal(done.ok, false);
  assert.match(done.why, /61 of 62 entries were kept, then the record refused one: This record is full for the month\./u);
});

test('an entry the record asks about is written only when the person says yes, and is said as asked', async () => {
  const entries = plan(dina, 'week', Date.parse('2026-10-13T09:00:00Z'));
  /* The record asks about the first ten, as it does of an agent it has not yet seen kept. */
  let n = 0;
  const client = { create: async (e) => (n++ < 10 ? { ok: true, value: { asked: { id: `q${n}`, question: `Add ${e.fields.what} to Tasks?` } } } : { ok: true, value: { seq: n } }) };
  const alone = await age(client, entries);
  assert.equal(alone.ok, false);
  assert.match(alone.why, /^0 of 14 entries were kept, then the record asked "Add Renew the passport to Tasks\?" and it was not kept: nobody was there to answer$/u);
  n = 0;
  const answered = [];
  const yes = await age(client, entries, { decide: async (q) => (answered.push(q.id), { ok: true }) });
  assert.deepEqual(yes, { written: 14, asked: 10, ok: true });
  assert.equal(answered.length, 10);
  n = 0;
  const no = await age(client, entries, { decide: async () => ({ ok: false, why: 'Only the owner can answer.' }) });
  assert.equal(no.ok, false);
  assert.match(no.why, /Only the owner can answer\.$/u);
});

test('each run signs up with an address and a record name of its own, and the command refuses what it does not take', () => {
  const a = fresh(dina, 'walks+old@mail.braindog.test', 1_000_000);
  const b = fresh(dina, 'walks+old@mail.braindog.test', 1_000_001);
  assert.match(a.email, /^walks\+w[a-z0-9]+@mail\.braindog\.test$/u);
  assert.notEqual(a.email, b.email);
  assert.notEqual(a.slug, b.slug);
  assert.match(a.slug, /^dinas-tasks-[a-z0-9]+$/u);
  assert.deepEqual(parse(['free', '--base', 'https://h.test', '--address', 'a@b.test', '--link-file', '/tmp/l']), { person: 'free', base: 'https://h.test', address: 'a@b.test', 'link-file': '/tmp/l' });
  assert.throws(() => parse(['free', '--base', 'https://h.test']), /needs --address/u);
  assert.throws(() => parse(['free', '--keep']), /not --keep/u);
});

test('the verdict and the list for the reader are written beside the pictures, and hold no key', async () => {
  const out = mkdtempSync(join(tmpdir(), 'walk-test-'));
  try {
    await walked(dina, { out });
    const verdict = JSON.parse(readFileSync(join(out, 'verdict.json'), 'utf8'));
    assert.equal(verdict.colour, 'green');
    assert.equal(verdict.lines.length, dina.walk.expect.length);
    const reader = JSON.parse(readFileSync(join(out, 'reader.json'), 'utf8'));
    assert.deepEqual(reader.list, dina.walk.expect.map((l) => l.says));
    assert.doesNotMatch(readFileSync(join(out, 'verdict.json'), 'utf8'), /bd_s|bearer|not-a-session/u);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
