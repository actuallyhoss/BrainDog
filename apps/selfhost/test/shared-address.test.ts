/**
 * A use case shared from one self-host and installed on another from an https address (`fetchUseCase`), over real
 * sockets. The web the second host reads from is a test double answering as a public host would, so nothing leaves the
 * machine; a private address and a name that resolves to one are refused by the real reader.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createClient } from '@braindog/client';
import { builtInFile } from '@braindog/seed/usecases/share';
import { linkExamples, type ExampleLink } from '@braindog/seed/usecases/links';

import { start } from '../src/server.ts';
import type { Pinned } from '../src/actions.ts';

type Client = ReturnType<typeof createClient>;
type Planned = { packs: { id: string; doc: unknown; approve: string[] }[] };
const value = <T>(r: { ok: boolean }): T => {
  assert.ok(r.ok, r.ok ? '' : JSON.stringify((r as { refusal?: unknown }).refusal));
  return (r as never as { value: T }).value;
};

const PUBLIC: Pinned = { address: '93.184.216.34', family: 4 };

async function host(shared?: Parameters<typeof start>[0]['shared']) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-shared-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: 0, ...(shared === undefined ? {} : { shared }) });
  const client = createClient({ base: `http://127.0.0.1:${(running.server.address() as { port: number }).port}` });
  return {
    client,
    async close() {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function installPlan(client: Client, plan: Planned) {
  for (const p of plan.packs) {
    const planned = value<{ diff: { planHash: string; approve: string[] } }>(await client.planPack({ doc: p.doc, source: { kind: 'local' } }));
    value(await client.installPack({ doc: p.doc, source: { kind: 'local' }, planHash: planned.diff.planHash, approve: planned.diff.approve }));
  }
}

const io = (client: Client) => ({
  rows: async (register: string) => {
    const read = await client.list({ register, limit: 200 });
    return read.ok ? (read.value.rows as { seq: number | null; fields: Record<string, unknown> }[]) : null;
  },
  link: async (register: string, seq: number, field: string, spoken: string | readonly string[]) =>
    (await client.update({ register, seq, patch: { [field]: spoken as never } })).ok,
});

test('A USE CASE SHARED ON ONE HOST INSTALLS ON ANOTHER FROM AN ADDRESS, IN THE ORDER IT WAS DRAWN, WITH ITS EXAMPLES LINKED', async (t) => {
  const a = await host();
  t.after(() => a.close());
  const student = value<Planned>(await a.client.planUseCase({ doc: builtInFile('student') }));
  await installPlan(a.client, student);
  /* A BUILT-IN CARRIES NO EXAMPLE ROW SINCE STUDENT 1.3.0: a student's record
     holds only what the student wrote, so installing the file links nothing yet. */
  assert.equal(await linkExamples(io(a.client), 'student'), 0);

  /* SO WHAT GOES OUT IS A REAL STUDENT'S OWN ROWS, drawn the ordinary way, one pointing at the other. */
  const course = value<{ seq: number }>(await a.client.create({ register: 'courses', fields: { name: 'Introduction to statistics' } }));
  const assignment = value<{ seq: number }>(
    await a.client.create({ register: 'assignments', fields: { what: 'Problem set 1: probability', course: `courses#${course.seq}` } }),
  );

  const order = ['/r/study_sessions', '/r/courses', '/r/assignments', '/p/studies'];
  const exported = value<{ file: string; doc: Record<string, unknown> }>(
    await a.client.exportUseCase({ nav: order, step: 'minor', examples: { courses: [course.seq], assignments: [assignment.seq] } }),
  );
  assert.deepEqual(exported.doc.nav, order);
  /* THE PICKED ROWS POINTED AT EACH OTHER ON A, so the file carries that as a link by title, not as the ref itself
     (a seed carries no ref: 42 §5.2). */
  assert.ok(Array.isArray(exported.doc.links) && (exported.doc.links as unknown[]).length > 0, 'the exported file has no link between its examples');
  const text = JSON.stringify(exported.doc, null, 2);

  /* THE WEB B READS FROM: one public-looking host with the file on it, and every address resolved to a public one. */
  const asked: string[] = [];
  const send = async (url: URL, init: RequestInit) => {
    asked.push(url.href);
    assert.equal(new Headers(init.headers).get('authorization'), null);
    return url.href === 'https://files.example.org/student.usecase.json' ? new Response(text, { status: 200 }) : new Response('no', { status: 404 });
  };
  const b = await host({ send, resolve: async (name) => (name === 'intranet.example.org' ? [{ address: '10.0.0.5', family: 4 }] : [PUBLIC]) });
  t.after(() => b.close());

  const read = value<{ text: string }>(await b.client.fetchUseCase({ url: 'https://files.example.org/student.usecase.json' }));
  assert.equal(read.text, text);
  const plan = value<Planned>(await b.client.planUseCase({ text: read.text, source: { kind: 'url', ref: 'https://files.example.org/student.usecase.json' } }));
  await installPlan(b.client, plan);
  /* 'student' NAMES NO LINK OF ITS OWN (it went with the example course), so B links by the file's OWN
     declared links, the way a use case shared under an id this build has never heard of still would. */
  const declaredLinks = (exported.doc.links ?? []) as readonly ExampleLink[];
  assert.ok((await linkExamples(io(b.client), 'student', { links: declaredLinks })) > 0, 'no example was linked on B');

  /* THE DECLARATIONS WENT IN IN THE ORDER A DREW THEM, so the lists come back that way. */
  const lists = value<{ registers: { id: string }[] }>(await b.client.boot()).registers.map((r) => r.id).filter((id) => ['courses', 'assignments', 'study_sessions'].includes(id));
  assert.deepEqual(lists, ['study_sessions', 'courses', 'assignments']);
  const bAssignment = value<{ rows: { fields: Record<string, unknown> }[] }>(await b.client.list({ register: 'assignments' })).rows[0];
  assert.match(String(bAssignment?.fields.course ?? ''), /./u, 'the example assignment has no course');

  /* A PRIVATE ADDRESS, AND A NAME THAT RESOLVES TO ONE, ARE REFUSED BY THE HOST, and nothing is sent to either. */
  const before = asked.length;
  for (const url of ['https://127.0.0.1:5992/student.usecase.json', 'https://intranet.example.org/student.usecase.json']) {
    const out = await b.client.fetchUseCase({ url });
    assert.equal(out.ok, false, url);
    assert.equal((out as { refusal: { code: string } }).refusal.code, 'PULL_ORIGIN_REFUSED');
  }
  assert.equal(asked.length, before);
});
