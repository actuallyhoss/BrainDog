/**
 * AGT-B10 job 3, his "Hooks install shows changes first": `braindog setup` step 2 prints the lines it will add to Claude
 * Code's settings before any file changes, asks on a terminal, writes with `--yes` without asking, and off a terminal
 * with no `--yes` stops after the plan and says how to go on.
 *
 * MEASURED BEFORE THIS EXISTED: step 2 ran `install --apply` first and printed what it had done after, so the first a
 * person saw of a hook that runs in every session was the line saying it was in.
 *
 * NO NETWORK IS NEEDED BEFORE STEP 4: a login is held through `BRAINDOG_TOKEN`, `claude` is a stub, and the host is a
 * closed port on this machine, so a run that goes past step 3 stops at step 4 with its own sentence.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { HOOK_STATUS } from '../src/install.ts';
import { setup, type SetupIo } from '../src/setup.ts';

const scratch = mkdtempSync(join(tmpdir(), 'braindog-setup-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const HOST = 'http://127.0.0.1:9';
let n = 0;

function machine(ask?: SetupIo['ask']) {
  const home = join(scratch, `home${String(n++)}`);
  const profile = join(home, '.claude');
  mkdirSync(profile, { recursive: true });
  const out: string[] = [];
  const io: SetupIo = {
    env: { XDG_CONFIG_HOME: join(home, '.config'), CLAUDE_CONFIG_DIR: profile, BRAINDOG_TOKEN: 'rec_test-setup-never-printed', BRAINDOG_TIMEOUT_MS: '300' },
    cwd: home,
    home,
    out: (line) => out.push(line),
    say: (line) => out.push(`! ${line}`),
    headers: async () => ({}),
    cli: join(scratch, 'main.ts'),
    scripts: join(scratch, 'hooks'),
    claude: async () => 0,
    ask,
  };
  return { io, out, settings: join(profile, 'settings.json') };
}

test('the plan is printed, then asked about, before the settings file exists; a yes writes it', async () => {
  let seen: { lines: string[]; written: boolean } | null = null;
  const m = machine(async (question) => {
    assert.equal(question, 'Write these changes? [y/N] ');
    seen = { lines: [...m.out], written: existsSync(m.settings) };
    return true;
  });
  await setup([HOST], m.io);
  assert.ok(seen, 'setup never asked');
  const asked = seen as { lines: string[]; written: boolean };
  assert.equal(asked.written, false, 'the settings were written before the question');
  const plan = asked.lines.findIndex((l) => l.startsWith("2. Hooks: these changes to Claude Code's settings come next"));
  assert.ok(plan > 0, asked.lines.join('\n'));
  assert.ok(asked.lines.slice(plan).some((l) => l.includes('+ hooks.SessionStart:') && l.includes(HOOK_STATUS)), asked.lines.join('\n'));
  assert.ok(asked.lines.slice(plan).some((l) => l.includes('+ hooks.PostToolUse:')), asked.lines.join('\n'));

  const hooks = (JSON.parse(readFileSync(m.settings, 'utf8')) as { hooks: Record<string, unknown> }).hooks;
  assert.deepEqual(Object.keys(hooks), ['SessionStart', 'SessionEnd', 'PostToolUse']);
  assert.ok(m.out.includes("   Written: the BrainDog hooks and Agent Skill are in Claude Code's settings."), m.out.join('\n'));
  assert.ok(m.out.some((l) => l.startsWith('3. MCP server: braindog is registered')), m.out.join('\n'));
});

test('a no writes nothing and stops at step 2', async () => {
  const m = machine(async () => false);
  assert.equal(await setup([HOST], m.io), 1);
  assert.equal(existsSync(m.settings), false);
  assert.ok(m.out.at(-1)!.includes("Nothing was written to Claude Code's settings, so setup stopped there."), m.out.join('\n'));
  assert.ok(!m.out.some((l) => l.startsWith('3.')), m.out.join('\n'));
});

test('off a terminal with no --yes it stops after the plan and says how to go on', async () => {
  const m = machine(async () => null);
  assert.equal(await setup([HOST], m.io), 1);
  assert.equal(existsSync(m.settings), false);
  assert.ok(m.out.some((l) => l.includes('+ hooks.SessionEnd:')), 'the plan was not shown');
  assert.equal(m.out.at(-1), `   Nothing was written, because no one is at a terminal to say yes. Run braindog setup ${HOST} --yes to write them.`);
});

test('--yes writes without asking', async () => {
  const m = machine(async () => assert.fail('asked, with --yes given'));
  await setup([HOST, '--yes'], m.io);
  assert.ok(existsSync(m.settings));
  const plan = m.out.findIndex((l) => l.includes('+ hooks.SessionStart:'));
  const written = m.out.findIndex((l) => l.startsWith('   Written:'));
  assert.ok(plan >= 0 && written > plan, m.out.join('\n'));
});

test('--dry-run still only shows, and a second run with nothing to add asks nothing', async () => {
  const dry = machine(async () => assert.fail('a dry run asked'));
  /* A held login reads the record at step 4, and the closed port ends the run there: the code is that step's. */
  await setup([HOST, '--dry-run'], dry.io);
  assert.equal(existsSync(dry.settings), false);
  assert.ok(dry.out.some((l) => l.startsWith('2. Hooks: the BrainDog hooks and Agent Skill would be added')), dry.out.join('\n'));

  const m = machine(async () => true);
  await setup([HOST], m.io);
  const again = machine(async () => assert.fail('asked with nothing to write'));
  again.io.env = m.io.env;
  again.io.home = m.io.home;
  await setup([HOST], again.io);
  assert.ok(again.out.includes("2. Hooks: Claude Code's settings already run the BrainDog hooks and Agent Skill."), again.out.join('\n'));
  assert.ok(!again.out.join('\n').includes('rec_test-setup-never-printed'));
});
