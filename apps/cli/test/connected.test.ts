/**
 * What Claude Code says it is connected to, read from `claude mcp list` (`src/clients/connected.ts`).
 *
 * THE SAMPLE IS A REAL RUN'S SHAPE (Claude Code 2.1.299 on a Mac, 2026-10-14) with every name and address made up:
 * the heading, the claude.ai connectors, a plugin's server, an HTTP and a stdio server from a config, and the statuses
 * Claude Code's documents name. No `claude` is run here: every runner is a stand-in.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { connectedOf, parseList, type ListRunner } from '../src/clients/connected.ts';

export const SAMPLE = [
  'Checking MCP server health…',
  '',
  'claude.ai Linear: https://mcp.linear.example/mcp - ✔ Connected',
  'claude.ai Google Drive: https://drive.mcp.example/mcp/v1 - ✔ Connected',
  'plugin:quill:quill: https://mcp.quill.example/mcp (HTTP) - ! Needs authentication',
  'plugin:fenwick:ledger-tools: npx -y fenwick-ledger-mcp - ✘ Failed to connect: HTTP 401 - bad credentials',
  'lantern: https://mcp.lantern.example (HTTP) - ✔ Connected',
  'kiln: node /fake/kiln/server.js  - ✔ Connected',
  'tally: npx -y tally-mcp - ⏸ Pending approval (run `claude` to approve)',
  '',
].join('\n');

const runner = (code: number | 'absent' | 'late', out = ''): { run: ListRunner; calls: { args: string[]; cwd: string; ms: number }[] } => {
  const calls: { args: string[]; cwd: string; ms: number }[] = [];
  return {
    calls,
    run: async (args, cwd, ms) => {
      calls.push({ args, cwd, ms });
      return { code, out };
    },
  };
};

test('the sample: each entry its name as a person reads it, and its address when one was printed', () => {
  const { entries, skipped } = parseList(SAMPLE);
  assert.equal(skipped, 0);
  assert.deepEqual(entries, [
    { name: 'Linear', listed: 'claude.ai Linear', address: 'https://mcp.linear.example/mcp' },
    { name: 'Google Drive', listed: 'claude.ai Google Drive', address: 'https://drive.mcp.example/mcp/v1' },
    { name: 'quill', listed: 'plugin:quill:quill', address: 'https://mcp.quill.example/mcp' },
    { name: 'fenwick ledger-tools', listed: 'plugin:fenwick:ledger-tools', address: null },
    { name: 'lantern', listed: 'lantern', address: 'https://mcp.lantern.example' },
    { name: 'kiln', listed: 'kiln', address: null },
    { name: 'tally', listed: 'tally', address: null },
  ]);
});

test('a line it cannot read is skipped and counted, and said in one line', async () => {
  const text = `${SAMPLE}Leading or trailing whitespace in: headers.Authorization\nnot a server at all\n`;
  assert.equal(parseList(text).skipped, 2);
  const got = await connectedOf(runner(0, text).run, '/fake/repo');
  assert.equal(got.entries.length, 7);
  assert.deepEqual(got.lines, ['2 lines of claude mcp list could not be read, so they were skipped.']);
});

test('the colours a terminal is sent are read past, and a name printed twice is one entry', () => {
  const { entries } = parseList('\u001b[32mclaude.ai Linear: https://mcp.linear.example/mcp - ✔ Connected\u001b[0m\nclaude.ai Linear: https://mcp.linear.example/mcp - ✔ Connected\n');
  assert.deepEqual(entries, [{ name: 'Linear', listed: 'claude.ai Linear', address: 'https://mcp.linear.example/mcp' }]);
});

test('it runs claude mcp list in the folder, within the limit, and reads what it printed', async () => {
  const r = runner(0, SAMPLE);
  const got = await connectedOf(r.run, '/fake/repo', 5_000);
  assert.deepEqual(r.calls, [{ args: ['mcp', 'list'], cwd: '/fake/repo', ms: 5_000 }]);
  assert.equal(got.entries.length, 7);
  assert.deepEqual(got.lines, []);
});

test('no servers at all is no entries and nothing said', async () => {
  const got = await connectedOf(runner(0, 'No MCP servers configured. Use `claude mcp add` to add a server.\n').run, '/fake/repo');
  assert.deepEqual(got, { entries: [], lines: [] });
});

test('Claude Code absent answers nothing, and one line why', async () => {
  const got = await connectedOf(runner('absent').run, '/fake/repo');
  assert.deepEqual(got, { entries: [], lines: ['Claude Code was not found, so what it is connected to was not read.'] });
});

test('the list failing or running past its limit answers nothing, and one line why, whatever it printed', async () => {
  const failed = await connectedOf(runner(1, SAMPLE).run, '/fake/repo');
  assert.deepEqual(failed, { entries: [], lines: ['claude mcp list ended with exit 1, so what Claude Code is connected to was not read.'] });
  const late = await connectedOf(runner('late', SAMPLE).run, '/fake/repo', 2_000);
  assert.deepEqual(late, { entries: [], lines: ['claude mcp list took longer than 2 seconds, so what Claude Code is connected to was not read.'] });
});
