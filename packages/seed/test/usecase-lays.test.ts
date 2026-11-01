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
      'adds page.portfolio after In play: ',
      'hands register.organisations to people',
    ],
    declares: '092fe0f5bb736b52',
    history: [
      'Recorded at 2.5.0 when what a use case lays was first held to its version; Latest numbers shows a reading\'s Amount beside its Value -> 78d818356ded7d8a',
      'Projects names the earning projects gone silent, a line with no heading of its own after In play (stands-50) -> 092fe0f5bb736b52',
    ],
  },
  /* 2.6.0, STILL UNRELEASED, LAYS ONE BLOCK MORE (estate-numbers-61, folded in by integrate 61): Server and provider
     numbers on Estate's Renewals. Its other changes are on its own Home (Today by name, Late, the week from today). */
  'founder@2.6.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
    ],
    declares: '587379d1d9fe0800',
    history: [
      '2.6.0 lays what 2.5.0 laid, word for word -> 092fe0f5bb736b52',
      'Folded into the unreleased 2.6.0: it lays Server and provider numbers on Renewals after Next ninety days -> b7473e7c534ee516',
      'Folded into the unreleased 2.6.0: Server and provider numbers reads no reading dated after today (`at before tomorrow` in its clauses); the list of what is laid is unchanged -> c448e3ee3c366703',
      'Inside the unreleased 2.6.0: it lays Where it was seen, a section naming panel: seen, after Notes on People\'s pages for an organisation and a person -> 587379d1d9fe0800',
    ],
  },
  /* 2.7.0, CUT BESIDE THE FROZEN 2.6.0 FOR `needs` (usecase-needs-102): it lays what 2.6.0 laid, word for word. */
  'founder@2.7.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
    ],
    declares: '587379d1d9fe0800',
    history: ['2.7.0 lays what 2.6.0 laid, word for word; it adds `needs` and nothing it lays moved -> 587379d1d9fe0800'],
  },
  /* 3.0.0, THE KPI PLAN OF 21 OCTOBER (K1-A): it lays what 2.7.0 laid and hands Numbers to Portfolio as well. */
  'founder@3.0.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.0.0 lays what 2.7.0 laid, word for word, and hands Numbers to Portfolio 1.19.0, which declares it under the same id -> 192a7f45d2533b26'],
  },
  /* 3.1.0, THINGS, NOT ROWS (24 October): it lays what 3.0.0 laid, word for word; only its project page's `for:` moved. */
  'founder@3.1.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.1.0 lays what 3.0.0 laid, word for word -> 192a7f45d2533b26'],
  },
  /* 3.2.0, PORTFOLIO 1.23.0's STAGES (the thinking scope of 24 October): it lays what 3.1.0 laid, word for word. */
  'founder@3.2.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ["3.2.0 lays what 3.1.0 laid, word for word: it holds Portfolio 1.23.0's stages on its project page -> 192a7f45d2533b26"],
  },
  /* 3.3.0, THE PROJECT'S SHAPE AS BLOCKS (the thinking scope of 24 October): it lays what 3.2.0 laid, word for word. */
  'founder@3.3.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ["3.3.0 lays what 3.2.0 laid, word for word: its project page declares the project's shape as two blocks -> 192a7f45d2533b26"],
  },
  'founder@3.4.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.4.0 lays what 3.3.0 laid, word for word: Last worked reads the runs too and the Dashboard says the age of its numbers (Z7, Z20) -> 192a7f45d2533b26'],
  },
  'founder@3.5.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.5.0 lays what 3.4.0 laid, word for word: the Dashboard draws two charts and lists the rest, and leaves out a retired organisation (Y16, Y2) -> 192a7f45d2533b26'],
  },
  'founder@3.6.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.6.0 lays what 3.5.0 laid, word for word: cut beside portfolio 1.27.0, whose Projects opens on a box to add one (X7) -> 192a7f45d2533b26'],
  },
  'founder@3.7.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.7.0 lays what 3.6.0 laid, word for word: its own project page changed, and nothing it lays on another pack -> 192a7f45d2533b26'],
  },
  /* 3.7.1, THE CARD'S SUMMARY IN ONE SHORT LINE: it lays what 3.7.0 laid, word for word. */
  'founder@3.7.1': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ["3.7.1 lays what 3.7.0 laid, word for word: only the card's summary changed -> 192a7f45d2533b26"],
  },
  /* 3.8.0, FOUNDER OVERVIEW AND THE DASHBOARD'S QUIET FEEDS: it lays what 3.7.1 laid, word for word. */
  'founder@3.8.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.8.0 lays what 3.7.1 laid, word for word: its own pages changed (Founder overview, the Dashboard\'s quiet feeds), nothing it lays on another pack -> 192a7f45d2533b26'],
  },
  'founder@3.8.1': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ["3.8.1 lays what 3.8.0 laid, word for word: only the project page's card label changed -> 192a7f45d2533b26"],
  },
  'founder@3.8.2': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ["3.8.2 lays what 3.8.1 laid, word for word: only the project page's services heading changed -> 192a7f45d2533b26"],
  },
  'founder@3.9.0': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.9.0 lays what 3.8.2 laid, word for word: only the Dashboard moved, its place on the rail and its first lines -> 192a7f45d2533b26'],
  },
  'founder@3.9.1': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.9.1 lays what 3.9.0 laid, word for word: only the Dashboard\'s place on the rail moved, after Agents -> 192a7f45d2533b26'],
  },
  'founder@3.9.2': {
    lays: [
      'adds page.relation after People: Numbers, 30 days',
      'adds page.relation after People: Latest numbers',
      'adds page.relation after People: Send numbers here',
      'adds page.portfolio after In play: ',
      'adds page.estate after Next ninety days: Server and provider numbers',
      'adds page.relation after Notes: Where it was seen',
      'adds page.someone after Notes: Where it was seen',
      'hands register.organisations to people',
      'hands register.datapoints to portfolio',
    ],
    declares: '192a7f45d2533b26',
    history: ['3.9.2 lays what 3.9.1 laid, word for word: only the Dashboard\'s feed lines changed -> 192a7f45d2533b26'],
  },
  /* PERSONAL LAYS FOR THE FIRST TIME AT 2.4.0 (budgets-set-73, integrate 73): the count of budgets set goes to Money,
     which declares it since money-core 3.17.0. 2.3.1, released, laid nothing and has no entry. */
  'personal@2.4.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.4.0 hands the count of budgets set, `metric.budgets-set`, to money-core, which declares it itself (budgets-set-73) -> 5719e519311f68f0'],
  },
  /* 2.5.0, UNRELEASED (personal-and-guide-99): its changes are on its own Home, the first things to press. */
  'personal@2.5.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.5.0 lays what 2.4.0 laid, word for word -> 5719e519311f68f0'],
  },
  /* 2.6.0, CUT BESIDE THE FROZEN 2.5.0 FOR `needs` (usecase-needs-102): it lays what 2.5.0 laid, word for word. */
  'personal@2.6.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.6.0 lays what 2.5.0 laid, word for word; it adds `needs` and nothing it lays moved -> 5719e519311f68f0'],
  },
  /* 2.6.1, THE CARD'S SUMMARY IN ONE SHORT LINE: it lays what 2.6.0 laid, word for word. */
  'personal@2.6.1': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ["2.6.1 lays what 2.6.0 laid, word for word: only the card's summary changed -> 5719e519311f68f0"],
  },
  /* 2.7.0, A DAYS-IN-A-ROW FIGURE OF ITS OWN: it lays what 2.6.1 laid, word for word. */
  'personal@2.7.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.7.0 lays what 2.6.1 laid, word for word: it adds its own `metric.log-streak` and nothing it lays moved -> 5719e519311f68f0'],
  },
  /* 2.8.0, THE STREAK FIGURE GONE AGAIN (audit 6g, AG12): it lays what 2.7.0 laid, word for word. */
  'personal@2.8.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.8.0 lays what 2.7.0 laid, word for word: it takes its own `metric.log-streak` away and nothing it lays moved -> 5719e519311f68f0'],
  },
  'personal@2.9.0': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.9.0 lays what 2.8.0 laid, word for word: only `page.goals` moved, its place on the rail and its add boxes -> 5719e519311f68f0'],
  },
  'personal@2.9.1': {
    lays: ['hands metric.budgets-set to money-core'],
    declares: '5719e519311f68f0',
    history: ['2.9.1 lays what 2.9.0 laid, word for word: only the names of the Log and Put by changed (AH21) -> 5719e519311f68f0'],
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
  /* STUDENT, SINCE PERSONAL 2.4.0 HANDS A FIGURE ON: the use case here must be one that lays nothing. */
  const student = structuredClone(docOf('student')) as Doc;
  assert.ok(!lays(student), 'Student lays something now, so this proves nothing: use a use case that lays nothing');
  assert.deepEqual(problems('student', student), []);
  assert.ok(problems('student', { ...student, hands: { 'register.courses': 'work' } }).some((p) => p.includes('has no entry here')));
  const stale = { [`student@${String(student.version)}`]: { lays: [], declares: '0000000000000000', history: ['-> 0000000000000000'] } };
  assert.ok(problems('student', student, stale).some((p) => p.includes('lays nothing')));
});
