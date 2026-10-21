/**
 * `braindog export --mirror <folder>` (AGT-A13) on the seed record, served over HTTP as a host serves the three reads an
 * agent uses: `boot` for the record's own index, `schema` for a list's fields, `list` page by page.
 *
 * THE HOST HERE STANDS IN FOR A SIGN-IN, so it can hold one list back, as the record does to a sign-in that may not
 * read it, and it answers a key's field with a grant's id, as the vault leaves it, so "no file holds a sealed value"
 * is a search for that id and not a hope. Every value is made up.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openRecord, type Kernel } from '@braindog/kernel';
import { installSeed } from '@braindog/seed';

import { fixedClock, openSqlite } from '../../../packages/kernel/test/sqlite.ts';
import { exportMirror, MIRROR_PAGE } from '../src/mirror-read.ts';
import { mirrorFiles, moneyText } from '../src/mirror.ts';

const NOW = Date.UTC(2026, 9, 14, 9);
const ACTOR = 'p_seed';
/** What the vault leaves in a key's field: a grant's id, never the key. Made up. */
const GRANT = 'g_01JZ8QK3F7R2M9V4XN6TCB5HAD';

/** A field's name as the mirror says it. */
const said = (f: { id: string; label?: string }) => f.label ?? `${f.id.charAt(0).toUpperCase()}${f.id.slice(1).replace(/_/gu, ' ')}`;

type Call = (a: Record<string, unknown>) => Promise<unknown>;

/** The seed record behind a host, holding back the lists in `held`. */
async function host(t: { after: (f: () => unknown) => void }, held: ReadonlySet<string> = new Set()) {
  const sql = openSqlite();
  const kernel: Kernel = await openRecord(sql, fixedClock(NOW));
  const seeded = await installSeed(kernel);
  assert.ok(seeded.ok, JSON.stringify(seeded));
  const no = (code: string, fix: string) => ({ ok: false, refusal: { code, fix } });
  const secrets = (register: string) => (kernel.register(register)?.fields ?? []).filter((f) => f.type === 'secret').map((f) => f.id);
  const calls: Record<string, Call> = {
    boot: async () => ({ ok: true, value: { registers: [...kernel.registers()].map(([id, d]) => ({ id, name: d.name, count: 0, icon: null })) } }),
    schema: async (a) => {
      const decl = kernel.register(String(a.register));
      return decl ? { ok: true, value: decl } : no('REGISTER_UNKNOWN', `There is no list called ${String(a.register)}.`);
    },
    list: async (a) => {
      const register = String(a.register);
      if (held.has(register)) return no('FORBIDDEN', 'This sign-in may not read that list.');
      const got = await kernel.list({ register, limit: Number(a.limit), ...(typeof a.cursor === 'string' ? { cursor: a.cursor } : {}) } as never);
      if (!got.ok) return got;
      const rows = got.value.rows.map((r) => ({ ...r, fields: { ...r.fields, ...Object.fromEntries(secrets(register).map((id) => [id, GRANT])) } }));
      return { ok: true, value: { ...got.value, rows } };
    },
  };
  const reads: string[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub');
    const method = url.pathname.replace(/^\/api\//u, '');
    reads.push(method);
    let text = '';
    req.on('data', (c: Buffer) => (text += c.toString('utf8')));
    req.on('end', () => {
      const args = text ? (JSON.parse(text) as Record<string, unknown>) : Object.fromEntries(url.searchParams);
      const call = calls[method];
      void (call ? call(args) : Promise.resolve(no('ROUTE_UNKNOWN', method))).then((answer) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  t.after(() => sql.close());
  const dir = mkdtempSync(join(tmpdir(), 'bd-mirror-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out: string[] = [];
  const said: string[] = [];
  const answers: unknown[] = [];
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const io = { env: { BRAINDOG_HOST: base }, cwd: dir, file: join(dir, 'hosts.json'), out: (l: string) => out.push(l), say: (l: string) => said.push(l), answer: (a: unknown) => answers.push(a), now: () => NOW };
  const run = () => exportMirror(['--mirror', 'mirror'], io);
  return { kernel, dir, folder: join(dir, 'mirror'), io, out, said, answers, reads, run };
}

/** Every file under a folder, by its path inside it. */
function tree(dir: string, at = ''): string[] {
  return readdirSync(join(dir, at), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tree(dir, join(at, e.name)) : [join(at, e.name)])).sort();
}

/** A list of the seed with a money field a person picks the currency of, and its first such field. */
function freeMoney(kernel: Kernel): { list: string; field: string; title: string } {
  for (const [id, d] of kernel.registers()) {
    const money = d.fields.find((f) => f.type === 'money' && !f.currency_fixed);
    const others = d.fields.filter((f) => f.required && f.id !== d.title && f.id !== money?.id);
    if (money && others.length === 0) return { list: id, field: money.id, title: d.title };
  }
  throw new Error('The seed has no list with a money field of a currency a person picks.');
}

/** A list of the seed with a document field, and that field. */
function withDocument(kernel: Kernel): { list: string; field: string; title: string } {
  for (const [id, d] of kernel.registers()) {
    const doc = d.fields.find((f) => f.type === 'document' && !f.required);
    if (doc && !d.fields.some((f) => f.required && f.id !== d.title)) return { list: id, field: doc.id, title: d.title };
  }
  throw new Error('The seed has no list with a document field.');
}

test('the seed record: a README, a folder for each list, a file for each live row, a deleted one has none', async (t) => {
  const h = await host(t);
  const lists = [...h.kernel.registers()].map(([id]) => id);
  /* ONE ROW DELETED BEFORE THE MIRROR, so its file is never written. */
  const some = lists.find((id) => typeof h.kernel.register(id)?.seq_prefix !== 'string')!;
  const before = await h.kernel.list({ register: some, limit: 500 });
  assert.ok(before.ok && before.value.rows.length > 1);
  const gone = before.value.rows[0]!;
  assert.ok((await h.kernel.update(some, `${some}#${String(gone.seq)}`, { deleted_at: 'now' }, { actor: ACTOR })).ok);

  assert.equal(await h.run(), 0, h.said.join('\n'));
  assert.ok(existsSync(join(h.folder, 'README.md')));
  const top = readFileSync(join(h.folder, 'README.md'), 'utf8');
  assert.match(top, /Written on 2026-10-14\./u);
  let live = 0;
  for (const id of lists) {
    const got = await h.kernel.list({ register: id, limit: 500 });
    assert.ok(got.ok);
    const decl = h.kernel.register(id)!;
    assert.ok(existsSync(join(h.folder, id, 'README.md')), `${id} has its README`);
    const readme = readFileSync(join(h.folder, id, 'README.md'), 'utf8');
    assert.ok(readme.includes(`${decl.name} holds ${String(got.value.rows.length)}.`), readme);
    /* ITS FIELDS IN DECLARED ORDER. */
    const named = decl.fields.filter((f) => !f.retired).map((f) => readme.indexOf(`- ${said(f)}: `));
    assert.deepEqual(named, [...named].sort((a, b) => a - b), `${id}'s fields are in order`);
    assert.ok(top.includes(`[${decl.name}](${id}/README.md): ${String(got.value.rows.length)}`), `${id} is in the top README`);
    for (const r of got.value.rows) if (typeof r.seq === 'number') assert.ok(existsSync(join(h.folder, id, `${String(r.seq)}.md`)), `${id} ${String(r.seq)}`);
    live += got.value.rows.length;
  }
  assert.ok(!existsSync(join(h.folder, some, `${String(gone.seq)}.md`)), 'a deleted row has no file');
  assert.match(h.out.join('\n'), new RegExp(`^Mirrored ${String(lists.length)} lists, ${String(live)} in all\\. \\d+ files changed since the folder was last written\\.$`, 'u'));
  /* NO PATH AND NO HOST IN WHAT A PERSON READS. */
  assert.ok(!h.out.join('\n').includes(h.dir) && !h.out.join('\n').includes('127.0.0.1'));
});

test('money in its own currency and decimals, a document byte for byte, a link by list, number and title', async (t) => {
  const h = await host(t);
  const m = freeMoney(h.kernel);
  const yen = await h.kernel.create(m.list, { [m.title]: 'Yen invoice', [m.field]: { amount: 150_000, currency: 'JPY' } }, { actor: ACTOR });
  const dinar = await h.kernel.create(m.list, { [m.title]: 'Dinar invoice', [m.field]: { amount: 1_250, currency: 'KWD' } }, { actor: ACTOR });
  assert.ok(yen.ok && dinar.ok, JSON.stringify([yen, dinar]));
  const d = withDocument(h.kernel);
  const doc = '# Plan\n\nFirst line,  two spaces.\n\n- a | pipe\n- **bold**\t tab\n\n```\ncode\n```\n';
  const note = await h.kernel.create(d.list, { [d.title]: 'A note kept whole', [d.field]: doc }, { actor: ACTOR });
  assert.ok(note.ok, JSON.stringify(note));

  assert.equal(await h.run(), 0, h.said.join('\n'));
  const label = (list: string, field: string) => said(h.kernel.register(list)!.fields.find((f) => f.id === field)!);
  const yenFile = readFileSync(join(h.folder, m.list, `${String(yen.value.seq)}.md`), 'utf8');
  const dinarFile = readFileSync(join(h.folder, m.list, `${String(dinar.value.seq)}.md`), 'utf8');
  assert.ok(yenFile.includes(`${label(m.list, m.field)}: JPY 150,000\n`), yenFile);
  assert.ok(dinarFile.includes(`${label(m.list, m.field)}: KWD 1.250\n`), dinarFile);
  assert.equal(moneyText(129_900, 'EGP'), 'EGP 1,299.00');
  assert.equal(moneyText(-5, 'USD'), 'USD -0.05');

  const noteFile = readFileSync(join(h.folder, d.list, `${String(note.value.seq)}.md`), 'utf8');
  assert.ok(noteFile.includes(`\n## ${label(d.list, d.field)}\n\n${doc}`), noteFile);

  /* A LINK SAYS THE OTHER ROW'S LIST, NUMBER AND TITLE, never its id. */
  for (const id of tree(h.folder)) assert.doesNotMatch(readFileSync(join(h.folder, id), 'utf8'), /\b[0-9A-HJKMNP-TV-Z]{26}\b/u, `${id} holds no id`);
  const [list, decl] = [...h.kernel.registers()].find(([, x]) => x.fields.some((f) => f.type === 'ref' && f.to !== undefined))!;
  const ref = decl.fields.find((f) => f.type === 'ref' && f.to !== undefined)!;
  const rows = await h.kernel.list({ register: list, limit: 500 });
  assert.ok(rows.ok);
  const pointing = rows.value.rows.find((r) => typeof r.fields[ref.id] === 'string');
  if (pointing) {
    assert.match(readFileSync(join(h.folder, list, `${String(pointing.seq)}.md`), 'utf8'), new RegExp(`${said(ref)}: ${h.kernel.register(ref.to!)!.name} [A-Z#]+\\d+, `, 'u'));
  }
});

test('a second run changes no file; a change is one file; a list added later appears, read past one page', async (t) => {
  const h = await host(t);
  assert.equal(await h.run(), 0, h.said.join('\n'));
  const first = new Map(tree(h.folder).map((p) => [p, readFileSync(join(h.folder, p), 'utf8')]));
  /* A FILE OF THE PERSON'S OWN, AND GIT'S, ARE NEVER TOUCHED. */
  writeFileSync(join(h.folder, 'notes.txt'), 'mine');
  writeFileSync(join(h.folder, '.gitignore'), '*.tmp\n');

  assert.equal(await h.run(), 0);
  assert.match(h.out.at(-1)!, / 0 files changed since the folder was last written\.$/u);
  for (const [p, text] of first) assert.equal(readFileSync(join(h.folder, p), 'utf8'), text, `${p} is unchanged`);

  /* ONE ROW CHANGED IS ONE FILE CHANGED. Not its title, which every link to it says too. */
  const m = freeMoney(h.kernel);
  /* THE SEED MAY LEAVE THIS LIST EMPTY (Key numbers starts with no rows): the row to change is one of the test's own. */
  const made = await h.kernel.create(m.list, { [m.title]: 'Row to change', [m.field]: { amount: 100, currency: 'EUR' } }, { actor: ACTOR });
  assert.ok(made.ok, JSON.stringify(made));
  const seq = made.value.seq!;
  assert.equal(await h.run(), 0);
  assert.ok((await h.kernel.update(m.list, `${m.list}#${String(seq)}`, { [m.field]: { amount: 4_242, currency: 'EUR' } }, { actor: ACTOR })).ok);
  assert.equal(await h.run(), 0);
  assert.match(h.out.at(-1)!, / 1 file changed since the folder was last written\.$/u);
  assert.match(readFileSync(join(h.folder, m.list, `${String(seq)}.md`), 'utf8'), /: EUR 42\.42\n/u);

  /* A LIST INSTALLED AFTER THE FIRST MIRROR, WITH MORE ROWS THAN ONE PAGE: no list of lists in the code. */
  const later = { id: 'register.mirror_later', kind: 'register', body: { id: 'mirror_later', name: 'Later notes', title: 'what', fields: [{ id: 'what', type: 'text', required: true }] } } as never;
  assert.ok((await h.kernel.install([later])).ok);
  const many = MIRROR_PAGE + 7;
  for (let i = 1; i <= many; i++) assert.ok((await h.kernel.create('mirror_later', { what: `Note ${String(i)}` }, { actor: ACTOR })).ok);
  assert.equal(await h.run(), 0);
  assert.equal(readdirSync(join(h.folder, 'mirror_later')).filter((f) => /^\d+\.md$/u.test(f)).length, many);
  assert.ok(readFileSync(join(h.folder, 'README.md'), 'utf8').includes(`[Later notes](mirror_later/README.md): ${String(many)}`));
  assert.ok(h.reads.filter((r) => r === 'list').length > 1);

  /* A ROW DELETED SINCE: its file goes, and nothing else. */
  assert.ok((await h.kernel.update('mirror_later', 'mirror_later#3', { deleted_at: 'now' }, { actor: ACTOR })).ok);
  assert.equal(await h.run(), 0);
  assert.ok(!existsSync(join(h.folder, 'mirror_later', '3.md')));
  assert.equal(readFileSync(join(h.folder, 'notes.txt'), 'utf8'), 'mine');
  assert.equal(readFileSync(join(h.folder, '.gitignore'), 'utf8'), '*.tmp\n');
});

test('a list this sign-in may not read is named as not read, and its files are kept; no file holds a sealed value', async (t) => {
  const keys = [...(await (async () => {
    const sql = openSqlite();
    const k = await openRecord(sql, fixedClock(NOW));
    assert.ok((await installSeed(k)).ok);
    const ids = [...k.registers()].filter(([, d]) => d.fields.some((f) => f.type === 'secret')).map(([id]) => id);
    sql.close();
    return ids;
  })())];
  assert.ok(keys.length > 0, 'the seed has a list of keys');
  const open = await host(t);
  assert.equal(await open.run(), 0);
  for (const p of tree(open.folder)) assert.ok(!readFileSync(join(open.folder, p), 'utf8').includes(GRANT), `${p} holds no grant`);
  const keyFiles = readdirSync(join(open.folder, keys[0]!)).filter((f) => /^\d+\.md$/u.test(f));
  assert.ok(keyFiles.length > 0);
  assert.match(readFileSync(join(open.folder, keys[0]!, keyFiles[0]!), 'utf8'), /: sealed\n/u);

  /* THE SAME FOLDER, READ BY A SIGN-IN THAT MAY NOT READ THE KEYS. */
  const held = await host(t, new Set(keys));
  held.io.cwd = open.dir;
  assert.equal(await held.run(), 0, held.said.join('\n'));
  const name = held.kernel.register(keys[0]!)!.name;
  const top = readFileSync(join(open.folder, 'README.md'), 'utf8');
  assert.ok(top.includes(`- ${name}: not read. This sign-in may not read that list.`), top);
  assert.match(held.out.at(-1)!, new RegExp(`Not read: ${name}\\.$`, 'u'));
  for (const f of keyFiles) assert.ok(existsSync(join(open.folder, keys[0]!, f)), 'a list not read keeps its files');
});

test('two mirrors of one record are the same bytes, whatever order the reads answered in', () => {
  const lists = [
    { id: 'b', name: 'Bees', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'hive', type: 'ref', to: 'a' }] },
    { id: 'a', name: 'Hives', title: 'name', fields: [{ id: 'name', type: 'text' }, { id: 'old', type: 'text', retired: true }] },
  ];
  const rows: Record<string, { id: string; seq: number; fields: Record<string, unknown> }[]> = {
    a: [{ id: 'h2', seq: 2, fields: { name: 'East', old: 'never written' } }, { id: 'h1', seq: 1, fields: { name: 'West' } }],
    b: [{ id: 'b1', seq: 1, fields: { name: 'Queen', hive: 'h2' } }],
  };
  const one = mirrorFiles(lists, (id) => rows[id]!, '2026-10-14');
  const two = mirrorFiles([...lists].reverse(), (id) => [...rows[id]!].reverse(), '2026-10-14');
  assert.deepEqual([...one], [...two].sort(([x], [y]) => [...one.keys()].indexOf(x) - [...one.keys()].indexOf(y)));
  assert.equal(one.get('b/1.md'), '# Queen\n\nBees #1\n\nName: Queen\nHive: Hives #2, East\n');
  assert.ok(!one.get('a/2.md')!.includes('never written'));
});
