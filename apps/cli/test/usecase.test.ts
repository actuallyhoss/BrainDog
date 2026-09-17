/**
 * `braindog usecase export|check` against a stub record on node:http: export writes the record's own file and sends the
 * rows only when named; check reads a file the way a record will, and sends nothing.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { exportUseCase } from '@braindog/declare';

import { examplesOf, usecase } from '../src/usecase.ts';
import type { AgentIo } from '../src/skills.ts';

/* Obviously fake. */
const TOKEN = ['rec_01TESTTESTTESTTESTTESTTEST', 'stub-bearer-for-tests-only-44ab'].join('.');
const CONTEXT = { session: null, ambiguous: [], handoff: null, live: { same_repo: [], elsewhere: [] }, waiting: [], people: [], faded: 0, project: null, registers: [], next: '' };

const built = exportUseCase({
  usecase: 'study',
  version: '1.0.1',
  title: 'Study',
  summary: 'Courses.',
  author: 'Halden',
  license: 'MIT',
  audience: 'individual',
  tone: 'plain',
  modules: [],
  voice: { home: 'Desk' },
  labels: {},
  declarations: [{ register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }, { id: 'tags', type: 'list', of: 'text' }] }],
  examples: [],
});
assert.ok(built.ok);
const DOC = built.value;

/** A query value as the host reads it: JSON where it is JSON, and a line of text where it is not (`takes: 'text'`). */
const parsed = (v: string): unknown => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

async function setup(t: { after: (fn: () => void | Promise<void>) => void }) {
  const seen: { method: string; args: Record<string, unknown> }[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stub');
      const method = url.pathname.replace(/^\/api\//, '');
      const raw = Buffer.concat(chunks).toString('utf8');
      const args = (raw ? JSON.parse(raw) : Object.fromEntries([...url.searchParams].map(([k, v]) => [k, parsed(v)]))) as Record<string, unknown>;
      seen.push({ method, args });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (method === 'context') return res.end(JSON.stringify({ ok: true, value: CONTEXT }));
      if (method === 'exportUseCase') return res.end(JSON.stringify({ ok: true, value: { file: 'study-1.0.1.usecase.json', doc: DOC, bytes: 400 } }));
      res.end(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stub does not answer ${method}.` } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise<void>((done) => server.close(() => done())));
  const dir = mkdtempSync(join(tmpdir(), 'braindog-usecase-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: join(dir, 'config'), BRAINDOG_HOST: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, BRAINDOG_TOKEN: TOKEN };
  const out: string[] = [];
  const said: string[] = [];
  const io: AgentIo = { env, cwd: dir, home: dir, out: (l) => void out.push(l), say: (l) => void said.push(l), headers: async () => ({}) };
  return { dir, io, out, said, seen };
}

test('usecase export: writes the file the record answered, named for its id and version, and names no rows by default', async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['export'], h.io), 0, h.said.join('\n'));
  const file = join(h.dir, 'study-1.0.1.usecase.json');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), DOC);
  assert.deepEqual(h.seen.find((s) => s.method === 'exportUseCase')?.args, {});
  assert.match(h.out[0] ?? '', /with no rows of yours in it/);
});

test('usecase export: --example sends the rows named, and a malformed one is refused before anything is sent', async (t) => {
  const h = await setup(t);
  assert.equal(await usecase(['export', '--example', 'courses:1,2', '--out', 'mine.json'], h.io), 0);
  assert.deepEqual(h.seen.find((s) => s.method === 'exportUseCase')?.args, { examples: { courses: [1, 2] } });
  assert.equal(await usecase(['export', '--example', 'courses'], h.io), 1);
  assert.equal(await usecase(['export', '--minor', '--signal', 'homework', '--skill', '2', '--out', 'next.json'], h.io), 0);
  assert.deepEqual(h.seen.filter((s) => s.method === 'exportUseCase').at(-1)?.args, { step: 'minor', signals: ['homework'], skills: [2] });
  assert.equal(await usecase(['export', '--skill', 'two'], h.io), 1);
  assert.equal(await usecase(['export', '--minor', '--version', '2.0.0'], h.io), 1);
  assert.deepEqual(examplesOf(['a:1', 'a:2']), { ok: true, value: { a: [1, 2] } });
});

test('usecase check: reads a good file, and refuses a credential in one, sending nothing', async (t) => {
  const h = await setup(t);
  writeFileSync(join(h.dir, 'good.usecase.json'), JSON.stringify(DOC));
  assert.equal(await usecase(['check', 'good.usecase.json'], h.io), 0);
  assert.match(h.out[0] ?? '', /Study 1\.0\.1 reads as a use case: 1 lists, 0 pages/);
  writeFileSync(join(h.dir, 'bad.usecase.json'), JSON.stringify({ ...DOC, summary: `Uses ${['xoxb', '1234567890', 'abcdefghij'].join('-')}` }));
  assert.equal(await usecase(['check', 'bad.usecase.json'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /looks like a credential/);
  assert.match(h.said.at(-1) ?? '', /\(SECRET_IN_PACK\)$/);
  const pack = { pack: 'usecase-study', requires: { format: 1, primitives: 1, packs: {} }, declarations: [{ page: 'evil', title: 'Evil', blocks: [{ kind: 'iframe', span: 12 }] }] };
  writeFileSync(join(h.dir, 'frame.usecase.json'), JSON.stringify({ ...DOC, pack }));
  assert.equal(await usecase(['check', 'frame.usecase.json'], h.io), 1);
  assert.match(h.said.at(-1) ?? '', /^This setup uses a block this version of BrainDog does not have: iframe\..*\(KIND_UNKNOWN\)$/);
  assert.equal(h.seen.length, 0, 'check sent something');
  assert.equal(await usecase(['install', 'x'], h.io), 1);
});
