/**
 * `go-back.mjs` against a host in memory.
 *
 *   node --test apps/worker/scripts/go-back.test.mjs
 *
 * THE HOST HERE IS THE RECORD'S RULES AND NOTHING ELSE: a log, a list of people, invitations and copies, where going
 * back keeps what the record was as `before-restore`, puts the copy's state in its place and writes one `restore.pitr`
 * on what came back. Each fault below is one way a real host has gone wrong or could, and the script must name the
 * step that caught it.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { bootWithin, goBack, main, MARK, quote, refusalFor } from './go-back.mjs';

const ok = (value) => ({ status: 200, said: { ok: true, value } });
/* The status and the sentence are what the script reads; the code is one of the registry's and is not what a test asserts. */
const no = (status, fix) => ({ status, said: { ok: false, refusal: { code: 'FORBIDDEN', fix } } });

/** A record in memory. `fault` names the one thing it gets wrong; `asked` is every method it was asked, in order. */
function host(fault = null) {
  let state = { events: [], people: [{ person_id: 'owner' }], invitations: [] };
  const copies = [];
  const asked = [];
  let n = 0;
  let down = 0;
  let restores = 0;
  const event = (kind, words) => state.events.unshift({ id: `e${++n}`, ts: `2026-10-13T00:00:${String(n).padStart(2, '0')}Z`, kind, title: words, note: words });
  const take = (label) => {
    const id = `${label}-2026-10-13${copies.filter((c) => c.id.startsWith(label)).length > 0 ? `-${copies.length}` : ''}`;
    copies.unshift({ id, at: '2026-10-13T00:00:00Z', bytes: 1, state: structuredClone(state) });
    return id;
  };
  const ask = async (method, body) => {
    asked.push(method);
    if (method === 'boot') {
      if (down > 0) return (down--, no(500, 'The record did not open.'));
      return ok({ registers: [] });
    }
    if (down > 0) return no(500, 'The record did not open.');
    if (method === 'members') return fault === 'people' && restores > 0 ? ok([]) : ok(state.people);
    if (method === 'invitations') return fault === 'invitations' && restores > 0 ? no(500, 'It broke.') : ok(state.invitations);
    if (method === 'recentHistory') return ok({ events: state.events.slice(0, body.limit ?? 50), cursor: null });
    if (method === 'schema') return body.register === 'tasks' ? ok({ id: 'tasks', fields: fault === 'wordless' ? [{ id: 'state', type: 'enum', required: true }] : [{ id: 'state', type: 'enum', required: true }, { id: 'what', type: 'text', required: true }] }) : no(422, `There is no register called ${body.register}.`);
    if (method === 'create') return body.register === 'tasks' && Object.keys(body.fields).join() === 'what' ? (event('create', body.fields.what), ok({ seq: n })) : no(422, 'That is not a field of this list.');
    if (method === 'snapshot') return ok({ id: take('now'), at: '2026-10-13T00:00:00Z', bytes: 1 });
    if (method === 'snapshots') return ok(copies.filter((c) => !(fault === 'unlisted' && c.id.startsWith('before-restore'))).map(({ id, at, bytes }) => ({ id, at, bytes })));
    if (method === 'invite') return (state.invitations.push({ id: `i${++n}`, email: body.email }), event('grant', 'invited'), ok({ invitation: state.invitations.at(-1), token: 'once' }));
    if (method === 'revokeInvite') return ((state.invitations = state.invitations.filter((i) => i.id !== body.id)), ok({ id: body.id }));
    if (method === 'restore') {
      const copy = copies.find((c) => c.id === body.bookmark);
      if (!copy) return no(404, 'There is no copy by that name.');
      if (fault === 'refused') return no(503, 'This host does not go back.');
      const kept = fault === 'unkept' ? null : take('before-restore');
      restores += 1;
      if (fault === 'nothing') return ok({ bookmark: copy.id, at: copy.at, kept });
      const was = state;
      state = structuredClone(copy.state);
      if (fault === 'half') state.invitations = structuredClone(was.invitations);
      if (fault === 'lost' && restores === 2) state.events = state.events.filter((e) => !String(e.title).includes('later 2'));
      if (fault !== 'silent') event('restore.pitr', `The record was put back to ${copy.id}.`);
      if (fault === 'twice') event('restore.pitr', `The record was put back to ${copy.id}.`);
      down = fault === 'armed' ? 1_000_000 : 2;
      return ok({ bookmark: copy.id, at: copy.at, kept });
    }
    return no(404, `There is no method called ${method}.`);
  };
  return { ask, asked, copies, events: () => state.events, invitations: () => state.invitations };
}

/** One run on `h`, on a clock that moves two seconds a wait, so a minute of faults costs no real time. */
function run(h, more = {}) {
  let clock = 0;
  const said = [];
  return goBack({ record: 'canary', ops: 'canary', ask: h.ask, wait: async (ms) => void (clock += ms), now: () => clock, say: (line) => said.push(line), stamp: 'abcd1234', ...more }).then((out) => ({ ...out, said }));
}

test('a host that goes back as it should prints PASS, with the log\'s last two lines quoted', async () => {
  const h = host();
  const out = await run(h);
  assert.equal(out.pass, true, out.said.join('\n'));
  assert.equal(out.said.at(-1), 'PASS');
  assert.equal(out.quoted.length, 2);
  assert.match(out.quoted[0], /create {2}Going back check abcd1234 first 3$/);
  assert.match(out.quoted[1], /restore\.pitr {2}The record was put back to now-2026-10-13\.$/);
  assert.ok(out.said.includes(`    ${out.quoted[1]}`), 'the quoted lines are not printed');
  /* IT ENDS WHERE IT WAS BEFORE GOING BACK: the six entries, and its own invitation taken back. */
  assert.equal(h.events().filter((e) => String(e.title).startsWith(MARK)).length, 6);
  assert.deepEqual(h.invitations(), []);
  assert.equal(h.copies.filter((c) => c.id.startsWith('before-restore')).length, 2);
  assert.equal(h.asked.filter((m) => m === 'restore').length, 2);
});

test('it runs on the record OPS_RECORD names and on no other, and asks a refused record nothing', async () => {
  assert.equal(refusalFor('canary', 'canary'), null);
  for (const [record, ops] of [['mine', 'canary'], ['canary', ''], ['', 'canary'], ['mine', ''], ['canary', 'mine ']]) {
    const h = host();
    const out = await run(h, { record, ops });
    assert.equal(out.pass, false, `${record} was run on with OPS_RECORD ${JSON.stringify(ops)}`);
    assert.equal(out.step, 'the record named');
    assert.deepEqual(h.asked, [], 'a refused record was asked something');
    assert.match(out.said.at(-1), /^FAIL {2}the record named: /);
  }
  /* NO NAME IS ITS OWN RULE: the operator's record is whichever one is named, a person's own included were it ever named there. */
  assert.equal(refusalFor('mine', 'mine'), null);
});

test('each way going back can go wrong is named by the step that caught it', async () => {
  const faults = {
    wordless: 'three entries are written',
    refused: 'the record goes back to the copy',
    armed: 'boot answers 200 within a minute',
    silent: 'the log ends at the copy plus one restore.pitr',
    twice: 'the log ends at the copy plus one restore.pitr',
    nothing: 'the log ends at the copy plus one restore.pitr',
    unkept: 'a before-restore copy is listed',
    unlisted: 'a before-restore copy is listed',
    people: 'both members sign in',
    invitations: 'both members sign in',
    half: 'both members sign in',
    lost: 'the three later entries return',
  };
  for (const [fault, step] of Object.entries(faults)) {
    const out = await run(host(fault));
    assert.equal(out.pass, false, `${fault} passed`);
    assert.equal(out.step, step, `${fault} was caught at "${out.step}": ${out.why}`);
    assert.equal(out.said.at(-1), `FAIL  ${step}: ${out.why}`);
    assert.ok(!out.said.includes('PASS'));
  }
});

test('boot is given a minute: faults while the record resets pass, a minute of them does not', async () => {
  let clock = 0;
  let left = 5;
  const io = { wait: async (ms) => void (clock += ms), now: () => clock };
  const up = await bootWithin({ ...io, ask: async () => (left-- > 0 ? no(500, 'x') : ok({})) });
  assert.deepEqual(up, { ok: true, ms: 10_000, misses: 5 });
  clock = 0;
  const never = await bootWithin({ ...io, ask: async () => no(500, 'x') });
  assert.equal(never.ok, false);
  assert.equal(never.last, 500);
  assert.ok(never.ms >= 60_000 && never.ms < 64_000, `it gave up after ${never.ms} ms`);
});

test('a quoted line holds no id, and the shell refuses before it reaches any host', async () => {
  assert.equal(quote({ ts: 't', kind: 'restore.pitr', note: 'Put back by 01J9ZQ3V5K8M2N4P6R7S8T9V0W.' }), 't  restore.pitr  Put back by ….');
  assert.equal(quote({ ts: 't', kind: 'restore.pitr', note: 'restored to now-2026-10-13 by p_01J9ZQ3V5K8M2N4P6R7S8T9V0W; kept' }), 't  restore.pitr  restored to now-2026-10-13 by …; kept');
  const said = [];
  assert.equal(await main([], { SMOKE_SLUG: '' }, (line) => said.push(line)), 3);
  assert.match(said[0], /^Going back: not run: /);
  /* `OPS_RECORD` IS EMPTY IN THE REPOSITORY TODAY, so every name is refused, the owner's own among them. */
  assert.equal(await main(['mine'], {}, (line) => said.push(line)), 1);
  assert.match(said[1], /^FAIL {2}the record named: /);
});
