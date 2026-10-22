/**
 * BrainDog's hooks in Codex (`clients/codex-hooks.ts`): the turn end in a marked block of `config.toml`, BrainDog's block
 * in `AGENTS.md`, and the two written together, each whole or not at all.
 *
 * WHAT IS HELD: every byte of his own stays as it was; the block goes at the top of `config.toml`, where a key belongs
 * to no table, and reads back as exactly BrainDog's `notify`; a second run changes nothing; a later run moves the
 * program it names; a `notify` of his own is left, and BrainDog's block taken out beside it, since two would not load;
 * a file that is not TOML, and a block with a start and no end, are left and said; a copy is kept before a change.
 *
 * EVERY HOME HERE IS A TEMPORARY FOLDER with `CODEX_HOME` cleared, so the machine's own Codex is never read.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseToml } from '../src/clients/codex.ts';
import { AGENTS_END, AGENTS_START, applyCodexHooks, NOTIFY_END, NOTIFY_START, notifyArgv, planCodexHooks, withAgents, withNotify } from '../src/clients/codex-hooks.ts';
import { INBOX_ENTRY } from '../src/inbox-file.ts';

delete process.env.CODEX_HOME;
const scratch = mkdtempSync(join(tmpdir(), 'braindog-codex-hooks-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

const ARGV = ['node', '/opt/braindog/hooks/braindog-inbox.mjs', 'notify'];
const HIS = '# my settings\nmodel = "gpt-5"\n\n[mcp_servers.linear]\ncommand = "npx"\nargs = ["-y", "linear-mcp"]\n';

test('THE TURN END GOES AT THE TOP, READS BACK AS ITSELF, AND EVERY OTHER BYTE IS HIS', () => {
  const once = withNotify(HIS, ARGV);
  assert.equal(once.left, null);
  assert.ok(once.text!.startsWith(`${NOTIFY_START}\nnotify = ["node", "/opt/braindog/hooks/braindog-inbox.mjs", "notify"]\n${NOTIFY_END}\n\n`));
  assert.ok(once.text!.endsWith(HIS), 'his file follows the block as it was');
  const data = parseToml(once.text!).data;
  assert.deepEqual(data.notify, ARGV);
  assert.deepEqual(Object.keys(data.mcp_servers as object), ['linear'], 'the key is at the top, in no table');
  /* A SECOND RUN CHANGES NOTHING, and a moved command is replaced where the block stands. */
  assert.equal(withNotify(once.text, ARGV).text, once.text);
  const moved = withNotify(once.text, ['node', '/new/braindog-inbox.mjs', 'notify']).text!;
  assert.equal(moved.split(NOTIFY_START).length, 2, 'one block');
  assert.ok(moved.endsWith(HIS));
  assert.deepEqual(parseToml(moved).data.notify, ['node', '/new/braindog-inbox.mjs', 'notify']);
  /* NO FILE IS A FILE OF THE BLOCK ALONE, and Windows line endings are kept. */
  assert.deepEqual(parseToml(withNotify(null, ARGV).text!).data, { notify: ARGV });
  assert.ok(withNotify(HIS.replaceAll('\n', '\r\n'), ARGV).text!.includes(`${NOTIFY_START}\r\nnotify`));
});

test('A NOTIFY OF HIS OWN IS LEFT, and BrainDog’s block beside it is taken out, since two would not load', () => {
  const his = 'notify = ["terminal-notifier", "-title", "Codex"]\n';
  const left = withNotify(his, ARGV);
  assert.equal(left.text, his);
  assert.match(left.left ?? '', /runs a notify program of yours/u);
  const both = `${NOTIFY_START}\nnotify = ["node", "x", "notify"]\n${NOTIFY_END}\n\n${his}`;
  const cleared = withNotify(both, ARGV);
  assert.equal(cleared.text, his);
  assert.match(cleared.left ?? '', /BrainDog's block was taken out/u);
});

test('A FILE THAT IS NOT TOML, OR A BLOCK WITH NO END, IS LEFT AS IT IS AND SAID', () => {
  const bad = withNotify('model = \n', ARGV);
  assert.equal(bad.text, 'model = \n');
  assert.match(bad.left ?? '', /could not be read as TOML \(line 1/u);
  const open = withNotify(`${NOTIFY_START}\nnotify = []\n`, ARGV);
  assert.match(open.left ?? '', /start of BrainDog's block and no end/u);
});

test('BRAINDOG’S BLOCK IN AGENTS.md GOES AT THE END, is replaced where it stands, and leaves the rest his', () => {
  const his = '# House rules\n\nUse pnpm.\n';
  const once = withAgents(his).text!;
  assert.ok(once.startsWith(`${his}\n${AGENTS_START}\n## BrainDog\n`));
  assert.ok(once.trimEnd().endsWith(AGENTS_END));
  assert.match(once, /call `instructions`/u);
  assert.equal(withAgents(once).text, once);
  const changed = withAgents(`${once}More of mine.\n`, '## BrainDog\n\nNew words.').text!;
  assert.ok(changed.includes('New words.') && !changed.includes('call `instructions`'));
  assert.ok(changed.endsWith(`${AGENTS_END}\nMore of mine.\n`), 'what follows the block is his');
  assert.ok(withAgents(null).text!.startsWith(`${AGENTS_START}\n## BrainDog\n`), 'no file is a file of the block alone');
  assert.match(withAgents(`${AGENTS_START}\nhalf\n`).left ?? '', /no end/u);
});

test('PLANNED, THEN WRITTEN: both files at once, a copy of each kept first, and nothing to do the second time', () => {
  const home = join(scratch, `h${String(++n)}`);
  const scripts = join(home, 'braindog', 'hooks');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, INBOX_ENTRY), '');
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(join(home, '.codex', 'config.toml'), HIS);
  const plan = planCodexHooks({ home, env: {}, scripts });
  assert.deepEqual(plan.notify, notifyArgv(scripts));
  assert.equal(plan.notify[1], join(scripts, INBOX_ENTRY).replaceAll('\\', '/'), 'the bundle’s own entry when it is there');
  assert.deepEqual(plan.lines.map((l) => l.trim().slice(0, 2)), ['+ ', '+ ']);
  assert.equal(existsSync(join(home, '.codex', 'AGENTS.md')), false, 'planning wrote nothing');

  const done = applyCodexHooks(plan, new Set());
  assert.equal(done.written, true, done.lines.join('\n'));
  assert.deepEqual(parseToml(readFileSync(join(home, '.codex', 'config.toml'), 'utf8')).data.notify, plan.notify);
  assert.match(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8'), /## BrainDog/u);
  assert.ok(readdirSync(join(home, '.codex')).includes('config.toml.pre-braindog'), 'a copy of his file was kept');
  assert.deepEqual(planCodexHooks({ home, env: {}, scripts }).writes, []);
});

test('A FILE CHANGED SINCE THE PLAN READ IT IS NOT WRITTEN', () => {
  const home = join(scratch, `h${String(++n)}`);
  mkdirSync(join(home, '.codex'), { recursive: true });
  writeFileSync(join(home, '.codex', 'config.toml'), HIS);
  const plan = planCodexHooks({ home, env: {}, scripts: join(home, 'hooks') });
  writeFileSync(join(home, '.codex', 'config.toml'), `${HIS}# a line he added\n`);
  const done = applyCodexHooks(plan, new Set());
  assert.equal(done.written, false);
  assert.match(done.lines.join('\n'), /changed while it was being read/u);
  assert.ok(readFileSync(join(home, '.codex', 'config.toml'), 'utf8').endsWith('# a line he added\n'));
});
