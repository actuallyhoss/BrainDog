/**
 * `scanTools` through `toolsSeen` (AGT-D02 job 4), against a stand-in client: one call for what this machine holds,
 * 50 a call, one line an answer, and the scan as before when the record has no such method.
 *
 * THE VALUES ARE OBVIOUSLY FAKE, made per run. The one place a value may go is the stand-in depositor; every call, line
 * and lock file is checked for it. Every folder is a temporary one, so this machine's own `~/.claude.json` is never read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Client, Context } from '@braindog/client';

import { MACHINES, PROJECTS } from '../../../fixtures/names.ts';
import { scanTools, type Depositor } from '../src/tools.ts';

const NOW = Date.parse('2026-10-14T09:00:00.000Z');
const fakeValue = (): string => ['fake-token-for-tests-only', randomBytes(16).toString('hex')].join('-');
/** Shaped like an issuer's key, so it is found by its shape and not its name. */
const keyShaped = (): string => ['sk', 'proj', `FakeTestsOnly${randomBytes(12).toString('hex')}`].join('-');

type After = { after: (fn: () => void | Promise<void>) => void };
type Sent = { name: string; args: Record<string, unknown> };
type Answer = { name: string; did: string; row?: string; question?: string; why?: string };
/** What the stand-in answers `toolsSeen`: answers for what was found, or a refusal code for a host without it. */
type Seen = ((found: Record<string, unknown>[]) => Answer[]) | 'ROUTE_UNKNOWN' | 'NOT_IN_THIS_BUILD';

/** A stand-in client: it keeps every call, answers `toolsSeen` as told, and holds the rows a test gives it. */
function standIn(seen: Seen) {
  const sent: Sent[] = [];
  const rows = new Map<number, { fields: Record<string, unknown>; version: number }>();
  const entry = (seq: number) => ({ register: 'tools', seq, version: rows.get(seq)!.version, fields: rows.get(seq)!.fields });
  const keep = (name: string, args: unknown) => void sent.push({ name, args: structuredClone(args) as Record<string, unknown> });
  const client = {
    call: async (name: string, args: Record<string, unknown> = {}) => {
      keep(name, args);
      if (name === 'toolsSeen') {
        if (typeof seen === 'string') return { ok: false, refusal: { code: seen, fix: 'There is no method called toolsSeen.' } };
        return { ok: true, value: { tools: seen(args.found as Record<string, unknown>[]) } };
      }
      if (name === 'propose') return { ok: true, value: { id: 'SG1' } };
      return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stand-in does not answer ${name}.` } };
    },
    get: async (register: string, seq: number) => {
      keep('get', { register, seq });
      return rows.has(seq) ? { ok: true, value: entry(seq) } : { ok: false, refusal: { code: 'REF_UNKNOWN', fix: 'There is no such row.' } };
    },
    create: async (args: { fields: Record<string, unknown> }) => {
      keep('create', args);
      const seq = rows.size + 1;
      rows.set(seq, { fields: args.fields, version: 1 });
      return { ok: true, value: entry(seq) };
    },
    update: async (args: { seq: number; patch: Record<string, unknown> }) => {
      keep('update', args);
      const r = rows.get(args.seq)!;
      Object.assign(r.fields, args.patch);
      r.version++;
      return { ok: true, value: entry(args.seq) };
    },
  } as unknown as Client;
  return { client, sent, rows, of: (name: string) => sent.filter((c) => c.name === name) };
}

/** A temporary home and repository, the stand-in, and a scan over them. */
function setup(t: After, o: { seen: Seen; project?: boolean }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-tools-seen-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  const top = join(dir, 'repo');
  for (const d of [home, top]) mkdirSync(d, { recursive: true });
  const host = standIn(o.seen);
  const context = {
    project: o.project ? { spoken: 'things#1', name: PROJECTS[0], mark: null, hue: null, how: 'folder' } : null,
    registers: [{ id: 'tools', name: 'Tools', rows: [], inherited: [], truncated: false }],
  } as unknown as Context;
  const deposits: string[] = [];
  const deposit: Depositor = async (_ask, given) => {
    deposits.push(given);
    return { credential: `credentials#${String(deposits.length + 3)}` };
  };
  const lines: string[] = [];
  const scan = async (s: { dryRun?: boolean } = {}) => {
    const said = await scanTools({ client: host.client, context, top, cwd: top, home, dryRun: s.dryRun === true, deposit, machine: MACHINES[0], now: () => NOW });
    lines.push(...said);
    return said;
  };
  const project = (servers: Record<string, unknown>) => writeFileSync(join(top, '.mcp.json'), JSON.stringify({ mcpServers: servers }));
  const global = (servers: Record<string, unknown>) => writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: servers }));
  const lockFile = join(home, '.braindog', 'tools-lock.json');
  return { ...host, home, top, lines, deposits, scan, project, global, lockFile };
}

const stdio = (name: string) => ({ command: 'npx', args: ['-y', `@example/${name}-mcp`] });
const seenAll = (found: Record<string, unknown>[]): Answer[] => found.map((f) => ({ name: String(f.name), did: 'seen', row: 'tools#1' }));

/* ── one call ──────────────────────────────────────────────────────────── */

test('ONE CALL FOR WHAT THIS MACHINE HOLDS: three servers are one toolsSeen call, and nothing is read, made or asked one by one', async (t) => {
  const h = setup(t, { seen: seenAll });
  h.global({ fenwick: stdio('fenwick'), lantern: { type: 'http', url: 'https://lantern.example/mcp' }, quill: stdio('quill') });
  assert.deepEqual(await h.scan(), [], 'a tool seen again says nothing');
  assert.equal(h.of('toolsSeen').length, 1);
  assert.deepEqual(h.sent.map((c) => c.name), ['toolsSeen'], 'no get, create, update or propose');
  const [call] = h.of('toolsSeen');
  assert.equal(call!.args.machine, MACHINES[0]);
  const found = call!.args.found as Record<string, unknown>[];
  assert.deepEqual(found.map((f) => f.name).sort(), ['fenwick', 'lantern', 'quill']);
  assert.deepEqual(
    found.find((f) => f.name === 'lantern'),
    { name: 'lantern', kind: 'mcp', scope: 'global', transport: 'http', endpoint: 'https://lantern.example/mcp', needs: [], source: '~/.claude.json' },
  );
  assert.deepEqual(found.find((f) => f.name === 'quill')?.args, ['-y', '@example/quill-mcp']);
});

test('FIFTY A CALL: sixty servers are two calls, of fifty and of ten, and every one is answered', async (t) => {
  const h = setup(t, { seen: (found) => found.map((f) => ({ name: String(f.name), did: 'added', row: 'tools#9' })) });
  h.global(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`tool-${String(i)}`, stdio(`tool-${String(i)}`)])));
  const said = await h.scan();
  assert.deepEqual(h.of('toolsSeen').map((c) => (c.args.found as unknown[]).length), [50, 10]);
  assert.equal(said.length, 60);
  assert.equal(said[0], 'tool-0 was recorded for use everywhere.');
});

/* ── one line an answer ────────────────────────────────────────────────── */

test('ONE LINE AN ANSWER, and a question waiting or a tool skipped is said once', async (t) => {
  const answers: Record<string, Omit<Answer, 'name'>> = {
    fenwick: { did: 'added', row: 'tools#4' },
    lantern: { did: 'seen', row: 'tools#2' },
    quill: { did: 'asked', row: 'tools#3', question: 'Change how quill starts?' },
    marlin: { did: 'waiting', row: 'tools#5' },
    tansy: { did: 'skipped', why: 'Its command names another folder' },
    heron: { did: 'asked', question: 'Add the heron tool from this Mac, for use everywhere?' },
  };
  const h = setup(t, { project: true, seen: (found) => found.map((f) => ({ name: String(f.name), ...answers[String(f.name)]! })) });
  h.project({ fenwick: stdio('fenwick'), lantern: stdio('lantern'), quill: stdio('quill'), marlin: stdio('marlin'), tansy: stdio('tansy') });
  h.global({ heron: stdio('heron') });
  assert.deepEqual((await h.scan()).sort(), [
    `fenwick was recorded in ${PROJECTS[0]}.`,
    'heron applies everywhere, so recording it was asked on Decide.',
    'marlin waits on a question already on Decide.',
    'quill runs something else now; the question is on Decide.',
    'tansy was not recorded: Its command names another folder.',
  ]);
  const found = h.of('toolsSeen')[0]!.args.found as Record<string, unknown>[];
  assert.equal(found.find((f) => f.name === 'heron')?.scope, 'global');
  assert.equal(found.find((f) => f.name === 'fenwick')?.scope, 'project');
  assert.deepEqual(h.of('propose'), [], 'the record asks, not the scan');

  /* The next start: the same answers are not said again, but for the add, which a record makes once. */
  assert.deepEqual(await h.scan(), [`fenwick was recorded in ${PROJECTS[0]}.`]);
  /* A question answered: seen now, and asked again later is said again. */
  answers.quill = { did: 'seen', row: 'tools#3' };
  assert.equal((await h.scan()).some((l) => l.startsWith('quill')), false);
  answers.quill = { did: 'asked', row: 'tools#3' };
  assert.ok((await h.scan()).includes('quill runs something else now; the question is on Decide.'));
  const lock = readFileSync(h.lockFile, 'utf8');
  for (const word of ['Decide', 'another folder']) assert.equal(lock.includes(word), false, 'the lock keeps a hash of what was said, not the words');
});

test('A RUN IN NO PROJECT sends no project server, and says so in one line', async (t) => {
  const h = setup(t, { seen: seenAll });
  h.project({ fenwick: stdio('fenwick'), quill: stdio('quill') });
  h.global({ lantern: stdio('lantern') });
  assert.deepEqual(await h.scan(), ['This folder is in no project in the record, so the 2 servers of its project config were not recorded.']);
  assert.deepEqual((h.of('toolsSeen')[0]!.args.found as Record<string, unknown>[]).map((f) => f.name), ['lantern']);
});

/* ── the old path ──────────────────────────────────────────────────────── */

for (const code of ['ROUTE_UNKNOWN', 'NOT_IN_THIS_BUILD'] as const)
  test(`A RECORD WITHOUT toolsSeen (${code}) IS SCANNED AS BEFORE: the tool is created, and the lines are the old ones`, async (t) => {
    const h = setup(t, { seen: code });
    h.global({ fenwick: stdio('fenwick') });
    assert.deepEqual(await h.scan(), ['Tool fenwick in ~/.claude.json was recorded.']);
    assert.deepEqual(h.sent.map((c) => c.name), ['toolsSeen', 'create']);
    assert.equal(h.of('create')[0]!.args.register, 'tools');
  });

test('A DRY RUN sends nothing to toolsSeen and says what it would record, as before', async (t) => {
  const h = setup(t, { seen: seenAll });
  h.global({ fenwick: stdio('fenwick') });
  assert.deepEqual(await h.scan({ dryRun: true }), ['Tool fenwick in ~/.claude.json would be recorded.']);
  assert.deepEqual(h.sent, []);
});

test('A DRY RUN OVER A LIST ONE CONTEXT CUTS reads the whole list, every state, and names only what the record lacks', async (t) => {
  const h = setup(t, { seen: seenAll });
  h.global({ fenwick: stdio('fenwick'), larch: stdio('larch'), renamed: stdio('quill') });
  const listed: Record<string, unknown>[] = [
    { name: 'fenwick', state: 'active', command: 'npx', args: ['-y', '@example/fenwick-mcp'] },
    { name: 'larch', state: 'retired', command: 'npx', args: ['-y', '@example/larch-mcp'] },
    { name: 'quill', state: 'active', transport: 'stdio', command: 'npx', args: ['-y', '@example/quill-mcp'] },
  ];
  const pages: unknown[] = [];
  (h.client as unknown as { list: (a: Record<string, unknown>) => Promise<unknown> }).list = async (a) => {
    pages.push(a);
    const at = a.cursor === undefined ? 0 : 2;
    return { ok: true, value: { rows: listed.slice(at, at + 2).map((fields) => ({ fields })), matched: 3, cursor: at === 0 ? 'next' : null } };
  };
  const cut = { registers: [{ id: 'tools', name: 'Tools', rows: [], inherited: [], truncated: true }], project: null } as unknown as Context;
  const said = await scanTools({ client: h.client, context: cut, top: h.top, cwd: h.top, home: h.home, dryRun: true, deposit: null, machine: MACHINES[0], now: () => NOW });
  assert.deepEqual(said, [], 'a tool the record holds, live, retired or under another name, was said as new');
  assert.equal(pages.length, 2, 'the whole list was not read');
  h.global({ fenwick: stdio('fenwick'), ash: stdio('ash') });
  const again = await scanTools({ client: h.client, context: cut, top: h.top, cwd: h.top, home: h.home, dryRun: true, deposit: null, machine: MACHINES[0], now: () => NOW });
  assert.deepEqual(again, ['Tool ash in ~/.claude.json would be recorded.']);
  assert.deepEqual(h.of('toolsSeen'), [], 'a dry run sent toolsSeen');
});

test('TWO SCANS IN A ROW MAKE NO ROW: what the record answered seen is not created on the second', async (t) => {
  const h = setup(t, { seen: seenAll });
  h.global({ fenwick: stdio('fenwick'), larch: stdio('larch') });
  await h.scan();
  await h.scan();
  assert.equal(h.of('create').length, 0, 'a scan created a row');
  assert.equal(h.of('toolsSeen').length, 2);
});

/* ── keys ──────────────────────────────────────────────────────────────── */

test('A KEY NEVER REACHES THE CALL: a key-shaped argument keeps its server out, an env key goes by name, and is deposited into the row the answer names', async (t) => {
  const value = fakeValue();
  const header = fakeValue();
  const shaped = keyShaped();
  const h = setup(t, { seen: (found) => found.map((f) => ({ name: String(f.name), did: 'added', row: f.name === 'fenwick' ? 'tools#1' : 'tools#2' })) });
  h.rows.set(1, { fields: { name: 'fenwick', needs: ['FENWICK_TOKEN', 'REGION'] }, version: 3 });
  h.rows.set(2, { fields: { name: 'lantern', needs: ['header:Authorization=credentials#2'] }, version: 1 });
  h.global({
    fenwick: { ...stdio('fenwick'), env: { FENWICK_TOKEN: value, REGION: 'north' } },
    lantern: { type: 'http', url: 'https://lantern.example/mcp', headers: { Authorization: `Bearer ${header}` } },
    quill: { command: 'npx', args: ['-y', '@example/quill-mcp', '--key', shaped] },
  });
  const said = await h.scan();
  assert.deepEqual(said.sort(), [
    'Tool quill in ~/.claude.json carries what looks like a key in its command, arguments or address, so it was not recorded. Move the key into its env and scan again.',
    'fenwick was recorded for use everywhere, with 1 key deposited.',
    'lantern was recorded for use everywhere.',
  ]);
  const found = h.of('toolsSeen')[0]!.args.found as Record<string, unknown>[];
  assert.deepEqual(found.map((f) => f.name).sort(), ['fenwick', 'lantern'], 'the server with a key in its arguments is not sent');
  assert.deepEqual(found.find((f) => f.name === 'fenwick')?.needs, ['FENWICK_TOKEN', 'REGION']);
  assert.deepEqual(found.find((f) => f.name === 'lantern')?.needs, ['header:Authorization']);
  /* The one key the row named by name only is deposited; the header the row already holds a key for is not again. */
  assert.deepEqual(h.deposits, [value]);
  assert.deepEqual(h.rows.get(1)!.fields.needs, ['FENWICK_TOKEN=credentials#4', 'REGION']);
  assert.equal(h.of('update').length, 1);
  const outside = [...h.lines, ...h.sent.map((c) => JSON.stringify(c.args)), readFileSync(h.lockFile, 'utf8')].join('\n');
  for (const v of [value, header, shaped]) assert.equal(outside.includes(v), false, 'a value reached a call, a line or the lock');
});

test('A GLOBAL SERVER FROM A RUN IN A PROJECT has no key deposited, as before: its keys go by name and the record asks', async (t) => {
  const value = fakeValue();
  const h = setup(t, { project: true, seen: (found) => found.map((f) => ({ name: String(f.name), did: 'asked' })) });
  h.global({ fenwick: { ...stdio('fenwick'), env: { FENWICK_TOKEN: value } } });
  assert.deepEqual(await h.scan(), ['fenwick applies everywhere, so recording it was asked on Decide.']);
  assert.deepEqual(h.deposits, []);
  assert.deepEqual((h.of('toolsSeen')[0]!.args.found as Record<string, unknown>[])[0]?.needs, ['FENWICK_TOKEN']);
  assert.equal(JSON.stringify(h.sent).includes(value), false);
});

test('NOTHING PRINTED HOLDS A PLANTED SECRET: a reason that looks like a key is said in fixed words', async (t) => {
  const shaped = keyShaped();
  const h = setup(t, { seen: (found) => found.map((f) => ({ name: String(f.name), did: 'skipped', why: `The record holds ${shaped} for it` })) });
  h.global({ fenwick: stdio('fenwick') });
  assert.deepEqual(await h.scan(), ['fenwick was not recorded: the record did not say why.']);
  assert.equal([...h.lines, readFileSync(h.lockFile, 'utf8')].join('\n').includes(shaped), false);
});

test('A RECORD THAT REFUSES THE CALL is one line, and the old path is not run behind it', async (t) => {
  const h = setup(t, { seen: () => [] });
  const refusing = h.client as unknown as { call: (name: string, args: Record<string, unknown>) => Promise<unknown> };
  refusing.call = async (name, args) => {
    h.sent.push({ name, args });
    return { ok: false, refusal: { code: 'FORBIDDEN', fix: 'This run may not write to Tools.' } };
  };
  h.global({ fenwick: stdio('fenwick') });
  assert.deepEqual(await h.scan(), ['The rest of the tools were not recorded: This run may not write to Tools.']);
  assert.deepEqual(h.sent.map((c) => c.name), ['toolsSeen']);
});
