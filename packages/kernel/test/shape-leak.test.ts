/**
 * The shape copy's guard (PRF-A13 job 2, `area-proof-a.md` 2.5 "Guard").
 *
 * A record written from a marked vocabulary, in every place a person's words can live: a register of his own with
 * his field ids and his states, its entries, a person, a membership, a key's label and hint, a decision, a
 * suggestion, a series, an arrival, a pack of his, a prediction, the record's own name. Its shape copy must carry no
 * word of three or more letters from that vocabulary anywhere, and still hold the same counts, the same lengths and
 * the same groups of duplicates. Sealed bytes come out as zeros of the same length.
 *
 * THE RISK IT WATCHES is the scrambler taking something for structure: a state he typed, a list named after a client,
 * a field id of his own. Each of those is here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { openRecord, type Declaration } from '../src/index.ts';
import { importBrainl } from '../src/brainl.ts';
import { shapeBrainl } from '../src/shape.ts';
import { fixedClock, openSqlite, type NodeSql } from './sqlite.ts';
import { testSigner } from './signer.ts';

const NOW = Date.UTC(2026, 8, 5, 12);

/** The marked vocabulary. Nothing in the product says any of these. */
const LONG = [
  'zorbexian', 'quarlinto', 'vemmidrax', 'thulwarden', 'plinkettson', 'brawmoor', 'glaventry', 'mordrecai',
  'sekhmetova', 'krellfast', 'oonaghby', 'fennimarq', 'jubbleton', 'wystanble', 'harrowquist', 'zemmelbrook',
] as const;
const SHORT = ['vok', 'brix', 'yeld', 'quorn', 'tamsk'] as const;
const ARABIC = 'زمردانة';
const [ZOR, QUA, VEM, THU, PLI, BRA, GLA, MOR, SEK, KRE, OON, FEN, JUB, WYS, HAR, ZEM] = LONG;
const [VOK, BRIX, YELD, QUORN, TAMSK] = SHORT;

/** His own register: its id, every field id and both states are his words. */
const HIS: Declaration = {
  id: `register.${ZOR}`,
  kind: 'register',
  body: {
    id: ZOR,
    name: `${ZOR} ${HAR}`,
    title: QUA,
    state: BRA,
    fields: [
      { id: QUA, type: 'text', required: true, search: true },
      { id: VEM, type: 'money', index: true },
      { id: THU, type: 'day', index: true },
      { id: PLI, type: 'int' },
      { id: BRA, type: 'enum', values: [GLA, MOR], labels: { [GLA]: `${GLA} ${VOK}`, [MOR]: MOR } },
    ],
  } as never,
};

async function written(sql: NodeSql): Promise<string[]> {
  const k = await openRecord(sql, fixedClock(NOW), { sign: testSigner() });
  const installed = await k.install([HIS]);
  assert.ok(installed.ok, JSON.stringify(installed));
  const rows = [
    [`${VOK} ${BRIX} ${ARABIC}`, 125000, '2026-09-30', 3, GLA],
    [`${YELD} ${QUORN}, ${TAMSK}`, 4800, '2026-10-15', 12, MOR],
    [`${VOK} ${BRIX} ${ARABIC}`, 125000, '2026-09-30', 3, GLA],
    [`${ZEM}-${WYS}`, 99, '2026-11-01', 7, GLA],
  ] as const;
  for (const [text, amount, day, n, state] of rows) {
    const made = k.create(ZOR, { [QUA]: text, [VEM]: { amount, currency: 'EGP' }, [THU]: day, [PLI]: n, [BRA]: state }, { actor: 'p_1' });
    assert.ok(made.ok, JSON.stringify(made));
  }

  const b = (n: number, len = 24): Uint8Array => new Uint8Array(len).fill(n);
  sql.exec("INSERT INTO record (singleton, id, slug, name, locale, tz, format_ver, created_at) VALUES (1, 'rec_01M1QDTV004FEDHSKYT9FTARNJ', ?, ?, 'en', 'Africa/Cairo', 1, '2026-01-02T00:00:00.000Z')", HAR, `${HAR} ${KRE}`);
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_1', `${OON}@${FEN}.test`, `${SEK} ${KRE}`);
  sql.exec('INSERT INTO person (id, email, name, suspended_at) VALUES (?, ?, ?, NULL)', 'p_2', `${KRE}.${OON}@${FEN}.test`, `${SEK} ${KRE}`);
  sql.exec("INSERT INTO member (person_id, register, level, seen_at, row_where) VALUES ('p_2', ?, 'read', '2026-09-01T00:00:00.000Z', ?)", ZOR, `${BRA} = '${GLA}'`);
  sql.exec(
    "INSERT INTO grant (id, label, opens, kind, version, ciphertext, nonce, kdf, wrapped_by, kek_id, bytes, hint, created_at) VALUES ('g_01M1QDTV004FEDHSKYT9FTARNJ', ?, ?, 'api_token', 1, ?, ?, 'hkdf', 'kek', 'kek_2f', 64, ?, '2026-01-01T00:00:00.000Z')",
    `${JUB} bank`, `${JUB}.example`, b(7, 40), b(9, 12), `the ${WYS} one`,
  );
  sql.exec("INSERT INTO vault_key (purpose, wrapped, nonce, wrapped_by, kek_id, salt) VALUES ('record', ?, ?, 'kek', 'kek_2f', ?)", b(3, 48), b(5, 12), b(1, 16));
  sql.exec("INSERT INTO decision (id, question, answer, reason, decided_by, ts) VALUES ('D1', ?, ?, ?, 'p_1', '2026-08-10T00:00:00.000Z')", `Do we drop ${JUB}?`, `Yes, ${TAMSK}`, `${SEK} said ${QUORN} twice.`);
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG1', 'change', ?, 'open', 'agent:claude', '2026-08-11T00:00:00.000Z')",
    JSON.stringify({ register: ZOR, fields: { [QUA]: `${YELD} ${HAR}`, [BRA]: MOR } }),
  );
  for (const [i, v] of [1200, 1350, 1720, 2400].entries())
    sql.exec("INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'month', ?, ?, 'EGP', 1, ?, '2026-09-01T00:00:00.000Z')", `${ZOR}_total`, `2026-0${i + 4}`, v, ZOR);
  /* A unit he named, and a proposal that carries his rows: his figure in it is his amount, not a bound. */
  sql.exec("INSERT INTO metric_point (series, grain, at, value, unit, n, source, wrote_at) VALUES (?, 'month', '2026-04', 31, ?, 1, ?, '2026-09-01T00:00:00.000Z')", `${ZOR}_${WYS}`, WYS, ZOR);
  sql.exec(
    "INSERT INTO suggestion (id, body_kind, body, status, opened_by, opened_at) VALUES ('SG2', 'rowset', ?, 'open', 'agent:claude', '2026-08-12T00:00:00.000Z')",
    JSON.stringify({ register: ZOR, rows: [{ [QUA]: `${TAMSK} 7350981`, [PLI]: 7350981 }] }),
  );
  sql.exec(
    "INSERT INTO inbox_raw (id, ts, channel, headers, body, sha256, state, reason) VALUES ('in_1', '2026-08-02T10:00:00.000Z', 'email', ?, ?, ?, 'review', ?)",
    JSON.stringify({ from: `${OON}@${FEN}.test`, subject: `${MOR} ${BRIX}` }),
    `${BRIX} paid EGP 4,417.50 to ${QUA} on 02/08`,
    'deadbeef'.repeat(8),
    `no pattern for ${FEN}`,
  );
  sql.exec("INSERT INTO pack (id, version, source, source_ref, manifest, installed_at, checksum) VALUES (?, '1.0.0', 'local', NULL, ?, '2026-01-04T09:00:00.000Z', 'abc123')", `${VEM}-pack`, JSON.stringify({ name: `${VEM} ${THU}`, registers: [ZOR] }));
  sql.exec(
    "INSERT INTO prediction (id, for_decl, claim, measure, baseline, unit, target, window, score_at, on_miss) VALUES ('pr_1', ?, ?, ?, 41, 'days', '20', '90d', '2026-11-10T00:00:00.000Z', 'suggest')",
    `register.${ZOR}`, `${PLI} halves the wait`, JSON.stringify({ source: ZOR, where: `${BRA} = '${MOR}'` }),
  );
  sql.exec(
    "INSERT INTO outbox (id, created, kind, payload, state, attempts) VALUES ('ob_1', '2026-09-05T12:00:00.000Z', 'notify.webhook', ?, 'pending', 0)",
    JSON.stringify({ to: `https://${FEN}.test/${ZEM}`, register: ZOR, fields: { [QUA]: `${VOK} ${YELD}`, [BRA]: GLA } }),
  );
  const out = (await k.export()) as { ok: true; value: string[] };
  return out.value;
}

function rowsOf(lines: readonly string[]): Map<string, { columns: string[]; rows: unknown[][] }> {
  const out = new Map<string, { columns: string[]; rows: unknown[][] }>();
  let at: { columns: string[]; rows: unknown[][] } | null = null;
  for (const line of lines) {
    if (line.startsWith('#table ')) {
      const [name = '', cols = ''] = line.slice(7).split(' ');
      at = { columns: cols.split(','), rows: [] };
      out.set(name, at);
    } else if (!line.startsWith('#') && at) at.rows.push(JSON.parse(line) as unknown[]);
  }
  return out;
}

/**
 * Where a word of the vocabulary is in a file. A long word is looked for anywhere in the bytes; a word of three to five
 * letters as a word, since any three letters turn up somewhere inside ten thousand made-up ones.
 */
function leaks(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = LONG.filter((w) => lower.includes(w));
  for (const w of SHORT) if (new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, 'u').test(lower)) found.push(w);
  if (text.includes(ARABIC)) found.push(ARABIC);
  return found;
}

/** Which rows of a column hold the same value as which, as a list of groups by position. */
function groups(values: readonly unknown[]): number[][] {
  const by = new Map<string, number[]>();
  values.forEach((v, i) => by.set(JSON.stringify(v), [...(by.get(JSON.stringify(v)) ?? []), i]));
  return [...by.values()].sort((a, b) => a[0]! - b[0]!);
}

for (const key of [new Uint8Array(32).fill(7), new Uint8Array(32).map((_, i) => i * 31)])
  test(`NO WORD OF HIS IS IN THE SHAPE COPY, AND ITS COUNTS, LENGTHS AND DUPLICATES ARE HIS (key ${key[1]})`, async () => {
    const sql = openSqlite();
    const lines = await written(sql);
    const before = lines.join('\n');
    assert.deepEqual(leaks(before).sort(), [...LONG, ...SHORT, ARABIC].sort(), 'the record holds every marked word before it is shaped');

    const shaped = await shapeBrainl(lines, { key, now: NOW });
    assert.deepEqual(leaks(shaped.join('\n')), [], 'a marked word survived the shape copy');

    const a = rowsOf(lines);
    const b = rowsOf(shaped);
    for (const [name, t] of a) {
      if (name === 'dog_sig' || name === 'dog_meta' || name === 'dog_manifest') continue;
      const u = b.get(name)!;
      assert.equal(u.rows.length, t.rows.length, `${name} keeps its count`);
      t.columns.forEach((c, j) => {
        const was = t.rows.map((r) => r[j]);
        const now = u.rows.map((r) => r[j]);
        assert.deepEqual(groups(now), groups(was), `${name}.${c} keeps its duplicates`);
        was.forEach((v, i) => {
          if (typeof v === 'string') assert.equal(String(now[i]).length, v.length, `${name}.${c} keeps its length: ${v}`);
          if (typeof v === 'number') assert.equal(String(Math.abs(Number(now[i]))).length, String(Math.abs(v)).length, `${name}.${c}`);
        });
      });
    }

    /* Sealed bytes: the same count, every one zero. */
    const sealed = (t: string, c: string): string[] => {
      const x = b.get(t)!;
      return x.rows.map((r) => (r[x.columns.indexOf(c)] as { b64: string }).b64);
    };
    for (const [t, c] of [['grant', 'ciphertext'], ['grant', 'nonce'], ['vault_key', 'wrapped'], ['vault_key', 'salt']] as const) {
      const was = (a.get(t)!.rows[0]![a.get(t)!.columns.indexOf(c)] as { b64: string }).b64;
      const now = sealed(t, c)[0]!;
      assert.equal(now.length, was.length);
      assert.match(now, /^A+=*$/, `${t}.${c} is zeros`);
      assert.notEqual(now, was);
    }

    /* The series keeps its order, and the money keeps its code. */
    const points = b.get('metric_point')!.rows.slice(0, 4).map((r) => r[3] as number);
    for (let i = 1; i < points.length; i++) assert.ok(points[i]! >= points[i - 1]!, `${points}`);
    assert.ok(shaped.join('\n').includes('"currency\\":\\"EGP\\"'));
    assert.ok(!shaped.join('\n').includes('7350981'), 'a figure in a proposal of his rows is scrambled');

    /* What the kernel writes and reads back stays: the marks of a withheld value, and the signs' own snapshot. */
    const marks = (text: string): number => text.split('--redacted--').length - 1;
    assert.ok(marks(before) > 0);
    assert.equal(marks(shaped.join('\n')), marks(before));
    const schedule = b.get('schedule')!;
    assert.ok(schedule.rows.some((r) => r[schedule.columns.indexOf('kind')] === 'snapshot' && r[schedule.columns.indexOf('key')] === 'signs'));

    /* And it still opens: every checked column holds a value its table allows. */
    const fresh = openSqlite();
    await openRecord(fresh, fixedClock(NOW), {});
    const opened = importBrainl(fresh, (fn) => fn(), shaped, { shape: true });
    assert.ok(opened.ok, JSON.stringify(opened));
    fresh.close();
    sql.close();
  });

test('THE CHECK FAILS BY ITSELF WHEN THE SCRAMBLER KEEPS HIS WORDS: his register, taken for a published one, leaks', async () => {
  const sql = openSqlite();
  const lines = await written(sql);
  const shaped = await shapeBrainl(lines, { key: new Uint8Array(32), now: NOW, published: [HIS] });
  const found = leaks(shaped.join('\n'));
  for (const w of [ZOR, QUA, VEM, BRA, GLA, MOR]) assert.ok(found.includes(w), `${w} should have been found`);
  sql.close();
});
