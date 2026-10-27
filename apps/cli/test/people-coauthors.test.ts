/**
 * Agents meet commit co-authors and every author of a listed repository: a `Co-authored-by:` trailer is an
 * author too, counted for `MIN_COMMITS` like one, and once a day a folder is read whole since it joined its project,
 * not only for the session's own commits.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { authorsOf, peopleDayPath, wholeToday } from '../src/hooks.ts';
import { coAuthorOf, commitsBy, LOG_FORMAT, type Owner } from '../src/people.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-coauthors-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const OWN: Owner = { keys: new Set(['email:owner@example.com']), names: new Set(['owner']) };

function repository(name: string) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Owner');
  git('config', 'user.email', 'owner@example.com');
  git('config', 'commit.gpgsign', 'false');
  let n = 0;
  const commit = (author?: string, trailer?: string) =>
    git('commit', '--quiet', '--allow-empty', '-m', `change ${String(++n)}${trailer === undefined ? '' : `\n\n${trailer}`}`, ...(author === undefined ? [] : ['--author', author]));
  return { dir, git, commit };
}

test('A CO-AUTHOR IS READ FROM ITS TRAILER, with an address or not at all', () => {
  assert.deepEqual(coAuthorOf('Cy Twombly <cy@example.com>'), { name: 'Cy Twombly', email: 'cy@example.com' });
  assert.equal(coAuthorOf('Cy Twombly'), null);
});

test('A FIXTURE REPOSITORY WITH TWO OTHER AUTHORS MEETS TWO PEOPLE, each with where they were seen, and never the owner', async () => {
  const repo = repository('kiln');
  repo.commit('Bea Arthur <bea@example.com>');
  repo.commit(undefined, 'Co-authored-by: Cy Twombly <cy@example.com>');
  repo.commit('Bea Arthur <bea@example.com>');
  repo.commit(undefined, 'Co-authored-by: Cy Twombly <cy@example.com>\nCo-authored-by: Claude <noreply@anthropic.com>');
  repo.commit(undefined, 'Co-authored-by: Owner <owner@example.com>');
  const log = repo.git('log', LOG_FORMAT, 'HEAD');
  const counted = await commitsBy(repo.dir, '2000-01-01T00:00:00Z');
  const commits = new Map([...counted].map(([key, shas]) => [key, shas.size]));
  assert.equal(commits.get('email:cy@example.com'), 2, 'a co-author counts their commits');

  const met = authorsOf([{ log, repo: 'kiln' }], OWN, commits);
  assert.deepEqual(
    met.map((m) => [m.name, m.email]),
    [
      ['Cy Twombly', 'cy@example.com'],
      ['Bea Arthur', 'bea@example.com'],
    ],
  );
  assert.match(met[0]!.source, /^co-author of commit [0-9a-f]{7} in kiln$/u);
  assert.match(met[1]!.source, /^commit [0-9a-f]{7} in kiln$/u);
});

test('ONCE A DAY A FOLDER IS READ WHOLE, and the rest of the day for the session alone', () => {
  const env = { XDG_CONFIG_HOME: join(scratch, 'config') };
  const now = Date.parse('2026-10-24T09:00:00Z');
  const moved = [{ dir: '/w/kiln', repo: 'kiln', from: 'a'.repeat(40) }];
  assert.equal(wholeToday(env, moved, now)[0]!.whole, true, 'the first end of the day');
  assert.equal(wholeToday(env, moved, now + 3_600_000)[0]!.whole, undefined, 'later that day');
  assert.equal(wholeToday(env, moved, now + 86_400_000)[0]!.whole, true, 'the next day');
  assert.ok(peopleDayPath(env).endsWith('people-day.json'));
});
