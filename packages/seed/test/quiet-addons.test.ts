/**
 * BRAINDOG'S OWN ADD-ONS FROM THE CATALOGUE UPDATE THEMSELVES when the update loses nothing and reaches nothing new, and
 * otherwise are asked about once on Decide, where a yes installs them (`packs/quiet.ts`).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { Diff } from '@braindog/declare';
import { reachesNew, updateFirstParty, type QuietAddon, type QuietPort, type QuietQuestion } from '@braindog/seed/packs/quiet';

/** A plan that adds one page and changes nothing the person made. */
const quietDiff = (more: Partial<Diff> = {}): Diff =>
  ({
    waiting: [],
    pack: { id: 'notes-addon', version: '1.1.0', author: 'BrainDog', license: 'MIT', summary: '', checksum: '', source: { kind: 'local' } },
    installed_version: '1.0.0',
    direction: 'upgrade',
    requires: { format: { wanted: 1, has: 1, ok: true }, primitives: { wanted: 1, has: 1, ok: true }, packs: [] },
    dependents: [],
    adds: [{ id: 'page.notes-more', summary: 'A page' }],
    changes: [],
    retires: [],
    conflicts: [],
    kept: [],
    stays: [],
    extends: [],
    seeds: { count: 0, registers: [] },
    spawns: [],
    calls_out: [],
    scripts: [],
    approve: [],
    interrupts: [],
    touches: { rows_read: 0, rows_written: 0 },
    orphans: 0,
    retypes: [],
    newly_required: [],
    misreads: [],
    renames: [],
    unresolved: [],
    planHash: 'h',
    ...more,
  }) as unknown as Diff;

const addon: QuietAddon = { id: 'notes-addon', title: 'Notes add-on', from: '1.0.0', to: '1.1.0', doc: { manifest: { pack: 'notes-addon', version: '1.1.0' } } };

function portWith(diff: Diff, addons: QuietAddon[] = [addon], version = '1.0.0'): QuietPort & { installed: string[]; asked: number; questions: QuietQuestion[] } {
  const port = {
    installed: [] as string[],
    asked: 0,
    questions: [] as QuietQuestion[],
    held: () => [{ id: 'notes-addon', version, on: true }],
    document: () => null,
    plan: async () => ({ ok: true as const, value: diff }),
    install: async (doc: Record<string, unknown>) => {
      port.installed.push(String((doc.manifest as { pack: string }).pack));
      return { ok: true as const, value: null };
    },
    asking: () => false,
    propose: (q: QuietQuestion) => {
      port.asked += 1;
      port.questions.push(q);
      return { ok: true as const, value: { id: 's_1' } };
    },
    addons: () => addons,
  };
  return port;
}

test('AN UPDATE THAT LOSES NOTHING AND REACHES NOTHING NEW GOES IN ON ITS OWN, said by the add-on’s name', async () => {
  const port = portWith(quietDiff());
  const steps = await updateFirstParty(port);
  assert.deepEqual(port.installed, ['notes-addon']);
  assert.deepEqual(steps, [{ pack: 'notes-addon', title: 'Notes add-on', from: '1.0.0', to: '1.1.0', did: 'updated' }]);
});

const losing = () => [
  quietDiff({ approve: ['call.api.example.com'] }),
  quietDiff({ scripts: [{ script: 'tidy', title: 'Tidy', source: '', bytes: 0, changed: null }] }),
  quietDiff({ retires: [{ id: 'page.old', rows: 0 }] }),
];

test('ONE THAT REACHES A SERVICE OUTSIDE, RUNS A NEW SCRIPT OR TAKES SOMETHING AWAY IS ASKED ONCE ON DECIDE, with the catalogue’s document and version', async () => {
  for (const diff of losing()) {
    const port = { ...portWith(diff), remembers: () => true };
    const [step] = await updateFirstParty(port);
    assert.equal(port.installed.length, 0);
    assert.equal(step?.did, 'asked');
    const [q] = port.questions;
    assert.match(q?.question ?? '', /^Notes add-on has a newer version\. Updating it would .+\. Update Notes add-on\?$/u);
    assert.deepEqual(q?.body, { install: 'notes-addon', doc: addon.doc });
    assert.equal(q?.version, '1.1.0');
  }
});

test('A QUESTION ALREADY OPEN IS NOT ASKED AGAIN, and a port that keeps no no leaves it in Add-ons', async () => {
  for (const diff of losing()) {
    const open = { ...portWith(diff), remembers: () => true, asking: () => true };
    const [waiting] = await updateFirstParty(open);
    assert.equal(waiting?.did, 'waiting');
    assert.equal(open.questions.length, 0);
    const forgetful = portWith(diff);
    const [step] = await updateFirstParty(forgetful);
    assert.equal(forgetful.asked, 0);
    assert.equal(step?.did, 'refused');
    assert.match(step?.why ?? '', /waits for you in Plugins\.$/u);
  }
});

test('A SCRIPT IT ALREADY RUNS, CHANGED, IS NOTHING NEW TO REACH', () => {
  assert.deepEqual(reachesNew(quietDiff({ scripts: [{ script: 'tidy', title: 'Tidy', source: '', bytes: 0, changed: [] }] })), []);
});

test('NOTHING HAPPENS to an add-on the record does not hold at that version, or with no add-ons lent', async () => {
  const other = portWith(quietDiff(), [addon], '0.9.0');
  assert.deepEqual(await updateFirstParty(other), []);
  const none = portWith(quietDiff(), []);
  assert.deepEqual(await updateFirstParty(none), []);
  assert.equal(none.installed.length, 0);
});
