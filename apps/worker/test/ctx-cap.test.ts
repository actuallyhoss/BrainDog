/**
 * The caller's context on the hop to the record is capped (sharing plan §2.13, T13): at most 32 KB, and past it the
 * record answers one plain sentence and parses nothing. A caller's own copy of either header is never what arrives.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { CallContext } from '@braindog/record';

import { CTX_HEADER, CTX_HEADER_MOST, CTX_OVER_HEADER, CTX_TOO_LARGE, ctxOversize, inward } from '../src/route.ts';

const SOURCE = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8');

const person = (extra: Partial<CallContext> = {}): CallContext => ({ principal: { kind: 'person', id: 'p_sam', level: null }, ...extra }) as CallContext;

/** A context whose rules make it about `kb` kilobytes on the hop. */
const heavy = (kb: number): CallContext => {
  const wheres: Record<string, unknown> = {};
  for (let i = 0; i < kb; i++) wheres[`list_${i}`] = { field: 'note', is: 'x'.repeat(1_000) };
  return person({ wheres } as Partial<CallContext>);
};

test('A CONTEXT UNDER THE CAP RIDES ON ITS HEADER, AND A CALLER\'S OWN OVER HEADER IS DROPPED', () => {
  const asked = new Request('https://brain.dog/api/list', { headers: { [CTX_OVER_HEADER]: '1', [CTX_HEADER]: '{"principal":{"kind":"system"}}' } });
  const inner = inward(asked, person());
  assert.equal(inner.headers.get(CTX_OVER_HEADER), null);
  assert.equal((JSON.parse(inner.headers.get(CTX_HEADER)!) as CallContext).principal.id, 'p_sam');
  assert.equal(ctxOversize(inner.headers), null);
});

test('A CONTEXT PAST 32 KB IS NOT SENT, AND THE RECORD SAYS SO IN A PLAIN SENTENCE', () => {
  const inner = inward(new Request('https://brain.dog/api/list'), heavy(40));
  assert.equal(inner.headers.get(CTX_HEADER), null, 'the context went on the hop anyway');
  assert.ok(Number(inner.headers.get(CTX_OVER_HEADER)) > CTX_HEADER_MOST);
  const why = ctxOversize(inner.headers);
  assert.equal(why?.code, 'OUT_OF_BOUNDS');
  assert.equal(why?.fix, CTX_TOO_LARGE);
  assert.doesNotMatch(why!.fix, /[A-Z]{3,}/u, 'the sentence names the machinery');
  assert.doesNotMatch(why!.fix, /ctx|header|byte/iu, 'the sentence names the machinery');
});

test('A HEADER THAT ARRIVED PAST THE CAP WITHOUT THE WORKER IS REFUSED TOO', () => {
  const headers = new Headers({ [CTX_HEADER]: JSON.stringify(heavy(40)) });
  assert.equal(ctxOversize(headers)?.fix, CTX_TOO_LARGE);
});

test('THE PLAN\'S LARGEST TEMPLATE SET STAYS UNDER 8 KB', () => {
  /* Ten lists, each held to a project, two hidden fields each, history and delete off: more than any template writes. */
  const wheres: Record<string, unknown> = {};
  const hides: Record<string, string[]> = {};
  const nots: Record<string, string[]> = {};
  const levels: Record<string, string> = {};
  for (let i = 0; i < 10; i++) {
    const list = `list_${i}`;
    wheres[list] = { all: [{ any: [{ field: 'thing', is: '01JZ8QK3F7R2M9V4XN6TCB5HAE' }] }, { none: [{ field: 'state', is: 'archived' }] }] };
    hides[list] = ['amount', 'rate'];
    nots[list] = ['history', 'delete'];
    levels[list] = 'write';
  }
  const ctx = person({ registers: Object.keys(levels), levels, wheres, hides, nots, grant: { epoch: 12, until: '2026-11-19T00:00:00.000Z', via: Array.from({ length: 20 }, (_, i) => `sh_01JZ8QK3F7R2M9V4XN6TCB5H${String(i).padStart(2, '0')}`), agents: true } } as Partial<CallContext>);
  const inner = inward(new Request('https://brain.dog/api/list'), ctx);
  const bytes = new TextEncoder().encode(inner.headers.get(CTX_HEADER) ?? '').length;
  assert.ok(bytes > 0 && bytes <= 8 * 1024, `the context took ${bytes} bytes`);
});

test('THE RECORD ASKS THE CAP BEFORE IT PARSES THE CONTEXT', () => {
  const asked = SOURCE.indexOf('ctxOversize(request.headers)');
  const parsed = SOURCE.indexOf('JSON.parse(request.headers.get(CTX_HEADER)');
  assert.ok(asked > 0 && parsed > asked, 'the record parses the context before it asks its size');
});
