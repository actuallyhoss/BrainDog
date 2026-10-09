/**
 * `braindog private-terms`: the private list written from a record, read through its declarations, mode 600, never
 * printed, and found by `public-clean` where the gate looks for it.
 *
 * THE RECORD IS A TEST ONE, IN MEMORY: People declaring `meets:` with the owner marked, a list with the digits a bank
 * prints, and one device grant. Every name in it is from `fixtures/names.ts`, so nothing here is anybody's.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ACCOUNTS, CARD_TAILS, FIGURES, MACHINES, OWNER, PEOPLE } from '../../../fixtures/names.ts';
import { amountForms, bareKey, merged, ownDomain, privateTermsCommand, termsFile, type Reader } from '../src/private-terms.ts';
import type { AgentIo } from '../src/skills.ts';

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'braindog-terms-')));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const folder = (): string => {
  const dir = join(scratch, `t${String(n++)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const TEO = PEOPLE[2]!;
const WREN = PEOPLE[6]!;
const HERE = { network: `${MACHINES[1]}.local`, login: OWNER.handle };

/** A test record: what `boot`, `schema`, `list` and `listDevices` answer, with the owner marked or not. */
function record(o: { marked?: boolean; devices?: boolean } = {}): Reader {
  const decls: Record<string, unknown> = {
    people: { id: 'people', meets: { name: 'name', email: 'email', aliases: 'aliases', keys: 'keys', handles: 'handles', self: 'self' }, fields: [{ id: 'name', type: 'text' }] },
    accounts: { id: 'accounts', fields: [{ id: 'name', type: 'text' }, { id: 'balance', type: 'money' }, { id: 'last4', type: 'text' }] },
    notes: { id: 'notes', fields: [{ id: 'title', type: 'text' }] },
  };
  const rows: Record<string, unknown[]> = {
    people: [
      { fields: { name: OWNER.name, email: OWNER.email, aliases: [OWNER.name.split(' ')[0]], keys: [`email:${OWNER.email}`, 'github:maralind'], handles: ['@mlq'], self: o.marked !== false } },
      { fields: { name: TEO.name, email: TEO.email, handles: [TEO.handle], self: false } },
      { fields: { name: WREN.name, email: WREN.email, self: false } },
    ],
    accounts: [
      { fields: { name: 'Everyday', last4: CARD_TAILS[0], balance: FIGURES.balance } },
      { fields: { name: 'Coins', last4: CARD_TAILS[1], balance: FIGURES.refund } },
    ],
    notes: [{ fields: { title: 'Nothing private here' } }],
  };
  const reader = {
    boot: async () => ({ ok: true, value: { registers: Object.keys(decls).map((id) => ({ id, name: id, count: 1 })), now: '2026-10-09T09:00:00Z', me: { name: OWNER.name } } }),
    schema: async (id: string) => ({ ok: true, value: decls[id] }),
    list: async (a: { register: string }) => ({ ok: true, value: { rows: rows[a.register] ?? [], cursor: null } }),
    listDevices: async () =>
      o.devices === false ? { ok: false, refusal: { code: 'FORBIDDEN', message: 'Only the owner can list devices.' } } : {
            ok: true,
            /* The second was asked for and never approved: anybody can ask, under any label. */
            value: [
              { handle: 'd1', label: `${MACHINES[0]} · braindog-cli`, approved_at: '2026-10-01T09:00:00Z' },
              { handle: 'd2', label: `${MACHINES[2]} · braindog-cli`, approved_at: null },
            ],
          },
  };
  return reader as unknown as Reader;
}

/** A terminal that keeps what was said, and a home and a list file of its own. */
function terminal(cwd = folder()) {
  const out: string[] = [];
  const said: string[] = [];
  const file = join(cwd, 'home', '.braindog', 'private-terms.txt');
  const io: AgentIo = { env: { BRAINDOG_PRIVATE_TERMS: file }, cwd, home: join(cwd, 'home'), out: (l) => out.push(l), say: (l) => said.push(l), headers: async () => ({}) };
  return { io, out, said, file };
}

const termsIn = (file: string): string[] => readFileSync(file, 'utf8').split('\n').filter((l) => l !== '' && !l.startsWith('#'));

test('THE LIST IS THE OWNER’S OWN WORDS FROM THE RECORD: his names, addresses, domain and handles, people by whole name, his machines, his accounts', async () => {
  const t = terminal();
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0, t.said.join('\n'));
  const terms = termsIn(t.file);
  for (const want of [OWNER.name, 'Mara', OWNER.email, 'lindqvist.example', 'maralind', 'mlq', TEO.name, TEO.email, WREN.email, MACHINES[0], HERE.network, MACHINES[1], CARD_TAILS[0], CARD_TAILS[1], '18730.45', '18,730.45', '1873045'])
    assert.ok(terms.includes(want), `${want} is not in the list`);
  /* A first name alone is everybody's, somebody else's handle may be a common word, and a small amount is in every price list. */
  for (const never of [WREN.name, TEO.handle, '42.50', 'Nothing private here', MACHINES[2]])assert.equal(terms.includes(never), false, `${never} is in the list`);
  /* Each term once, in any letter case. */
  assert.equal(new Set(terms.map((x) => x.toLowerCase())).size, terms.length);
});

test('NO TERM IS EVER PRINTED, and the file is readable by its owner alone', async () => {
  const t = terminal();
  /* A part file a cut run left, readable by anybody: the words never land in it. */
  mkdirSync(join(t.io.home, '.braindog'), { recursive: true });
  writeFileSync(`${t.file}.tmp`, 'half\n', { mode: 0o644 });
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0);
  assert.equal(statSync(t.file).mode & 0o777, 0o600);
  assert.equal(existsSync(`${t.file}.tmp`), false);
  const printed = [...t.out, ...t.said].join('\n').toLowerCase();
  for (const term of termsIn(t.file)) assert.equal(printed.includes(term.toLowerCase()), false, 'a term was printed');
  assert.match(t.out.join('\n'), /^Your private list holds \d+ terms, \d+ of them new/u);
});

test('A LINE ALREADY IN THE FILE STAYS, and a second run adds only what is new', async () => {
  const t = terminal();
  mkdirSync(join(t.io.home, '.braindog'), { recursive: true });
  writeFileSync(t.file, `# mine\n${ACCOUNTS[2]}\n${OWNER.name.toUpperCase()}\n`, { mode: 0o644 });
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0);
  const first = readFileSync(t.file, 'utf8');
  assert.ok(first.startsWith(`# mine\n${ACCOUNTS[2]}\n${OWNER.name.toUpperCase()}\n`), first.slice(0, 80));
  assert.equal(first.split('\n').filter((l) => l.toLowerCase() === OWNER.name.toLowerCase()).length, 1, 'the name went in twice');
  assert.equal(statSync(t.file).mode & 0o777, 0o600, 'a looser file was left loose');
  t.out.splice(0);
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0);
  assert.equal(readFileSync(t.file, 'utf8'), first);
  assert.match(t.out[0]!, /, 0 of them new/u);
});

test('--dry-run COUNTS AND WRITES NOTHING', async () => {
  const t = terminal();
  assert.equal(await privateTermsCommand(['--dry-run'], t.io, record(), HERE), 0);
  assert.equal(existsSync(t.file), false);
  assert.match(t.out[0]!, /^A run would leave your private list holding \d+ terms, \d+ of them new\. Nothing was written/u);
});

test('THE ACCOUNT THE REPOSITORY IS PUBLISHED UNDER IS LEFT OUT, read from the folder’s own origin', async () => {
  const cwd = folder();
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:MaraLind/braindog.git'], { cwd });
  const t = terminal(cwd);
  /* A run from outside the repository put it in; a run inside takes it out, and keeps the line he typed. */
  mkdirSync(join(t.io.home, '.braindog'), { recursive: true });
  writeFileSync(t.file, `${ACCOUNTS[2]}\nmaralind\n`);
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0);
  assert.equal(termsIn(t.file).includes('maralind'), false);
  assert.ok(termsIn(t.file).includes(ACCOUNTS[2]));
  assert.ok(termsIn(t.file).includes('mlq'));
  assert.equal(t.said.some((l) => l.includes('no published repository')), false);
});

test('WHAT COULD NOT BE READ IS SAID, and the rest is still written', async () => {
  const t = terminal();
  assert.equal(await privateTermsCommand([], t.io, record({ marked: false, devices: false }), HERE), 0);
  assert.ok(t.said.includes('Not in it: People does not say which person is you yet.'), t.said.join('\n'));
  assert.ok(t.said.includes('Not in it: the signed-in machines could not be read.'), t.said.join('\n'));
  const terms = termsIn(t.file);
  /* Not marked, so his first name alone and his handles are nobody's in particular; his whole name and address stay. */
  assert.equal(terms.includes('Mara'), false);
  assert.ok(terms.includes(OWNER.name) && terms.includes(TEO.name) && terms.includes(HERE.network));
});

test('A RECORD THAT REFUSES IS SAID AND NOTHING IS WRITTEN, and a flag it does not know is the usage', async () => {
  const t = terminal();
  const refusing = { ...record(), boot: async () => ({ ok: false, refusal: { code: 'UNAUTHENTICATED', message: 'Sign in first.', fix: 'Run braindog login.' } }) } as unknown as Reader;
  assert.equal(await privateTermsCommand([], t.io, refusing, HERE), 1);
  assert.equal(existsSync(t.file), false);
  assert.equal(await privateTermsCommand(['--print'], t.io, record(), HERE), 1);
  assert.ok(t.said.at(-1)!.startsWith('usage: braindog private-terms'));
});

test('THE PARTS: a key without its kind, a domain that says whose, a balance in the forms a file carries it, and merging', () => {
  assert.equal(bareKey('github:ada'), 'ada');
  assert.equal(bareKey('@ada'), 'ada');
  assert.equal(bareKey('https://ada.example'), 'https://ada.example');
  assert.equal(ownDomain(OWNER.email), 'lindqvist.example');
  assert.equal(ownDomain('someone@gmail.com'), null);
  assert.deepEqual(amountForms(-FIGURES.rent.amount), ['3400.00', '3,400.00', '340000']);
  assert.deepEqual(amountForms(99_99), []);
  const m = merged(null, ['Ada', 'ada', 'Lovelace'], 'lovelace');
  assert.deepEqual([m.added, m.total], [1, 1]);
  assert.ok(m.text.startsWith('# '));
});

test('PUBLIC-CLEAN FINDS THE LIST WHERE THIS WRITES IT, and names a planted term’s line and never the term', async () => {
  const t = terminal();
  assert.equal(await privateTermsCommand([], t.io, record(), HERE), 0);
  const gate = (await import(String(new URL('../../../tools/gates/public-clean.mjs', import.meta.url)))) as {
    privateTermsFile: () => string;
    privateTerms: (file?: string) => { term: string; at: number }[] | null;
    termHits: (text: string, terms: { term: string; at: number }[]) => { line: number; at: number }[];
  };
  const was = process.env.BRAINDOG_PRIVATE_TERMS;
  process.env.BRAINDOG_PRIVATE_TERMS = t.file;
  try {
    assert.equal(gate.privateTermsFile(), termsFile(t.io.env, t.io.home));
  } finally {
    if (was === undefined) delete process.env.BRAINDOG_PRIVATE_TERMS;
    else process.env.BRAINDOG_PRIVATE_TERMS = was;
  }
  const terms = gate.privateTerms(t.file)!;
  const hits = gate.termHits(`const ok = 1;\nconst card = 'ends ${CARD_TAILS[0]}';\nconst who = '${TEO.name}';\n`, terms);
  assert.deepEqual(hits.map((h) => h.line), [2, 3]);
  assert.equal(JSON.stringify(hits).includes(CARD_TAILS[0]), false);
});
