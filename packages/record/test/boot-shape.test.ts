/**
 * The shell's one round trip: `boot` carries what the app asked for in four more calls before its first
 * paint. What waits (`waits`), who is working (`working`), the voice the record speaks in (`voice`, which was the add-ons
 * list and one or more add-on settings reads) and whether a model is behind Slash (`slash`, which was `version`). It says
 * its shape with a number, and the fields it carried before stay for a release.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normaliseUseCase, useCasePack } from '@braindog/declare';

import { BOOT_SHAPE, createRecordApi, type Boot, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 9, 8, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };

const value = <T>(r: unknown): T => {
  const x = r as { ok: boolean; value?: T; refusal?: { code: string; fix: string } };
  assert.ok(x.ok, x.ok ? '' : `${x.refusal?.code}: ${x.refusal?.fix}`);
  return x.value as T;
};

/** A use case that speaks: its Home is called Desk, and its courses list is worded its own way, with a label. */
const STUDY = useCasePack(
  (() => {
    const u = normaliseUseCase({
      usecase: 'study',
      version: '1.0.0',
      title: 'Study',
      summary: 'Courses.',
      author: 'BrainDog',
      license: 'MIT',
      audience: 'individual',
      tone: 'plain',
      modules: [],
      voice: { home: 'Desk' },
      pack: {
        pack: 'usecase-study',
        requires: { format: 1, primitives: 1, packs: {} },
        declarations: [{ register: 'courses', name: 'Courses', title: 'name', fields: [{ id: 'name', type: 'text', required: true }] }],
      },
    });
    assert.ok(u.ok, u.ok ? '' : JSON.stringify(u));
    return u.value;
  })(),
)!;

async function record(build?: { app: string; slash: boolean }) {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), ...(build ? { build } : {}) });
  const install = async (doc: unknown) => {
    const planned = value<{ diff: { planHash: string } }>(await api.planPack({ doc }, owner));
    value(await api.installPack({ doc, planHash: planned.diff.planHash, approve: [] }, owner));
  };
  return { api, sql, install };
}

test('BOOT CARRIES ITS SHAPE, WHAT WAITS, WHO IS WORKING, THE VOICE AND SLASH, beside every field it carried before', async () => {
  const { api, sql } = await record({ app: 'test', slash: true });
  const boot = value<Boot>(await api.boot(owner));
  assert.equal(boot.shape, BOOT_SHAPE);
  assert.ok(BOOT_SHAPE >= 2);
  assert.deepEqual(boot.waits, { questions: 0, late: 0, hard: 0, inbox: 0, working: 0 });
  assert.deepEqual(boot.working, []);
  assert.deepEqual(boot.voice, { pack: null, values: {}, labels: {} });
  assert.equal(boot.slash, true);
  /* THE OLD FIELDS STAY FOR ONE RELEASE: the list of questions, the counts and the live runs. */
  for (const key of ['waiting', 'counts', 'sessions', 'registers', 'pages', 'home', 'me', 'now'] as const) assert.ok(key in boot, `${key} left boot`);
  sql.close();
});

test('BOOT SAYS THE RECORD\'S ZONE, which every today a screen says is counted in, and UTC where it names none', async () => {
  const bare = await record();
  assert.equal(value<Boot>(await bare.api.boot(owner)).zone, 'UTC');
  bare.sql.close();
  const { api, sql } = await record();
  api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAZ', slug: 'zoned', name: 'Zoned', tz: 'Africa/Cairo', locale: 'en', owner: { id: 'p_owner' } });
  assert.equal(value<Boot>(await api.boot(owner)).zone, 'Africa/Cairo');
  sql.close();
});

test('SLASH IS OFF WHERE THE BUILD DID NOT SAY A MODEL IS HERE', async () => {
  const { api, sql } = await record();
  assert.equal(value<Boot>(await api.boot(owner)).slash, false);
  sql.close();
});

test('THE VOICE IS THE USE CASE THAT SPEAKS, with the values its settings hold and the labels they name', async () => {
  const { api, sql, install } = await record();
  await install(STUDY);
  const boot = value<Boot>(await api.boot(owner));
  assert.equal(boot.voice.pack, 'usecase-study');
  /* THE SAME VALUES `packConfig` ANSWERS, so the app draws from boot what it drew from that read. */
  const read = value<{ values: Record<string, unknown> }>(await api.packConfig({ id: 'usecase-study' }, owner));
  assert.deepEqual(boot.voice.values, read.values);
  assert.equal(boot.voice.values.voice_home, 'Desk');
  sql.close();
});
