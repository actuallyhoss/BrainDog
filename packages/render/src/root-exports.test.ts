/**
 * What a host can name from `braindog-render` itself. One change added five forms (a lead card, next and
 * reply, a path of steps, tiles with option visuals, a range against spend) and the thirty-fourth kind,
 * `inputs`, and every one of their plans was reachable only as `braindog-render/src/path.ts` and the
 * like: the Svelte drawers import by module path, so nothing inside the package noticed. A host is not
 * inside the package. The one that wires `inputs` has to hand `Block` an `OnInput`, and before this
 * it could not name that type from the root at all. `tsc` holds the type below; the runtime names are
 * held here, by identity, so a re-export of a copy would fail too.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as root from './index.ts';
import type { OnInput, PathMark, QueueShows, RangeBar } from './index.ts';
import * as inputs from './inputs.ts';
import * as path from './path.ts';
import * as progress from './progress.ts';
import * as queue from './queue.ts';
import * as cards from './cards.ts';
import * as format from './format.ts';
import * as cursor from './cursor.ts';
import * as timeline from './timeline.ts';
import * as spokenModule from './spoken.ts';

const exported = root as Record<string, unknown>;

test('EVERY NAME OF THE TWO NEW MODULES IS ON THE ROOT, the same object and not a copy', () => {
  /* `path.ts` and `inputs.ts` exist only for the new forms, so all of each is public: a name added to
     either later has to be exported here too, or this names it. */
  for (const [where, mod] of [['path.ts', path], ['inputs.ts', inputs]] as const) {
    for (const [name, value] of Object.entries(mod)) {
      assert.equal(exported[name], value, `${where} exports ${name} and the root does not`);
    }
  }
});

test('THE NEW NAMES IN THE OLDER MODULES ARE ON THE ROOT', () => {
  const wanted: [string, Record<string, unknown>][] = [
    ['rangePlan', progress],
    ['rangeSentence', progress],
    ['progressRangeSaid', progress],
    ['progressSpentSaid', progress],
    ['PROGRESS_NOT_SPENT', progress],
    ['PROGRESS_TOTAL', progress],
    ['showsOf', queue],
    ['fileSrc', queue],
    ['queueSuggested', queue],
    ['queueWays', queue],
    ['CARDS_NEXT', cards],
    /* A headline figure is how the app's page line says money (`£33,850`), so the host reads it from the root. */
    ['headlineFigure', format],
    ['headlineMoney', format],
    ['rowKey', cursor],
    ['rowAt', cursor],
    ['choiceOf', cursor],
    ['CHOICE_KEYS', cursor],
    ['timelineDays', timeline],
    ['spoken', spokenModule],
  ];
  for (const [name, mod] of wanted) {
    assert.ok(name in mod, `${name} is no longer exported by its module; this list is stale`);
    assert.equal(exported[name], mod[name], `the root does not export ${name}`);
  }
});

test('A HOST CAN TYPE ITS INPUT WRITER AGAINST THE ROOT, and the plans it reads', () => {
  const written: string[] = [];
  const oninput: OnInput = (_row, value) => void written.push(value);
  oninput({ cells: ['price', 'Price', 'money', ''], line: 1 } as unknown as Parameters<OnInput>[0], 'EGP 1,200.00');
  assert.deepEqual(written, ['EGP 1,200.00']);
  const mark: PathMark = 'next';
  const shows: QueueShows | null = root.showsOf('#aa3322');
  const bars: RangeBar[] = root.rangePlan([{ spent: '5', low: '4', high: '8' }]).bars;
  assert.equal(mark, 'next');
  assert.ok(shows === null || typeof shows === 'object');
  assert.equal(bars.length, 1);
});
