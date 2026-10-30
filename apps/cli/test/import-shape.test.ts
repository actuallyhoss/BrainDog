/**
 * `braindog import` refuses a shape copy before it is checked or sent.
 *
 *   node --test apps/cli/test/import-shape.test.ts
 *
 * THE FILE IS A REAL SHAPE COPY, the kernel's `shapeBrainl` over a real export, and the door below counts every request,
 * so "nothing was sent" is a count and not a hope. Each refusal test fails by itself when the `isShape` line in
 * `importFile` is taken out: the file then goes on to the check, which says more than one sentence and never names it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SHAPE_MARK, openRecord, shapeBrainl } from '@braindog/kernel';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { importFile, type BrainfileIo } from '../src/brainfile.ts';
import type { Answer } from '../src/json.ts';

const NOW = Date.UTC(2026, 9, 9, 12);
const HOST = 'https://app.example.test/marrowgate';
const SENTENCE = /^[\w.-]+ is a shape copy, with every word and number in it scrambled, so it opens only on a scratch BrainDog and nothing was sent\.$/u;

/** A record's export, and the same export through the scrambler. */
async function copies(): Promise<{ real: string[]; shaped: string[] }> {
  const sql = openSqlite();
  const k = await openRecord(sql, fixedClock(NOW));
  const out = (await k.export()) as { ok: boolean; value?: string[] };
  assert.ok(out.ok, JSON.stringify(out));
  sql.close();
  return { real: out.value!, shaped: await shapeBrainl(out.value!, { now: NOW }) };
}

/** A folder with a login kept for the host, a door that counts what reaches it, and everything the command said. */
function rig(t: { after: (f: () => void) => void }) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-import-shape-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'hosts.json');
  const token = { value: 'rec_test.stub-login-never-sent', expires: '2027-01-01T00:00:00.000Z', label: 'test' };
  writeFileSync(file, JSON.stringify({ default: HOST, hosts: { [HOST]: { token } } }), { mode: 0o600 });
  const sent: string[] = [];
  const fetch = (async (input: string | URL | Request) => {
    sent.push(new URL(String(input)).pathname);
    return new Response(JSON.stringify({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'No.' } }), { status: 404 });
  }) as typeof globalThis.fetch;
  const out: string[] = [];
  const said: string[] = [];
  const answers: Answer[] = [];
  const io: BrainfileIo = {
    env: {},
    cwd: dir,
    file,
    out: (l) => void out.push(l),
    say: (l) => void said.push(l),
    answer: (a) => void answers.push(a),
    fetch,
    now: () => NOW,
    label: 'test machine',
  };
  const put = (name: string, lines: string[]) => writeFileSync(join(dir, name), `${lines.join('\n')}\n`);
  return { dir, io, out, said, answers, sent, put };
}

/** The refusal as a person and a machine see it: one sentence naming the file, nothing sent, nothing written. */
function refusedAsShape(r: ReturnType<typeof rig>, name: string, code: number) {
  assert.equal(code, 1);
  assert.deepEqual(r.sent, [], 'a shape copy reached the host');
  assert.equal(r.said.length, 1, `more than one sentence: ${r.said.join(' | ')}`);
  assert.match(r.said[0]!, SENTENCE);
  assert.ok(r.said[0]!.startsWith(`${name} `), 'the sentence does not name the file');
  assert.ok(!r.said[0]!.includes(r.dir), 'the sentence printed a folder');
  assert.doesNotMatch(r.said[0]!, /—|\brows?\b/u);
  assert.deepEqual(r.out, []);
  assert.equal(r.answers.at(-1)?.refusal?.code, 'IMPORT_SHAPE');
}

test('A SHAPE COPY IS REFUSED IN ONE SENTENCE, BEFORE THE CHECK, AND NOTHING IS SENT', async (t) => {
  const { shaped } = await copies();
  assert.equal(shaped[1], SHAPE_MARK);
  const r = rig(t);
  r.put('marrowgate.shape.brainl', shaped);
  refusedAsShape(r, 'marrowgate.shape.brainl', await importFile(['marrowgate.shape.brainl'], r.io));
});

test('RENAMED, IT IS STILL A SHAPE COPY: the mark is read, not the name', async (t) => {
  const { shaped } = await copies();
  const r = rig(t);
  r.put('latest.brainl', shaped);
  refusedAsShape(r, 'latest.brainl', await importFile(['latest.brainl', '--host', HOST], r.io));
});

test('A RECORD THAT ADOPTED A SHAPE COPY EXPORTS ONE, AND IT IS REFUSED THE SAME WAY', async (t) => {
  const { shaped } = await copies();
  const unmarked = shaped.filter((l) => l !== SHAPE_MARK);
  assert.ok(unmarked.includes('["shape","true"]'));
  const r = rig(t);
  r.put('kept.brainl', unmarked);
  refusedAsShape(r, 'kept.brainl', await importFile(['kept.brainl'], r.io));
});

test('THE CONTROL: a real export goes on to the check, and is never called a shape copy', async (t) => {
  const { real } = await copies();
  const r = rig(t);
  r.put('latest.brainl', real);
  await importFile(['latest.brainl'], r.io);
  assert.ok(r.said.length > 0 || r.sent.length > 0, 'a real export was stopped before the check');
  assert.ok(!r.said.some((l) => l.includes('shape copy')), `a real export was called a shape copy: ${r.said.join(' | ')}`);
  assert.notEqual(r.answers.at(-1)?.refusal?.code, 'IMPORT_SHAPE');
});
