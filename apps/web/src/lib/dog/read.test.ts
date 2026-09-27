/**
 * `sourceOf` against a stub answering `arrangement` as the record does: `{ id, version, pack, body }` for a page the
 * caller can read, the template's declaration for a page made from one, and the record's own refusal otherwise.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { PageBody } from '@braindog/dog';

import { sourceOf, type Fetch } from './read.ts';

const BASE = 'http://record.test';

const DESK: PageBody = {
  page: 'desk',
  title: 'Desk',
  layout: { rail: 4, sticky: true },
  blocks: [{ kind: 'note', lead: true, when: { metric: 'open', gt: 0 }, body: '{{open}} open.' }],
};

const PROJECT: PageBody = { page: 'project', title: '{{name}}', for: { register: 'things' }, requires: ['register.things'], blocks: [] };

/** The stub, and every address it was asked at. */
function stub(): { io: Fetch; asked: URL[] } {
  const asked: URL[] = [];
  const io: Fetch = async (input) => {
    const url = new URL(String(input));
    asked.push(url);
    const page = url.searchParams.get('page');
    const value =
      page === 'desk'
        ? { ok: true, value: { id: 'page.desk', version: 3, pack: null, body: DESK } }
        : page === 'kiln'
          ? { ok: true, value: { id: 'page.project', version: 1, pack: 'portfolio', body: PROJECT } }
          : { ok: false, refusal: { code: 'PAGE_UNKNOWN', fix: 'There is no page declaration page.nowhere that you can read. The pages are: desk.', at: 'page' } };
    return new Response(JSON.stringify(value), { status: value.ok ? 200 : 422, headers: { 'content-type': 'application/json' } });
  };
  return { io, asked };
}

test('a written page reads as its stored body and version, through arrangement', async () => {
  const s = stub();
  assert.deepEqual(await sourceOf(BASE, 'desk', s.io), { body: DESK, version: 3, template: null });
  assert.equal(s.asked[0]?.pathname, '/api/arrangement');
  assert.equal(s.asked[0]?.searchParams.get('page'), 'desk');
});

test('a page made from a template reads as the template, named', async () => {
  assert.deepEqual(await sourceOf(BASE, 'kiln', stub().io), { body: PROJECT, version: 1, template: 'project' });
});

test("a page the record will not answer is the record's own sentence", async () => {
  assert.deepEqual(await sourceOf(BASE, 'nowhere', stub().io), {
    fix: 'There is no page declaration page.nowhere that you can read. The pages are: desk.',
    code: 'PAGE_UNKNOWN',
  });
});
