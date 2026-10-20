import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { commitAuthors } from './commit-authors.ts';
import { byMachine, commitSubjects, mayRefreshNext, nameScore, readNames } from './run-reads.ts';

const open = [
  { id: 't1', title: 'Wire the kerning pass for lowercase' },
  { id: 't2', title: 'Send the autumn invoices' },
  { id: 't3', title: 'Tidy' },
];

describe('what a session says it finished', () => {
  it('closes the one task a done sentence names word for word', () => {
    const r = readNames(['Wired the kerning pass for lowercase and pushed it.'], open, true);
    assert.deepEqual(r.sure.map((n) => n.task.id), ['t1']);
    assert.deepEqual(r.weak, []);
  });

  it('asks about a task only half named', () => {
    const r = readNames(['Finished the kerning pass for lowercase.'], open, true);
    assert.deepEqual(r.sure, []);
    assert.deepEqual(r.weak.map((n) => n.task.id), ['t1']);
  });

  it('closes nothing for a step left undone or a one-word title', () => {
    assert.deepEqual(readNames(['Still need to wire the kerning pass for lowercase.'], open, true), { sure: [], weak: [] });
    assert.deepEqual(readNames(['Tidy is done.'], open, true), { sure: [], weak: [] });
    assert.equal(nameScore('Tidy', 'tidy'), 0);
  });

  it('drops a sentence that names two tasks equally', () => {
    const two = [
      { id: 'a', title: 'Send autumn invoices' },
      { id: 'b', title: 'Send autumn invoices' },
    ];
    assert.deepEqual(readNames(['Finished the autumn invoices.'], two, true), { sure: [], weak: [] });
  });
});

describe('what a commit subject says', () => {
  it('reads hashes and subjects after the authors, newest first, at most five', () => {
    const hint = 'Ada <ada@x.example> || abc1234 Wire kerning pass for lowercase || nonsense || def5678 Fix header';
    assert.deepEqual(commitSubjects(hint), [
      { hash: 'abc1234', subject: 'Wire kerning pass for lowercase' },
      { hash: 'def5678', subject: 'Fix header' },
    ]);
    assert.deepEqual(commitSubjects('Ada <ada@x.example>'), []);
  });

  it('leaves the authors readable beside the commits', () => {
    assert.deepEqual(commitAuthors('Ada <ada@x.example> || abc1234 Fix, header'), [{ name: 'Ada', email: 'ada@x.example' }]);
  });

  it('does not close a task on a step toward it', () => {
    assert.deepEqual(readNames(['WIP wire kerning pass for lowercase'], open, false), { sure: [], weak: [] });
    assert.deepEqual(readNames(['Wire kerning pass for lowercase'], open, false).sure.map((n) => n.task.id), ['t1']);
  });
});

describe('when a project next step follows the newest run', () => {
  it('follows after a machine wrote it, and leaves a hand edit alone', () => {
    assert.equal(mayRefreshNext('Old step', 'S12', 'S'), true);
    assert.equal(mayRefreshNext('Old step', 'mara', 'S'), false);
    assert.equal(mayRefreshNext('Typed at creation', null, 'S'), false);
    assert.equal(mayRefreshNext('', null, 'S'), true);
    assert.equal(byMachine('rule:handled', 'S'), true);
  });
});
