/**
 * Retiring a field from the row page files a question on Decide and never answers it.
 *
 * THE LINE THAT MATTERS IS `asked`. `field-write.ts` files an addition and then accepts it in the next call when the
 * person owns the record, and a retire written by copying it would do the same: the owner's press on a row's label
 * would land a removal with no question ever put to him. So every test here reads the methods the module called, in
 * order, and a `decide` among them is the failure.
 *
 * AGAINST A REAL KERNEL over `node:sqlite`, as `field-write.test.ts` runs it and for its reason: `@braindog/record` is
 * not a dependency of this app, so the envelope is written here and `propose`, `decide` and `install` are the kernel's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { openRecord, type Kernel } from '@braindog/kernel';

import './fixtures/fill.ts';
import { labelOf, REGISTERS } from './api.ts';
import { retirable, retireField, retireOf, retireWords } from './field-retire.ts';
import type { Fetch } from './row-live.ts';
import type { RegisterDecl } from './schema.ts';

const BASE = 'http://record.test';
const CLOCK = Date.UTC(2026, 8, 24, 9);

const BUNDLED: RegisterDecl = REGISTERS.things!;
const fresh = () => {
  REGISTERS.things = BUNDLED;
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function openSqlite(): Parameters<typeof openRecord>[0] {
  const db = new DatabaseSync(':memory:');
  let depth = 0;
  const sql = {
    exec: (text: string, ...params: unknown[]) => {
      if (params.length === 0) db.exec(text);
      else db.prepare(text).run(...(params as never[]));
    },
    all: (text: string, ...params: unknown[]) => db.prepare(text).all(...(params as never[])),
    one: (text: string, ...params: unknown[]) => db.prepare(text).get(...(params as never[])),
    transactionSync<T>(fn: () => T): T {
      if (depth > 0) return fn();
      db.exec('BEGIN');
      depth++;
      try {
        const value = fn();
        db.exec('COMMIT');
        return value;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
  return sql as unknown as Parameters<typeof openRecord>[0];
}

/** A record holding the build's own Projects, with one project that has a `next` written in it. */
async function projects(): Promise<Kernel> {
  const k = await openRecord(openSqlite(), { now: () => CLOCK });
  const { scopes: _scopes, pack: _pack, ...body } = JSON.parse(JSON.stringify(BUNDLED)) as Record<string, unknown>;
  const fields = (body.fields as { id: string }[]).filter((f) => f.id !== 'repos' && f.id !== 'folders');
  const put = await k.install([{ id: 'register.things', kind: 'register', body: { ...body, fields } } as never]);
  assert.ok(put.ok, JSON.stringify(put));
  assert.ok(k.create('things', { name: 'Kiln', lane: 'building', next: 'ship the kiln' }, { actor: 'p_1' }).ok);
  return k;
}

/** `propose` and `decide` over the real kernel, and every method asked, in order. */
function served(k: Kernel): { io: Fetch; asked: string[] } {
  const asked: string[] = [];
  const io = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = new URL(String(url)).pathname.slice('/api/'.length);
    asked.push(method);
    const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const answer = (out: { ok: boolean }) => json(out.ok ? 200 : 400, out);
    if (method === 'propose') return answer(k.propose(args as never, 'p_owner'));
    if (method === 'decide') {
      const out = k.decide(String(args.id), args as never, 'p_owner');
      if (!out.ok || !out.value.install) return answer(out);
      return answer(await k.install([out.value.install as never], out.value.expect, { actor: 'p_owner' }));
    }
    return json(404, { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no such method.' } });
  }) as Fetch;
  return { io, asked };
}

const nextOf = (k: Kernel) => (k.register('things') as unknown as { fields: { id: string; retired?: boolean }[] }).fields.find((f) => f.id === 'next');

test('THE BODY NAMES THE FIELD AND THE LIST, and nothing that could add or take away anything else', () => {
  assert.deepEqual(retireOf('things', ['next']), {
    declaration_id: 'register.things',
    to: { retire: { register: 'things', fields: ['next'] } },
  });
});

test('THE OWNER RETIRING A FIELD FILES IT AND NEVER SENDS decide: the list is unchanged until Needs you answers', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  const out = await retireField(BASE, 'things', 'next', io);
  assert.equal(out.from, 'filed', JSON.stringify(out));
  assert.deepEqual(asked, ['propose'], 'the app answered its own retire on the owner\'s behalf');
  assert.equal(out.from === 'filed' ? out.said : '', retireWords.filed(labelOf(BUNDLED.fields.find((f) => f.id === 'next')!)));
  assert.equal(nextOf(k)?.retired, undefined, 'the field was retired with no press in Needs you');

  /* AND THE QUESTION IT LEFT IS ONE DECIDE CAN ANSWER: accepted there, the field is retired and the row keeps its value. */
  const id = out.from === 'filed' ? out.id : '';
  const pressed = k.decide(id, { decide: { option: 'accept', reason: 'nobody reads it' } }, 'p_owner');
  assert.ok(pressed.ok, JSON.stringify(pressed));
  assert.ok((await k.install([pressed.value.install as never], pressed.value.expect, { actor: 'p_owner' })).ok);
  assert.equal(nextOf(k)?.retired, true);
  assert.equal((k.get({ register: 'things', seq: 1 }) as { fields: Record<string, unknown> } | null)?.fields.next, 'ship the kiln');
  fresh();
});

test('A FIELD THE LIST IS READ BY, OR ONE IT DOES NOT HAVE, IS REFUSED BEFORE ANYTHING IS SENT', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  const label = (id: string) => labelOf(BUNDLED.fields.find((f) => f.id === id)!);
  for (const [field, fix] of [
    ['name', retireWords.readBy(label('name'), 'title')],
    ['lane', retireWords.readBy(label('lane'), 'state')],
    ['colour', retireWords.unknown('colour', BUNDLED.name)],
  ] as const) {
    assert.deepEqual(retirable('things', field), { ok: false, fix }, field);
    assert.deepEqual(await retireField(BASE, 'things', field, io), { from: 'refused', fix }, field);
  }
  assert.deepEqual(asked, [], 'a retire the record would refuse was sent');
  fresh();
});

test('A REFUSAL FROM THE RECORD COMES BACK AS ITS OWN SENTENCE, and still nothing is decided', async () => {
  fresh();
  const k = await projects();
  const { io, asked } = served(k);
  assert.equal((await retireField(BASE, 'things', 'next', io)).from, 'filed');
  const first = k.decide('SG1', { decide: { option: 'accept', reason: 'r' } }, 'p_owner');
  assert.ok(first.ok);
  assert.ok((await k.install([first.value.install as never], first.value.expect, { actor: 'p_owner' })).ok);
  /* THIS TAB STILL HOLDS THE BUNDLE, where `next` is live, so it files again and the record says why not. */
  const again = await retireField(BASE, 'things', 'next', io);
  assert.equal(again.from, 'refused');
  assert.match(again.from === 'refused' ? again.fix : '', /next is already retired/);
  assert.deepEqual(asked, ['propose', 'propose']);
  fresh();
});
