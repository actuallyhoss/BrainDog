/**
 * `braindog pack install --force` and `pack uninstall --force`, against a stand-in client.
 *
 * `--force` is his press at the terminal on an update that takes a list away while it holds items: the install is sent
 * with `retireWithRows`, which lifts `WOULD_ORPHAN` and nothing else, and says so in one line ("Forced: Services keeps
 * its 41 items, retired."). Without it nothing changes, and every other refusal prints as it always has.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FORCE_USAGE, forcedLine, forcedPack, takeForce, type PackClient } from '../src/install.ts';

type Refusal = { code: string; fix: string; at?: string };
type Sent = { doc: unknown; planHash: string; retireWithRows?: boolean };

const DIFF = {
  pack: { id: 'kiln-books', version: '1.1.0' },
  planHash: '7.abc',
  orphans: 41,
  removals: [{ retire: 'services', name: 'Services', rows: 41, stays: true, line: 'Retires Services. Your 41 items stay, and the list can be put back.' }],
};
const ORPHAN: Refusal = { code: 'WOULD_ORPHAN', fix: 'kiln-books upgrades away register.services, and there are 41 rows in it. Move them first.', at: 'register.services' };

/* A record that refuses `WOULD_ORPHAN` unless pressed, as `@braindog/declare` `install` does, or always refuses `other`. */
function stand(other?: Refusal, diff: unknown = DIFF): PackClient & { sent: Sent[]; gone: string[] } {
  const sent: Sent[] = [];
  const gone: string[] = [];
  return {
    sent,
    gone,
    planPack: async () => ({ ok: true, value: { diff } }),
    installPack: async (args) => {
      sent.push(args);
      if (other) return { ok: false, refusal: other };
      if (args.retireWithRows !== true) return { ok: false, refusal: ORPHAN };
      return { ok: true, value: { pack: 'kiln-books', version: '1.1.0', retired: 1, rows_kept: { services: 41 } } };
    },
    uninstallPack: async ({ id }) => (gone.push(id), { ok: true, value: { pack: id, declarations: 3, rows_kept: { services: 41, invoices: 0 } } }),
  };
}

const io = () => {
  const out: string[] = [];
  const said: string[] = [];
  const answers: unknown[] = [];
  return { out, said, answers, io: { out: (l: string) => out.push(l), say: (l: string) => said.push(l), answer: (a: unknown) => answers.push(a) } };
};

test('WITHOUT --force THE REFUSAL PRINTS AS TODAY, and the install says no press', async () => {
  const client = stand();
  const t = io();
  assert.equal(await forcedPack('install', { doc: { pack: 'kiln-books' } }, client, t.io), 1);
  assert.deepEqual(t.said, [`${ORPHAN.fix} (WOULD_ORPHAN)`]);
  assert.deepEqual(t.out, []);
  assert.equal('retireWithRows' in client.sent[0]!, false, 'an unforced install claimed his press');
  assert.deepEqual(t.answers, [{ refusal: ORPHAN }]);
});

test('--force LIFTS WOULD_ORPHAN and says so in one line', async () => {
  const client = stand();
  const t = io();
  assert.equal(await forcedPack('install', { doc: { pack: 'kiln-books' } }, client, t.io, true), 0);
  assert.deepEqual(client.sent, [{ doc: { pack: 'kiln-books' }, planHash: '7.abc', retireWithRows: true }]);
  assert.deepEqual(t.out, ['Forced: Services keeps its 41 items, retired.']);
  assert.deepEqual(t.said, []);
});

test('ANOTHER REFUSAL STANDS UNDER --force, printed as it always is', async () => {
  for (const other of [
    { code: 'ID_RENAMED', fix: 'register.services → register.jobs renames a spoken id. Ids are stable for ever: keep register.services and change its name instead.', at: 'register.jobs' },
    { code: 'PLAN_STALE', fix: 'This BrainDog has moved, or the pack has, since the plan you approved. Read the plan again.', at: 'planHash' },
    { code: 'REQUIRED_MISSING', fix: 'kiln-books calls other services. Approve the line its plan calls out, then install.', at: 'approve' },
  ]) {
    const t = io();
    assert.equal(await forcedPack('install', { doc: {} }, stand(other), t.io, true), 1);
    assert.deepEqual(t.said, [`${other.fix} (${other.code})`]);
    assert.deepEqual(t.out, [], `${other.code} was printed as forced`);
  }
  /* And a WOULD_ORPHAN that comes back pressed (a record not taught the word) is printed as today, never as forced. */
  const deaf: PackClient = { ...stand(), installPack: async () => ({ ok: false, refusal: ORPHAN }) };
  const t = io();
  assert.equal(await forcedPack('install', { doc: {} }, deaf, t.io, true), 1);
  assert.deepEqual(t.said, [`${ORPHAN.fix} (WOULD_ORPHAN)`]);
});

test('A PLAN THAT TAKES NOTHING AWAY installs with or without --force and says it plainly', async () => {
  const plain = { pack: { id: 'kiln-books', version: '1.1.0' }, planHash: '7.def', orphans: 0 };
  const client: PackClient = { ...stand(undefined, plain), installPack: async () => ({ ok: true, value: { retired: 0 } }) };
  for (const force of [false, true]) {
    const t = io();
    assert.equal(await forcedPack('install', { doc: {} }, client, t.io, force), 0);
    assert.deepEqual(t.out, ['Installed kiln-books 1.1.0.']);
  }
});

test('UNINSTALL KEEPS THE ITEMS EITHER WAY, and the line says how many stay, never a list id', async () => {
  for (const force of [false, true]) {
    const client = stand();
    const t = io();
    assert.equal(await forcedPack('uninstall', { id: 'kiln-books' }, client, t.io, force), 0);
    assert.deepEqual(client.gone, ['kiln-books']);
    assert.deepEqual(t.out, ['Removed kiln-books. Its 41 items stay, and installing it again puts its lists back.']);
  }
  const one: PackClient = { ...stand(), uninstallPack: async ({ id }) => ({ ok: true, value: { pack: id, rows_kept: { services: 1, invoices: 0 } } }) };
  const once = io();
  assert.equal(await forcedPack('uninstall', { id: 'kiln-books' }, one, once.io), 0);
  assert.deepEqual(once.out, ['Removed kiln-books. Its 1 item stays, and installing it again puts its lists back.']);
  const none: PackClient = { ...stand(), uninstallPack: async ({ id }) => ({ ok: true, value: { pack: id, rows_kept: { services: 0 } } }) };
  const empty = io();
  assert.equal(await forcedPack('uninstall', { id: 'kiln-books' }, none, empty.io), 0);
  assert.deepEqual(empty.out, ['Removed kiln-books.']);
  const refusing: PackClient = { ...stand(), uninstallPack: async () => ({ ok: false, refusal: { code: 'OUT_OF_BOUNDS', fix: 'kiln-books is not installed.', at: 'id' } }) };
  const t = io();
  assert.equal(await forcedPack('uninstall', { id: 'kiln-books' }, refusing, t.io, true), 1);
  assert.deepEqual(t.said, ['kiln-books is not installed. (OUT_OF_BOUNDS)']);
});

test('THE FLAG IS READ BEFORE --, the line names two lists, and the usage says what it lifts', () => {
  assert.deepEqual(takeForce(['kiln.pack.json', '--force']), { force: true, rest: ['kiln.pack.json'] });
  assert.deepEqual(takeForce(['kiln.pack.json', '--', '--force']), { force: false, rest: ['kiln.pack.json', '--', '--force'] });
  assert.equal(
    forcedLine([{ retire: 'services', name: 'Services', rows: 41 }, { retire: 'jobs', name: 'Jobs', rows: 1 }]),
    'Forced: Services keeps its 41 items and Jobs keeps its 1 item, retired.',
  );
  assert.match(FORCE_USAGE, /--force on addon install or addon uninstall/);
  assert.doesNotMatch(FORCE_USAGE, /\u2014/u);
});
