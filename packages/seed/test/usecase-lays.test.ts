/**
 * What each use case lays on another pack's page or hands to another pack, held to its version.
 *
 * `usecase-versions.test.ts` HASHES THE DECLARATIONS, THE SETTINGS AND `extends`, and nothing else. The founder also
 * adds three blocks to People's page for an organisation (`adds`) and hands its organisations to People (`hands`), and
 * both reach a record that already holds the use case. Before this file, rewording the founder's "Send numbers here"
 * on that page with `version` left alone kept every test green, so a record on the version never saw the new words.
 *
 * A FILE OF ITS OWN AND NOT A KEY IN THE VERSIONS TEST, which another batch holds; folding `adds` and `hands` into that
 * fingerprint the way `extends` is folded in is the better end state, and when it is done this file can go.
 *
 * ONLY A USE CASE THAT LAYS SOMETHING HAS AN ENTRY. One that lays nothing is held to lay nothing, so the first `adds`
 * or `hands` any use case gains asks for an entry here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { NOW } from '../src/index.ts';
import { USE_CASES, useCaseDocument } from '../src/usecases/index.ts';
import { dayOf } from '../src/usecases/install.ts';

/** A fixed day, so nothing here reads the clock. */
const TODAY = dayOf(NOW);

type Doc = Record<string, unknown> & { adds?: unknown; hands?: unknown };
type Add = { page?: unknown; after?: unknown; block?: { heading?: unknown } };

/** `adds` and `hands`, each only when the use case has it, hashed. A block's every word is in it. */
const fingerprint = (d: Doc): string =>
  createHash('sha256')
    .update(JSON.stringify({ ...(d.adds === undefined ? {} : { adds: d.adds }), ...(d.hands === undefined ? {} : { hands: d.hands }) }))
    .digest('hex')
    .slice(0, 16);

/**
 * Each block added, as `adds <page> after <heading it follows>: <its heading>`, and each list handed on, as
 * `hands <list> to <pack>`, in the order the use case writes them. A block appearing or going is a version, where a
 * reworded one only moves the fingerprint.
 */
const inventory = (d: Doc): string[] => [
  ...((d.adds ?? []) as Add[]).map((a) => `adds ${String(a.page)} after ${String(a.after)}: ${String(a.block?.heading ?? '')}`),
  ...Object.entries((d.hands ?? {}) as Record<string, unknown>).map(([list, to]) => `hands ${list} to ${String(to)}`),
];

const lays = (d: Doc): boolean => d.adds !== undefined || d.hands !== undefined;

type Laid = {
  /** Every block added and every list handed on, as `inventory` writes them. */
  lays: readonly string[];
  /** Their fingerprint. Also the value at the end of the last `history` line, so the two cannot be moved apart quietly. */
  declares: string;
  /** One line per fingerprint this version has declared, oldest first, each ending `-> <value>`. A reset appends one. */
  history: readonly string[];
};

/**
 * WHAT EACH USE CASE'S VERSION LAYS, by `<use case>@<version>`. A version nobody has released may be reset with a line
 * saying which change moved it; one a record may hold may not, so raise the version and give it an entry.
 */
const LAID: Record<string, Laid> = {
  'founder@2.5.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'hands register.organisations to people',
    ],
    declares: '78d818356ded7d8a',
    history: [
      'Recorded at 2.5.0 when what a use case lays was first held to its version; Latest numbers shows a reading\'s Amount beside its Value -> 78d818356ded7d8a',
    ],
  },
};

/** What is wrong with one use case's document against `LAID`, as sentences. Empty when nothing is. */
function problems(id: string, doc: Doc, laid: Readonly<Record<string, Laid>> = LAID): string[] {
  const key = `${id}@${String(doc.version)}`;
  const entry = laid[key];
  if (!lays(doc)) return entry ? [`${key} has an entry here and lays nothing: take the entry out`] : [];
  if (!entry) return [`${key} lays ${inventory(doc).join('; ')} and has no entry here: raise its version or record this one`];
  const out: string[] = [];
  const now = fingerprint(doc);
  const last = /-> ([0-9a-f]{16})$/u.exec(entry.history.at(-1) ?? '')?.[1];
  if (last !== entry.declares) out.push(`${key}: its last history line says ${String(last)} and declares says ${entry.declares}`);
  if (inventory(doc).join('\n') !== entry.lays.join('\n'))
    out.push(`${key} lays ${inventory(doc).join('; ')} where its entry says ${entry.lays.join('; ')}: a block or list added or gone is a new version`);
  if (now !== entry.declares) out.push(`${key} lays ${now} where its entry says ${entry.declares}: what it lays moved and the version did not`);
  return out;
}

const docOf = (id: string): Doc | null => useCaseDocument(id, TODAY) as Doc | null;

test('every use case lays on other packs exactly what its version recorded', () => {
  for (const u of USE_CASES) {
    const doc = docOf(u.usecase);
    if (!doc) continue;
    assert.deepEqual(problems(u.usecase, doc), [], u.usecase);
  }
});

test('the founder lays blocks on People and hands a list on, so the guard is not vacuous', () => {
  const doc = docOf('founder');
  assert.ok(doc && Array.isArray(doc.adds) && doc.adds.length > 0, 'the founder adds blocks');
  assert.ok(doc && typeof doc.hands === 'object' && doc.hands !== null, 'the founder hands a list on');
});

test('one word of "Send numbers here" changed with the version left alone fails', () => {
  const doc = structuredClone(docOf('founder')) as Doc;
  const send = (doc.adds as Add[]).find((a) => a.block?.heading === 'Send numbers here');
  assert.ok(send?.block, 'the founder adds "Send numbers here"');
  send.block.heading = 'Send figures here';
  const found = problems('founder', doc);
  assert.ok(found.some((p) => p.includes('moved and the version did not')), found.join('\n'));
});

test('a block added or a list handed on with the version left alone fails, and so does a version with no entry', () => {
  const added = structuredClone(docOf('founder')) as Doc;
  (added.adds as Add[]).push({ page: 'page.relation', after: 'People', block: { heading: 'More' } });
  assert.ok(problems('founder', added).some((p) => p.includes('a new version')));
  const raised = { ...(structuredClone(docOf('founder')) as Doc), version: '9.0.0' };
  assert.ok(problems('founder', raised).some((p) => p.includes('has no entry here')));
});

test('a use case that starts to lay something asks for an entry, and an entry for one that lays nothing is refused', () => {
  const personal = structuredClone(docOf('personal')) as Doc;
  assert.deepEqual(problems('personal', personal), []);
  assert.ok(problems('personal', { ...personal, hands: { 'register.goals': 'work' } }).some((p) => p.includes('has no entry here')));
  const stale = { [`personal@${String(personal.version)}`]: { lays: [], declares: '0000000000000000', history: ['-> 0000000000000000'] } };
  assert.ok(problems('personal', personal, stale).some((p) => p.includes('lays nothing')));
});
