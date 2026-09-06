/**
 * The whole stack, over a socket.
 *
 * Every other test in this repo holds one package still and checks it. This one starts a server,
 * makes real HTTP requests, and reads a real file — because the thing that has never been checked
 * until now is whether the seven packages fit together, and the answer to that is not a unit test.
 */

import { test } from 'node:test';
import { connect } from 'node:net';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ROUTES } from '@braindog/host';
import { start } from '../src/server.ts';

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register' as const,
  body: {
    id: 'obligations',
    name: 'Obligations',
    title: 'what',
    state: 'state',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'amount', type: 'money', index: true },
      { id: 'state', type: 'enum', values: ['open', 'paid'], index: true },
    ],
  } as never,
};

type Answer = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string; allowed?: string[] } };

let port = 8900;

async function server(token?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const file = join(dir, 'record.sqlite');
  const at = port++;
  const running = await start({ file, port: at, ...(token === undefined ? {} : { token }) });
  assert.ok((await running.api.kernel.install([OBLIGATIONS])).ok);

  const call = async (path: string, body?: unknown): Promise<{ status: number; body: Answer }> => {
    const res = await fetch(`http://127.0.0.1:${at}/api/${path}`, {
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: (await res.json()) as Answer };
  };

  return {
    call,
    running,
    file,
    dir,
    port: at,
    /* `close` stops the server and leaves the FILE, because one test below is about the file
       outliving the process — a close that deleted it would make that test unwritable. */
    close: () => running.close(),
    clean() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('THE WHOLE STACK ANSWERS OVER A SOCKET', async () => {
  const s = await server();
  try {
    const boot = await s.call('boot');
    assert.equal(boot.status, 200);
    assert.deepEqual((boot.body.value as { registers: { id: string }[] }).registers.map((r) => r.id), ['obligations']);

    const made = await s.call('create', { register: 'obligations', fields: { what: 'Invoice 41', state: 'open', amount: { amount: 48_000, currency: 'GBP' } } });
    assert.equal(made.status, 200);
    assert.equal((made.body.value as { seq: number }).seq, 1);

    const read = await s.call('get?register=obligations&seq=1');
    assert.equal((read.body.value as { fields: { what: string } }).fields.what, 'Invoice 41');

    const listed = await s.call(`list?register=obligations&where=${encodeURIComponent(JSON.stringify({ field: 'state', is: 'open' }))}`);
    assert.equal((listed.body.value as { matched: number }).matched, 1);
  } finally {
    await s.close();
    s.clean();
  }
});

test('a record is a FILE, and it is still there when the process is not', async () => {
  // The whole promise of the self-host: your record is a file you have, not a service you rent.
  const s = await server();
  await s.call('create', { register: 'obligations', fields: { what: 'Invoice 41' } });
  await s.close();

  const again = await start({ file: s.file, port: s.port + 100 });
  try {
    const rows = await again.api.list({ register: 'obligations' }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    assert.ok(rows.ok);
    assert.equal(rows.value.rows[0]?.fields.what, 'Invoice 41');
    // And the number does not restart, because the counter travelled with the file.
    const next = await again.api.create({ register: 'obligations', fields: { what: 'Invoice 42' } }, { principal: { kind: 'person', id: 'p_self', level: 'owner' } });
    assert.ok(next.ok);
    assert.equal(next.value.seq, 2);
  } finally {
    await again.close();
    s.clean();
  }
});

test('EVERY ROUTE IN THE SHARED TABLE IS WIRED HERE TOO', async () => {
  // A route in one host and not the other is a product that behaves differently depending on where
  // a customer runs it, and nobody finds out until a record moves between them. The server refuses
  // to start rather than serve a partial surface — this asserts it answers all of them.
  const s = await server();
  try {
    for (const route of ROUTES) {
      const res = route.writes
        ? await s.call(route.name, { register: 'obligations', fields: { what: 'x' }, spoken: 'obligations#1', patch: {}, note: 'x' })
        : await s.call(`${route.name}?register=obligations&seq=1`);
      /* THE CODE, NOT THE STATUS. `page?slug=nonsense` is a legitimate 404 from a route that IS
         served, and asserting on the status could not tell that from a route that is not — which is
         the whole thing this test exists to catch. `ROUTE_UNKNOWN` is the one signal that means it. */
      assert.notEqual(res.body.refusal?.code, 'ROUTE_UNKNOWN', `${route.name} is in the table and not served`);
      assert.notEqual(res.status, 405, `${route.name} disagrees with the table about its method`);
    }
  } finally {
    await s.close();
    s.clean();
  }
});

test('A HANDLER THAT THROWS IS A 500 WITH A SENTENCE, not a request that never ends', async () => {
  /* This escaped `serveApi` and the caller never wrote a response at all: the socket stayed open,
     the request hung, and the server then never closed either — one bad argument taking the whole
     process with it. A crash is an answer here like everything else is. */
  const s = await server();
  try {
    const res = await s.call('metric');
    assert.equal(res.body.refusal?.code, 'REQUIRED_MISSING', 'an absent argument should be refused rather than crash');
    assert.equal(res.status, 422);

    const page = await s.call('page');
    assert.equal(page.body.refusal?.code, 'REQUIRED_MISSING');
  } finally {
    await s.close();
    s.clean();
  }
});

test('the new reads answer, and a page names the blocks it could not draw', async () => {
  const s = await server();
  try {
    const pages = await s.call('pages');
    assert.equal(pages.status, 200);
    assert.deepEqual(pages.body.value, [], 'this record declares no pages');

    const grants = await s.call('listGrants');
    assert.equal(grants.status, 200, 'the vault index is a read like any other');
    assert.deepEqual(grants.body.value, []);

    // 422 and not 404: a slug nobody declared is a value the caller can fix, and 30 §6 keeps 404 for
    // a route that does not exist rather than for a thing a route could not find.
    const missing = await s.call('page?slug=nonsense');
    assert.equal(missing.status, 422);
    assert.equal(missing.body.refusal?.code, 'PAGE_UNKNOWN');
  } finally {
    await s.close();
    s.clean();
  }
});

test('a refusal comes back over HTTP with its sentence and a status that means something', async () => {
  const s = await server();
  try {
    const bad = await s.call('create', { register: 'obligations', fields: { amount: { amount: 4.5, currency: 'GBP' } } });
    assert.equal(bad.status, 422);
    assert.match(bad.body.refusal?.fix ?? '', /minor units/);

    const gone = await s.call('schema?register=atlantis');
    assert.equal(gone.status, 422);
    assert.ok(gone.body.refusal?.allowed?.includes('obligations'));

    const nothing = await s.call('nonsense');
    assert.equal(nothing.status, 404);
    assert.equal(nothing.body.refusal?.code, 'ROUTE_UNKNOWN');
  } finally {
    await s.close();
    s.clean();
  }
});

test('with a token set, a request without it is refused before it reaches the record', async () => {
  const s = await server('sekret');
  try {
    const ok = await s.call('boot');
    assert.equal(ok.status, 200);

    /* 403 AND NOT 401, because the Worker answers 403 for the same condition and one record must not
       behave differently depending on where it runs — which is what the shared `httpStatus` exists
       to prevent, and this was the one place bypassing it. */
    const res = await fetch(`http://127.0.0.1:${s.port}/api/boot`);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as Answer).refusal?.code, 'FORBIDDEN');

    /* AND AN AGENT TOKEN IS THE SAME TABLE AND THE SAME CHECK THE WORKER USES. A deployment that
       recognised only one shared string is one where an agent cannot be given less than everything,
       which is the difference between a scope and a password. */
    assert.ok(
      s.running.api.kernel.createRecord({
        id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD',
        slug: 'the-studio',
        name: 'The Studio',
        tz: 'UTC',
        locale: 'en',
        owner: { id: 'p_1' },
      }).ok,
    );
    const minted = await s.running.api.createToken({ scope: 'read' }, { principal: { kind: 'person', id: 'p_1', level: 'owner' } });
    assert.ok(minted.ok, 'the token was not minted');
    const bearer = (minted as { value: { bearer: string } }).value.bearer;

    const asAgent = await fetch(`http://127.0.0.1:${s.port}/api/boot`, { headers: { authorization: `Bearer ${bearer}` } });
    assert.equal(asAgent.status, 200, 'an agent token was not recognised');

    // And a read token writes nothing, which is the whole reason to issue one.
    const wrote = await fetch(`http://127.0.0.1:${s.port}/api/create`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ register: 'obligations', fields: { what: 'x' } }),
    });
    assert.equal(wrote.status, 403);
  } finally {
    await s.close();
    s.clean();
  }
});

/* ── the alarm and the doorbell ──────────────────────────────────── */

const REMINDING = {
  id: 'register.renewals',
  kind: 'register' as const,
  body: {
    id: 'renewals',
    name: 'Renewals',
    title: 'what',
    fields: [
      { id: 'what', type: 'text', required: true },
      { id: 'on', type: 'day', remind: ['-7d'] },
    ],
  } as never,
};

const owner = { principal: { kind: 'person' as const, id: 'p_self', level: 'owner' as const } };
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

test('A WRITE THAT MAKES A REMINDER ARMS THE ALARM, without being asked to', async () => {
  // The invariant the whole subsystem rests on: the alarm is the earliest pending row or there is no
  // alarm. A record that has to be told to arm has one path that forgets, and that path is silent.
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const at = port++;
  const running = await start({ file: join(dir, 'record.sqlite'), port: at, pollMs: 0 });
  try {
    /* A RECORD WITH DECLARATIONS HAS THE WEEKLY ANALYSIS PENDING — 45 §5.9's own row, and what makes
       the observe loop run at all. So "nothing else to do" is a week out, and the reminder below has
       to beat it to become the alarm, which is the property this test is about. */
    assert.ok((await running.api.kernel.install([REMINDING])).ok);
    /* THE ROW IS ARMED BY THE INSTALL; THE ALARM IS ARMED BY THE TAIL. This calls the kernel
       directly, which holds no scheduler — the record API's own `setDeclaration` tails for exactly
       this reason. */
    assert.ok(
      running.sql.one("SELECT 1 FROM schedule WHERE kind = 'analyse' AND key = 'weekly'"),
      'the weekly analysis was never armed',
    );
    await running.api.kernel.tail(running.scheduler);
    const weekly = await running.scheduler.get();
    assert.ok(weekly !== null, 'the tail armed nothing');

    const res = await fetch(`http://127.0.0.1:${at}/api/create`, {
      method: 'POST',
      body: JSON.stringify({ register: 'renewals', fields: { what: 'brain.dog', on: day(30) } }),
    });
    assert.equal(res.status, 200);

    /* THE WRITE DERIVED A REMINDER, and the alarm is the EARLIEST pending row — which here is the
       weekly analysis, because it is seven days out and the reminder is twenty-three. Asserting the
       alarm equals the reminder would be asserting that the earliest row does not win. */
    const derived = running.sql.one<{ due_at: string }>("SELECT due_at FROM schedule WHERE kind = 'reminder'");
    assert.ok(derived, 'the write derived no reminder');
    assert.equal(derived.due_at.slice(0, 10), day(23), 'the reminder is derived for the wrong day');

    const armed = await running.scheduler.get();
    assert.ok(armed !== null, 'the write armed nothing');
    assert.equal(armed, Math.min(weekly, Date.parse(derived.due_at)), 'the alarm is not the earliest pending row');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('AND A RECORD REOPENED AFTER THE TIME CAME FIRES IT, rather than waiting for a request', async () => {
  // The failure this is about: a self-host switched off over a weekend, whose Monday reminders wait
  // until somebody happens to touch the record — and then arrive stamped Monday, three days late.
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const file = join(dir, 'record.sqlite');
  const first = await start({ file, port: port++, pollMs: 0 });
  try {
    assert.ok((await first.api.kernel.install([REMINDING])).ok);
    await first.api.create({ register: 'renewals', fields: { what: 'brain.dog', on: day(30) } }, owner);
    assert.ok((await first.scheduler.get()) !== null);
    /* The weekend, as one statement: the REMINDER's time came while nothing was running. Only that
       row — dragging the weekly analysis back too would make this a test about the analyser. */
    first.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'reminder'", new Date(Date.now() - 60_000).toISOString());
  } finally {
    await first.close();
  }

  const again = await start({ file, port: port++, pollMs: 0 });
  try {
    const armed = await again.scheduler.get();
    assert.ok(armed !== null, 'a reopened record armed nothing, so its schedule never restarts');
    assert.ok(armed <= Date.now(), 'the alarm was set to the future for a reminder already due');

    await again.drain();
    const notes = again.api.kernel.history(again.api.kernel.get('renewals#1')!.id).filter((e) => e.kind === 'note');
    assert.equal(notes.length, 1, 'the due reminder did not fire on reopen');
    /* AND THE ALARM MOVES TO THE NEXT THING rather than being cleared: a record always has the
       weekly analysis pending, so "nothing left" is a week out. */
    assert.ok((await again.scheduler.get()) !== null, 'the drained schedule armed nothing');
    assert.equal(again.sql.all("SELECT 1 FROM schedule WHERE kind = 'reminder' AND state = 'pending'").length, 0);
  } finally {
    await again.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('THE DOORBELL DELIVERS, AND A FAILED DELIVERY WALKS THE RECORD\'S LADDER AND NOT ITS OWN', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const sent: string[] = [];
  let fail = true;
  const running = await start({
    file: join(dir, 'record.sqlite'),
    port: port++,
    pollMs: 0,
    deliver: async (job) => {
      if (fail) throw new Error('smtp said 550');
      sent.push(job.kind);
    },
  });
  try {
    running.api.kernel.outbox('notify.email', { to: 'p_self', subject: 'Invoice 41' });
    await running.scheduler.wake();

    // The delivery failed, so nothing was sent and a retry is armed — in the record's schedule.
    assert.deepEqual(sent, []);
    assert.ok(running.api.kernel.pending().nextDueMs !== null, 'a failed delivery armed no retry');

    // The retry fires, the job goes back to `pending`, and this time it lands. Its two minutes are
    // wound forward here rather than waited out — a test that sleeps is slow and flaky in one move.
    fail = false;
    running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'retry'", new Date(Date.now() - 1_000).toISOString());
    await running.api.kernel.drain(running.scheduler);
    await running.scheduler.wake();
    assert.deepEqual(sent, ['notify.email'], 'the retried job was never delivered');
    assert.equal(running.api.kernel.pending().outboxPending, false, 'a delivered job is still queued');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('with no deliverer, jobs queue and wait — which is honest rather than lossy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-'));
  const running = await start({ file: join(dir, 'record.sqlite'), port: port++, pollMs: 0 });
  try {
    running.api.kernel.outbox('notify.email', {});
    await running.scheduler.wake();
    await running.poll();
    /* THE ROW IS KEPT AND THE BELL IS SILENT. A job with no deliverer waits — that is honest, and
       it is still there when one arrives — but ringing about it on every write afterwards is a
       queue message and a lease pass that claims nothing, for the life of the record. */
    assert.equal(running.api.kernel.pending().queued, true, 'a job vanished with nothing to deliver it');
    assert.equal(running.api.kernel.pending().outboxPending, false, 'the doorbell rang about work nobody can do');
  } finally {
    await running.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('NOTHING A REQUEST CAN DO ENDS THE PROCESS', async () => {
  /* `void answer(…)` discarded the promise and `answer` had no `catch`, so one throw was an
     unhandled rejection and Node exited. The first throw is BEFORE any authentication:
     `new Request(url, { body })` refuses a body on a GET, so a `GET /api/boot` carrying a
     Content-Length killed the server — and with a token set it binds every interface. */
  const s = await server();
  try {
    /* A RAW SOCKET, because `fetch` refuses to SEND a GET with a body — which is the same rule that
       made `new Request(url, { body })` throw inside the server. The bytes have to go over the wire
       for the server to meet them. */
    await new Promise<void>((done) => {
      const sock = connect(s.port, '127.0.0.1', () => {
        const CRLF = String.fromCharCode(13, 10);
        sock.write(['GET /api/boot HTTP/1.1', 'Host: localhost', 'Content-Length: 1', '', 'x'].join(CRLF));
      });
      sock.on('data', () => (sock.end(), done()));
      sock.on('error', () => done());
      setTimeout(() => (sock.destroy(), done()), 2000).unref?.();
    });
    assert.equal((await s.call('boot')).status, 200, 'the server died on a malformed request');
  } finally {
    await s.close();
    s.clean();
  }
});

test('and a shared secret with a dot in it is still a shared secret', async () => {
  /* `includes('.')` is how this tells an agent token from the one shared secret, and a secret like
     `s3cr3t.v2` took the agent branch, failed `verifyToken`, and refused — locking the owner out of
     their own machine with a 401 that explains nothing. */
  const s = await server('s3cr3t.v2');
  try {
    assert.equal((await s.call('boot')).status, 200, 'the owner was locked out by their own token');
  } finally {
    await s.close();
    s.clean();
  }
});
