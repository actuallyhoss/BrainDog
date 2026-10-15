import { test } from 'node:test';
import assert from 'node:assert/strict';

import { againIn, answerOf, probe, probeSaid, seconds, words, type ProbeDoor, type ProbeOut } from './model-probe.ts';

/* A FAKE DOOR: it records what was called and answers what it was handed. No request leaves, no key is used. */
const door = (answer: Awaited<ReturnType<ProbeDoor['call']>> | Error): ProbeDoor & { asked: string[] } => {
  const asked: string[] = [];
  return {
    asked,
    call: async (name) => {
      asked.push(name);
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
};

const said = (out: ProbeOut): string => probeSaid(out).join('\n');
const noDash = (lines: string[]) => lines.forEach((l) => assert.ok(!/[\u2014\u2013]/u.test(l), l));

test('served: one line, the model by its own name and the seconds to one decimal', async () => {
  const d = door({ ok: true, value: { candidates: [{ model: '@cf/vendor/brisk-7b', served: true, strict: true, ms: 1234 }] } });
  const out = await probe('https://example.test', d);
  assert.deepEqual(d.asked, ['engineProbe']);
  assert.deepEqual(probeSaid(out), ['Answered by brisk-7b in 1.2 s.']);
});

test('failed then served: the first says why, the next was asked instead and answered', async () => {
  const out = await probe(
    'https://example.test',
    door({
      ok: true,
      value: {
        candidates: [
          { model: '@cf/vendor/brisk-7b', served: false, strict: false, ms: 30000, why: 'it took too long \u2014 over 30 seconds.' },
          { model: '@cf/other/steady-3', served: true, strict: true, ms: 840 },
        ],
      },
    }),
  );
  const lines = probeSaid(out);
  assert.deepEqual(lines, ['brisk-7b did not answer: it took too long, over 30 seconds.', 'Asked steady-3 instead, which answered in 0.8 s.']);
  noDash(lines);
});

test('a candidate that served out of the strict form says so, and one asked after a served one is not "instead"', () => {
  const lines = probeSaid({
    kind: 'answer',
    answer: {
      candidates: [
        { model: 'brisk-7b', served: true, strict: false, ms: 50 },
        { model: 'steady-3', served: false, strict: false, ms: 10 },
      ],
    },
  });
  assert.deepEqual(lines, ['Answered by brisk-7b in 0.1 s, but its answer did not keep to the form it was asked for.', 'steady-3 did not answer.']);
});

test('none set up: no candidates is one plain sentence', async () => {
  const out = await probe('https://example.test', door({ ok: true, value: { candidates: [] } }));
  assert.deepEqual(probeSaid(out), [words.none]);
});

test('held: the refusal as it came, then when the next press may go', async () => {
  const out = await probe(
    'https://example.test',
    door({ ok: false, refusal: { code: 'RATE_LIMITED', fix: 'The model was tested a moment ago.', retry_after: 452 } }),
  );
  assert.deepEqual(out, { kind: 'refused', fix: 'The model was tested a moment ago.', retryAfter: 452 });
  assert.deepEqual(probeSaid(out), ['The model was tested a moment ago.', 'You can test again in 8 minutes.']);
});

test('a refusal not held is its fix alone', async () => {
  const out = await probe('https://example.test', door({ ok: false, refusal: { code: 'FORBIDDEN', fix: 'Only the owner can test the model.' } }));
  assert.equal(said(out), 'Only the owner can test the model.');
});

test('a host without the call, an odd answer, or no answer at all is one sentence, never a code', async () => {
  const absent = await probe('https://example.test', door({ ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called engineProbe.' } }));
  assert.deepEqual(probeSaid(absent), [words.absent]);
  const older = await probe('https://example.test', door({ ok: false, refusal: { code: 'NOT_IN_THIS_BUILD', fix: 'x', at: 'engineProbe' } }));
  assert.deepEqual(probeSaid(older), [words.absent]);
  assert.deepEqual(probeSaid(await probe('https://example.test', door({ ok: true, value: 'nope' }))), [words.absent]);
  assert.deepEqual(probeSaid(await probe('https://example.test', door(new Error('offline')))), [words.unreached]);
});

test('the pieces: seconds, minutes, and only the right shape is taken', () => {
  assert.equal(seconds(1250), '1.3 s');
  assert.equal(seconds(0), '0.1 s');
  assert.equal(againIn(30), 'You can test again in a minute.');
  assert.equal(againIn(600), 'You can test again in 10 minutes.');
  assert.equal(answerOf({ candidates: [{ model: 'brisk-7b' }] }), null);
  assert.equal(answerOf(null), null);
});

test('held, with a fix that already names the wait: the wait is said once', () => {
  const lines = probeSaid({ kind: 'refused', fix: 'The model was checked a moment ago. The next check can go in 8 minutes.', retryAfter: 452 });
  assert.deepEqual(lines, ['The model was checked a moment ago.', 'You can test again in 8 minutes.']);
  assert.deepEqual(probeSaid({ kind: 'refused', fix: 'Wait in 2 minutes.', retryAfter: 90 }), ['You can test again in 2 minutes.']);
});

test("the host's whole-sentence reasons read as one clause, and 'did not answer' is never said twice", () => {
  const lines = probeSaid({
    kind: 'answer',
    answer: {
      candidates: [
        { model: 'brisk-7b', served: false, strict: false, ms: 900, why: 'It did not answer.' },
        { model: 'steady-3', served: false, strict: false, ms: 400, why: 'Its provider turned the question away.' },
        { model: 'the model', served: false, strict: false, ms: 10, why: 'Your own key would not open, so it was not asked.' },
      ],
    },
  });
  assert.deepEqual(lines, [
    'brisk-7b did not answer.',
    'Asked steady-3 instead, which did not answer: its provider turned the question away.',
    'Asked the model instead, which did not answer: your own key would not open, so it was not asked.',
  ]);
  assert.deepEqual(probeSaid({ kind: 'answer', answer: { candidates: [{ model: 'the model', served: false, strict: false, ms: 1 }] } }), ['The model did not answer.']);
});

test("nothing asked: the record's own reason, as when Slash's reading is switched off", async () => {
  const off = await probe('https://example.test', door({ ok: true, value: { candidates: [], said: 'Slash reading is switched off.', next: '2026-10-15T09:00:00.000Z' } }));
  assert.deepEqual(probeSaid(off), ['Slash reading is switched off.']);
  const served = await probe('https://example.test', door({ ok: true, value: { candidates: [{ model: 'brisk-7b', served: true, strict: true, ms: 1200 }], said: 'Answered by brisk-7b in 1.2 s.', next: 'x' } }));
  assert.deepEqual(probeSaid(served), ['Answered by brisk-7b in 1.2 s.']);
});
