/**
 * Accepting a `change` that installs a rule is held to the door `setDeclaration` is held to: an owner, in a browser.
 *
 * TWO ROADS TO ONE INSTALL, AND A GATE ON ONE. `setDeclaration` asks `admin(ctx)`, whose comment names ADR-060: a rule
 * is what runs while nobody is looking. `decide` asked `guard(ctx, 'decide')` and held an accept to `admin` only for
 * `pack`, `settings` and `arrange`. A person at `decide` who is not the owner, measured on `36407cc1`:
 *
 *     setDeclaration at decide: LEVEL_REQUIRED This needs owner, and you have decide access.
 *     accept at decide: ok
 *     filed 1 posts 1 owner key true reads ["rule:rate"]
 *
 * The rule a colleague proposed and then accepted herself asked Slash on the owner's key, which `workerSlashAnswers`
 * and `docs/07` rest on installing being the owner's consent. Here the post is the `infer.ask` job the run queues: the
 * Worker sends one post for each, so no job is no post.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRecordApi, type CallContext } from '../src/index.ts';
import { fixedClock, openSqlite } from '../../kernel/test/sqlite.ts';

const NOW = Date.UTC(2026, 8, 23, 12);
const owner: CallContext = { principal: { kind: 'person', id: 'p_owner', level: 'owner' } };
/** The colleague: at `decide` on the whole record, and not the owner. */
const colleague: CallContext = { principal: { kind: 'person', id: 'p_c', level: 'decide' } };

const OBLIGATIONS = {
  id: 'register.obligations',
  kind: 'register',
  body: { id: 'obligations', name: 'Obligations', title: 'what', fields: [{ id: 'what', type: 'text', required: true }, { id: 'note', type: 'text' }] },
};
const RATE = {
  id: 'rule.rate',
  kind: 'rule',
  body: {
    rule: 'rate',
    on: { written: { register: 'obligations', op: ['create'] } },
    once_per: ['entry'],
    steps: [{ ask_slash: { question: 'What rate applies to {{what}}?', about: ['what'], as: 'rate', shape: 'number' } }],
  },
};
const WITH_DUE = { ...OBLIGATIONS, body: { ...OBLIGATIONS.body, fields: [...OBLIGATIONS.body.fields, { id: 'due', type: 'day' }] } };

type Out = { ok: boolean; value?: unknown; refusal?: { code: string; fix: string } };
const value = <T>(r: unknown): T => {
  const x = r as Out;
  assert.ok(x.ok, JSON.stringify(x));
  return x.value as T;
};

async function record() {
  const sql = openSqlite();
  const api = await createRecordApi({ sql, clock: fixedClock(NOW), answersSlash: true });
  value(api.kernel.createRecord({ id: 'rec_01JZ8QK3F7R2M9V4XN6TCB5HAD', slug: 'the-studio', name: 'The Studio', tz: 'UTC', locale: 'en', owner: { id: 'p_owner' } }));
  value(await api.kernel.install([OBLIGATIONS] as never));
  const file = async (by: CallContext, declaration_id: string, to: unknown) =>
    value<{ id: string }>(await api.propose({ question: 'Ask the rate?', body_kind: 'change', body: { declaration_id, to } } as never, by)).id;
  const accept = async (id: string, by: CallContext) => (await api.decide({ id, decide: { option: 'accept', reason: 'Fine.' } } as never, by)) as Out;
  /* How many questions to Slash a new Obligations row queues, which is how many posts the Worker makes for it. */
  const asks = async (): Promise<number> => {
    value(await api.create({ register: 'obligations', fields: { what: `Rent ${Math.random()}` } }, owner));
    await api.kernel.drain();
    return Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM outbox WHERE kind = 'infer.ask'")?.n ?? 0);
  };
  const installed = () => api.kernel.declarations().some((d) => d.id === 'rule.rate');
  const open = (id: string) => sql.one<{ status: string }>('SELECT status FROM suggestion WHERE id = ?', id)?.status;
  return { sql, api, file, accept, asks, installed, open };
}

test('A COLLEAGUE AT DECIDE WHO MAY NOT SET A RULE MAY NOT ACCEPT ONE EITHER, and no question goes out', async () => {
  const { sql, api, file, accept, asks, installed, open } = await record();
  /* THE ROAD THAT WAS ALREADY HELD, so the two are seen to answer the same. */
  const set = (await api.setDeclaration({ body: RATE } as never, colleague)) as Out;
  assert.equal(set.refusal?.code, 'LEVEL_REQUIRED', JSON.stringify(set));

  const id = await file(colleague, 'rule.rate', RATE);
  const out = await accept(id, colleague);
  assert.equal(out.ok, false, 'a colleague at decide accepted her own rule into the record');
  assert.equal(out.refusal?.code, 'LEVEL_REQUIRED', JSON.stringify(out));
  assert.equal(installed(), false);
  assert.equal(open(id), 'open', 'the question was decided though nothing was installed');
  assert.equal(await asks(), 0, 'the rule asked Slash on the owner’s key');

  /* AND THE OWNER'S PRESS ON THE SAME QUESTION INSTALLS IT, so the refusal above is about who pressed. */
  value(await accept(id, owner));
  assert.equal(installed(), true);
  assert.equal(await asks(), 1);
  sql.close();
});

test('A RULE INSIDE A BUNDLE IS HELD THE SAME, and a bundle with no rule is not', async () => {
  const { sql, file, accept, installed } = await record();
  const bundled = await file(colleague, 'register.obligations', { declarations: [WITH_DUE, RATE] });
  assert.equal((await accept(bundled, colleague)).refusal?.code, 'LEVEL_REQUIRED');
  assert.equal(installed(), false);

  /* NOT WIDENED PAST RULES. A change to a list's fields is what `decide` was given for, and stays so until a D-number
     says otherwise. */
  const list = await file(owner, 'register.obligations', { declarations: [WITH_DUE] });
  value(await accept(list, colleague));
  sql.close();
});

/* THE OTHER ROAD TO THE SAME INSTALL, AND IT IS CLOSED BEFORE THE ACCEPT NOW. The kernel's accept installs a `pattern`'s
   `ingest` exactly as it installs a `change`'s `to`, and asked only that it be an object: measured before the pattern was
   held, this colleague filed the same rule as a `pattern`'s `ingest`, accepted it herself, it installed, and the next
   Obligations row queued one `infer.ask`. This test held the accept to the owner. A pattern's `ingest` is now held to
   being an ingest when it is filed (`kernel/test/pattern-kind.test.ts`), so there is no such question for anybody to
   accept: the colleague's is refused, the owner's is refused the same, and the refusal says to file a rule as a change,
   which the tests above hold to the owner. */
test('A RULE FILED AS A PATTERN IS NOT FILED AT ALL, by the colleague or the owner, and nothing asks Slash', async () => {
  const { sql, api, asks, installed } = await record();
  for (const by of [colleague, owner]) {
    const out = (await api.propose({ question: 'Ask the rate?', body_kind: 'pattern', body: { ingest: RATE, samples: ['raw_1'] } } as never, by)) as Out;
    assert.equal(out.ok, false, 'a rule was filed as a pattern');
    assert.equal(out.refusal?.code, 'VALUE_MALFORMED', JSON.stringify(out));
    assert.match(out.refusal?.fix ?? '', /\bas a change\b/u);
  }
  assert.equal(sql.one<{ n: number }>('SELECT count(*) AS n FROM suggestion')?.n, 0);
  assert.equal(installed(), false);
  assert.equal(await asks(), 0, 'the rule asked Slash on the owner’s key');
  sql.close();
});

test("A COLLEAGUE AT DECIDE DOES NOT ACCEPT HER OWN CHANGE TO A LIST OR A PAGE: setDeclaration refuses her, and filing it was the same write", async () => {
  const { api, sql, file, accept } = await record();
  const mine = await file(colleague, 'register.obligations', { declarations: [WITH_DUE] });
  const refused = await accept(mine, colleague);
  assert.equal(refused.ok, false, 'she accepted her own change');
  assert.equal(refused.refusal?.code, 'FORBIDDEN');
  /* THE QUESTION STAYS OPEN FOR SOMEBODY ELSE, and an owner answers it. */
  value(await accept(mine, owner));
  void api;
  sql.close();
});
