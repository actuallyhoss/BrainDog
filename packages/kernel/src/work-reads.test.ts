import { describe, expect, it } from 'vitest';

import { commitAuthors } from './commit-authors.ts';
import { byMachine, commitSubjects, mayRefreshNext, nameScore, readNames } from './work-reads.ts';

const open = [
  { id: 't1', title: 'Wire the kerning pass for lowercase' },
  { id: 't2', title: 'Send the autumn invoices' },
  { id: 't3', title: 'Tidy' },
];

describe('what a session says it finished', () => {
  it('closes the one task a done sentence names word for word', () => {
    const r = readNames(['Wired the kerning pass for lowercase and pushed it.'], open, true);
    expect(r.sure.map((n) => n.task.id)).toEqual(['t1']);
    expect(r.weak).toEqual([]);
  });

  it('asks about a task only half named', () => {
    const r = readNames(['Finished the kerning pass for lowercase.'], open, true);
    expect(r.sure).toEqual([]);
    expect(r.weak.map((n) => n.task.id)).toEqual(['t1']);
  });

  it('closes nothing for a step left undone or a one-word title', () => {
    expect(readNames(['Still need to wire the kerning pass for lowercase.'], open, true)).toEqual({ sure: [], weak: [] });
    expect(readNames(['Tidy is done.'], open, true)).toEqual({ sure: [], weak: [] });
    expect(nameScore('Tidy', 'tidy')).toBe(0);
  });

  it('drops a sentence that names two tasks equally', () => {
    const two = [
      { id: 'a', title: 'Send autumn invoices' },
      { id: 'b', title: 'Send autumn invoices' },
    ];
    expect(readNames(['Finished the autumn invoices.'], two, true)).toEqual({ sure: [], weak: [] });
  });
});

describe('what a commit subject says', () => {
  it('reads hashes and subjects after the authors, newest first, at most five', () => {
    const hint = 'Ada <ada@x.example> || abc1234 Wire kerning pass for lowercase || nonsense || def5678 Fix header';
    expect(commitSubjects(hint)).toEqual([
      { hash: 'abc1234', subject: 'Wire kerning pass for lowercase' },
      { hash: 'def5678', subject: 'Fix header' },
    ]);
    expect(commitSubjects('Ada <ada@x.example>')).toEqual([]);
  });

  it('leaves the authors readable beside the commits', () => {
    expect(commitAuthors('Ada <ada@x.example> || abc1234 Fix, header')).toEqual([{ name: 'Ada', email: 'ada@x.example' }]);
  });

  it('does not close a task on a step toward it', () => {
    expect(readNames(['WIP wire kerning pass for lowercase'], open, false)).toEqual({ sure: [], weak: [] });
    expect(readNames(['Wire kerning pass for lowercase'], open, false).sure.map((n) => n.task.id)).toEqual(['t1']);
  });
});

describe('when a project next step follows the newest run', () => {
  it('follows after a machine wrote it, and leaves a hand edit alone', () => {
    expect(mayRefreshNext('Old step', 'S12', 'S')).toBe(true);
    expect(mayRefreshNext('Old step', 'mara', 'S')).toBe(false);
    expect(mayRefreshNext('Typed at creation', null, 'S')).toBe(false);
    expect(mayRefreshNext('', null, 'S')).toBe(true);
    expect(byMachine('rule:handled', 'S')).toBe(true);
  });
});
