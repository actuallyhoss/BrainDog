/**
 * Add-ons phase 4 on a real self-host: a script's `ctx.notify`, `ctx.ask` and `ctx.store`, each only for a header that
 * says it may, and each refusal path proved: an undeclared call stops the run with nothing applied, the twenty-first
 * notice of a day is a value the script reads, a model asked past `most_per_run` stops the run, a host with no model
 * answers a refusal, a store past 1 MB is refused, and a store removed with its add-on comes back on a reinstall.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCRIPT_NOTICES_PER_DAY } from '@braindog/kernel';

import type { Send } from '../src/actions.ts';
import { start } from '../src/server.ts';

const REC = 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAE';

const said = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value;
};

const script = (id: string, source: string, extra: Record<string, unknown> = {}) => ({
  id: `script.${id}`,
  kind: 'script',
  body: { script: id, runs: { every: '1d' }, egress: [], keys: [], reads: [], writes: ['tasks'], source, ...extra },
});

const TASKS = {
  id: 'register.tasks',
  kind: 'register',
  body: { id: 'tasks', name: 'Tasks', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] },
};

async function selfhost(scripts: Record<string, unknown>[], model?: (prompt: string) => string) {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-script-phase4-'));
  const send: Send = async () => new Response('{}');
  const asked: string[] = [];
  const running = await start({
    file: join(dir, 'record.brain'),
    directory: join(dir, 'directory.sqlite'),
    port: 0,
    host: '127.0.0.1',
    pollMs: 0,
    actions: { openKey: async () => null, send, resolve: async () => [] },
    ...(model === undefined
      ? {}
      : {
          slash: {
            url: 'http://127.0.0.1:11434/v1/chat/completions',
            model: 'llama3',
            send: async (_url: URL, init: RequestInit) => {
              const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
              const q = body.messages.map((m) => m.content).join('\n');
              asked.push(q);
              return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ answer: model(q) }) } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }), { status: 200 });
            },
          },
        }),
  });
  const person = running.directory.person$('ada@example.test', 'Ada');
  assert.ok(person.ok);
  said(await running.api.createRecord({ id: REC, slug: 'studio', name: 'Studio', tz: 'UTC', locale: 'en', owner: { id: person.value.id, email: 'ada@example.test', name: 'Ada' } }));
  const k = running.api.kernel;
  said(await k.install([TASKS, ...scripts] as never));
  return {
    running,
    k,
    asked,
    run: async () => {
      running.sql.exec("UPDATE schedule SET due_at = ? WHERE kind = 'script'", new Date(Date.now() - 1_000).toISOString());
      await running.poll();
    },
    line: (name: string) => {
      const rows = running.sql.all<{ note: string; to_v: string | null }>(
        "SELECT note, to_v FROM event WHERE target = ? AND kind = 'pull' AND to_v IS NOT NULL ORDER BY rowid DESC LIMIT 1",
        `declaration:script.${name}`,
      );
      const to = JSON.parse(rows[0]?.to_v ?? '{}') as { outcome?: string; log?: string };
      return { note: rows[0]?.note ?? 'no run event', outcome: to.outcome, log: to.log ?? '' };
    },
    notes: (name: string) =>
      running.sql.all<{ note: string }>("SELECT note FROM event WHERE kind = 'note' AND actor LIKE ? ORDER BY rowid", `script:${name}@%`).map((r) => r.note),
    tasks: () => running.sql.all<{ id: string }>("SELECT id FROM entry WHERE register = 'tasks' AND deleted_at IS NULL"),
    close: async () => {
      await running.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('NOTIFY: a script that says notifies: true tells the owner once, a note on the bell, and the run line counts it', async () => {
  const s = await selfhost([
    script('tell', "export default async (ctx) => { const r = await ctx.notify({ title: 'Film night', body: 'Dune is out' }); ctx.log(JSON.stringify(r)); ctx.write('tasks', { what: 'told' }); }", { notifies: true }),
  ]);
  try {
    await s.run();
    const line = s.line('tell');
    assert.equal(line.outcome, 'ok', `${line.note} ${line.log}`);
    assert.match(line.note, /It sent you one notice\./u);
    assert.deepEqual(s.notes('tell'), ['Film night: Dune is out']);
    assert.match(line.log, /"ok":true/u);
  } finally {
    await s.close();
  }
});

test('NOTIFY REFUSED: no notifies: true stops the run FORBIDDEN, its write and its notice both not applied', async () => {
  const s = await selfhost([script('sneak', "export default async (ctx) => { ctx.write('tasks', { what: 'x' }); await ctx.notify({ title: 'hi' }); }")]);
  try {
    await s.run();
    const line = s.line('sneak');
    assert.equal(line.outcome, 'refused');
    assert.match(line.log, /does not say notifies: true/u);
    assert.deepEqual(s.notes('sneak'), []);
    assert.deepEqual(s.tasks(), []);
  } finally {
    await s.close();
  }
});

test('NOTIFY CAP: twenty a day per add-on; the twenty-first is a refusal the script reads, and the twenty go', async () => {
  const s = await selfhost([
    script(
      'loud',
      `export default async (ctx) => { const out = []; for (let i = 0; i < ${SCRIPT_NOTICES_PER_DAY + 1}; i++) out.push(await ctx.notify({ title: 'n' + i })); const last = out[out.length - 1]; ctx.log(last.ok ? 'sent' : last.refusal.code + ' ' + last.refusal.fix); }`,
      { notifies: true },
    ),
  ]);
  try {
    await s.run();
    const line = s.line('loud');
    assert.equal(line.outcome, 'ok', `${line.note} ${line.log}`);
    assert.match(line.log, /^OUT_OF_BOUNDS An add-on sends at most 20 notices a day/u);
    assert.equal(s.notes('loud').length, SCRIPT_NOTICES_PER_DAY);
    /* AND THE NEXT RUN THE SAME DAY SENDS NONE. */
    await s.run();
    assert.equal(s.notes('loud').length, SCRIPT_NOTICES_PER_DAY);
  } finally {
    await s.close();
  }
});

test('NOTIFY SHAPE: a notice with no title is a refusal the script reads, not a note', async () => {
  const s = await selfhost([script('bare', "export default async (ctx) => { const r = await ctx.notify({ body: 'no title' }); ctx.log(r.refusal.code); }", { notifies: true })]);
  try {
    await s.run();
    assert.equal(s.line('bare').log.trim(), 'REQUIRED_MISSING');
    assert.deepEqual(s.notes('bare'), []);
  } finally {
    await s.close();
  }
});

test('STORE: kept across runs, read back in the same run, refused without store: true, and refused past 1 MB', async () => {
  const s = await selfhost([
    script('keep', "export default async (ctx) => { const n = (await ctx.store.get('n')) ?? 0; await ctx.store.set('n', n + 1); ctx.log('now ' + (await ctx.store.get('n'))); }", { store: true }),
    script('nostore', "export default async (ctx) => { await ctx.store.get('n'); }"),
    script('big', "export default async (ctx) => { const r = await ctx.store.set('big', 'x'.repeat(1100000)); ctx.log(r.ok ? 'kept' : r.refusal.code); }", { store: true }),
  ]);
  try {
    await s.run();
    assert.equal(s.line('keep').log.trim(), 'now 1');
    await s.run();
    assert.equal(s.line('keep').log.trim(), 'now 2');
    assert.deepEqual(s.k.scriptStore('script:keep'), { n: 2 });
    assert.equal(s.line('nostore').outcome, 'refused');
    assert.match(s.line('nostore').log, /does not say store: true/u);
    assert.equal(s.line('big').log.trim(), 'OUT_OF_BOUNDS');
    assert.deepEqual(s.k.scriptStore('script:big'), {});
  } finally {
    await s.close();
  }
});

test('STORE LIFECYCLE: removed with its data it goes into the bin, and a reinstall inside the window puts it back', async () => {
  const s = await selfhost([]);
  try {
    s.k.setPref('addon:watch-list', 'seen', ['dune']);
    assert.equal(s.k.binAddonStore('watch-list'), 1);
    assert.deepEqual(s.k.scriptStore('watch-list'), {});
    assert.equal(s.k.restoreAddonStore('watch-list'), 1);
    assert.deepEqual(s.k.scriptStore('watch-list'), { seen: ['dune'] });
  } finally {
    await s.close();
  }
});

test('ASK: one question to the model on the allowance; past most_per_run the run stops; undeclared it stops; no model is a refusal it reads', async () => {
  const s = await selfhost(
    [
      script('ask1', "export default async (ctx) => { const r = await ctx.ask('Name a film'); ctx.log(r.ok ? r.text : r.refusal.code); }", { model: { most_per_run: 1 } }),
      script('ask2', "export default async (ctx) => { ctx.write('tasks', { what: 'x' }); await ctx.ask('one'); await ctx.ask('two'); }", { model: { most_per_run: 1 } }),
      script('ask0', "export default async (ctx) => { await ctx.ask('hi'); }"),
    ],
    () => 'Dune',
  );
  try {
    await s.run();
    assert.equal(s.line('ask1').outcome, 'ok', s.line('ask1').log);
    assert.equal(s.line('ask1').log.trim(), 'Dune');
    assert.ok(s.asked.some((q) => q.includes('Name a film')), 'the question reached the model');
    assert.equal(s.line('ask2').outcome, 'refused');
    assert.match(s.line('ask2').log, /more than its 1 time a run/u);
    assert.deepEqual(s.tasks(), []);
    assert.equal(s.line('ask0').outcome, 'refused');
    assert.match(s.line('ask0').log, /does not say model/u);
  } finally {
    await s.close();
  }
  const bare = await selfhost([script('ask1', "export default async (ctx) => { const r = await ctx.ask('hi'); ctx.log(r.ok ? 'answered' : r.refusal.code); }", { model: { most_per_run: 1 } })]);
  try {
    await bare.run();
    assert.equal(bare.line('ask1').log.trim(), 'NOT_IN_THIS_BUILD');
  } finally {
    await bare.close();
  }
});

test('HEADER: model over the ceiling and notifies that is not true are refused at install', async () => {
  const s = await selfhost([]);
  try {
    const over = await s.k.install([script('m', 'export default () => {}', { model: { most_per_run: 99 } })] as never);
    assert.equal((over as { ok: boolean }).ok, false);
    const odd = await s.k.install([script('n', 'export default () => {}', { notifies: 'yes' })] as never);
    assert.equal((odd as { ok: boolean }).ok, false);
  } finally {
    await s.close();
  }
});

test('IN A TRY, NOTIFY AND ASK ARE DRY: checked, answered dry, nothing told, nothing asked, nothing kept', async () => {
  const s = await selfhost([], () => 'Dune');
  try {
    const owner = s.running.sql.one<{ person_id: string }>("SELECT person_id FROM member WHERE level = 'owner'")!.person_id;
    const body = {
      script: 'dry',
      runs: { every: '1d' },
      egress: [],
      keys: [],
      reads: [],
      writes: [],
      notifies: true,
      model: { most_per_run: 1 },
      store: true,
      source: "export default async (ctx) => { const n = await ctx.notify({ title: 'hi' }); const a = await ctx.ask('pick'); const k = await ctx.store.set('x', 1); ctx.log(JSON.stringify([n, a, k])); }",
    };
    const tried = said<{ log?: string; writes?: unknown[] }>(await s.running.api.scriptTry({ body } as never, { principal: { kind: 'person', id: owner, level: 'owner' } } as never));
    assert.match(String(tried.log), /\{"ok":true,"dry":true\},\{"ok":true,"dry":true,"text":""\},\{"ok":true\}/u);
    assert.deepEqual(s.notes('dry'), []);
    assert.equal(s.asked.length, 0, 'a try asked the model');
    assert.deepEqual(s.k.scriptStore('script:dry'), {});
  } finally {
    await s.close();
  }
});
