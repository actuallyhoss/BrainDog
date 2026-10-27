/**
 * Where the person answers a filed question, as the command prints it: `<origin>/app/<slug>/decide/<id>`, the address
 * the agent door hands an agent for the same question.
 *
 * PURE, SO NO HOST. The target is the one `target` in http.ts builds, from the same `hostKey`.
 *
 * AND EVERY DOOR OF THE COMMAND THAT FILES A QUESTION PRINTS IT: `skills sync` and `tools scan` too, over a
 * stand-in client in a temporary home, so this machine's own Claude folder and `~/.claude.json` are never read.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Client, Context } from '@braindog/client';

import { hostKey, target } from '../src/http.ts';
import { decideLink, untilAccepted } from '../src/links.ts';
import { syncSkills } from '../src/skills.ts';
import { scanTools } from '../src/tools.ts';

/* THE AGENT DOOR'S OWN LINE (`decideAt`, packages/mcp/src/index.ts), kept here word for word so the two cannot drift. */
const mcpShape = (origin: string, slug: string, id: string) => `${origin.replace(/\/+$/, '')}/app/${encodeURIComponent(slug)}/decide/${encodeURIComponent(id)}`;

const to = (typed: string) => ({ key: hostKey(typed) });

test('A KEY WITH A SLUG ANSWERS THE APP’S OWN ADDRESS, under /app and under the record', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  /* What the connect screen prints and people paste is the same record, so it is the same link. */
  assert.equal(decideLink(to('https://brain.dog/app/acme'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  assert.equal(decideLink(to('brain.dog/app/acme/'), 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
  assert.equal(decideLink(to('http://127.0.0.1:8787/acme'), 'SG3'), 'http://127.0.0.1:8787/app/acme/decide/SG3');
});

test('THE TARGET THE COMMAND REALLY HOLDS gives the same link, though its base is the origin alone', () => {
  const held = target('https://brain.dog/app/acme', { BRAINDOG_TOKEN: 'bd_x' }, '/nowhere/hosts.json');
  assert.equal(held.base, 'https://brain.dog');
  assert.equal(decideLink(held, 'SG3'), 'https://brain.dog/app/acme/decide/SG3');
});

test('NO SLUG, NO LINK: an origin alone names no record, and a guessed address would land nowhere', () => {
  assert.equal(decideLink(to('https://brain.dog'), 'SG3'), null);
  assert.equal(decideLink(to('https://brain.dog/app'), 'SG3'), null);
  assert.equal(decideLink(to('http://127.0.0.1:8787'), 'SG3'), null);
  /* A path that is not one slug is not a record either. */
  assert.equal(decideLink({ key: 'https://brain.dog/a/b' }, 'SG3'), null);
  assert.equal(decideLink({ key: 'not an address' }, 'SG3'), null);
});

test('AN EMPTY ID IS NO QUESTION TO LINK TO, as the agent door holds', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), ''), null);
});

test('THE ID IS ENCODED, so nothing in it can walk the path or open a query', () => {
  assert.equal(decideLink(to('https://brain.dog/acme'), 'a/b?c#d e'), 'https://brain.dog/app/acme/decide/a%2Fb%3Fc%23d%20e');
  assert.equal(decideLink(to('https://brain.dog/acme'), '../../admin'), 'https://brain.dog/app/acme/decide/..%2F..%2Fadmin');
});

test('THE SAME INPUTS GIVE THE AGENT DOOR’S STRING, byte for byte', () => {
  for (const [origin, slug, id] of [
    ['https://brain.dog', 'acme', 'SG3'],
    ['https://brain.dog', 'ada-kiln', '01JABCDEFGHJKMNPQRSTVWXYZ0'],
    ['http://127.0.0.1:8787', 'acme', 'a/b c'],
    ['https://self.example:8443', 'acme_2', 'SG12'],
  ] as const)
    assert.equal(decideLink(to(`${origin}/app/${slug}`), id), mcpShape(origin, slug, id));
});

test('THE SENTENCE A FILING ENDS ON carries the link, or sends the person to Decide when there is none', () => {
  assert.equal(untilAccepted(to('https://brain.dog/app/acme'), 'SG3'), 'Nothing is installed until they accept it: https://brain.dog/app/acme/decide/SG3');
  assert.equal(untilAccepted(to('http://127.0.0.1:8787'), 'SG3'), 'Nothing is installed until they accept it. Open Decide in the app.');
});

/* ── each filing prints its link ───────────────────────────────────────── */

type After = { after: (fn: () => void | Promise<void>) => void };

/** The record these filings go to: a key with a slug, so it names the record, and its links are the app's own. */
const HOST = to('https://brain.example/app/acme');
const AT = (id: string) => `https://brain.example/app/acme/decide/${id}`;

function home(t: After): string {
  const dir = mkdtempSync(join(tmpdir(), 'braindog-links-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/* Invented: a skill of an invented studio. */
const SKILL = { name: 'kiln-release', trigger: 'When a kiln build ships', body: '# Release\n\nTag it, then push.\n' };
const SKILL_BRIEF = { spoken: 'skills#1', version: 1, scope: 'global', state: 'active', name: SKILL.name, trigger: SKILL.trigger, rev: 1 };

/** A stand-in record holding one skill, that files each question as `SG7`, or joins it to `SG7` when told it is open. */
function skillsRecord(joined = false) {
  const proposed: Record<string, unknown>[] = [];
  const client = {
    get: async () => ({ ok: true, value: { id: 'e_1', register: 'skills', seq: 1, state: 'active', version: 1, fields: { kind: 'skill', rev: 1, managed: true, ...SKILL } } }),
    call: async (name: string, args: Record<string, unknown>) => {
      if (name !== 'propose') return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stand-in does not answer ${name}.` } };
      proposed.push(args);
      return { ok: true, value: joined ? { id: 'SG7', joined: true, said: 'Already waiting as SG7.' } : { id: 'SG7' } };
    },
  } as unknown as Client;
  const context = { project: null, registers: [{ id: 'skills', name: 'Skills', rows: [SKILL_BRIEF], inherited: [], truncated: false }] } as unknown as Context;
  return { client, context, proposed };
}

/** Sync once to write the skill, edit it, and sync again: the second sync files the edit as a question. */
async function editedSkill(t: After, o: { joined?: boolean; to?: { key: string } }) {
  const dir = home(t);
  const configDir = join(dir, '.claude');
  mkdirSync(configDir, { recursive: true });
  const r = skillsRecord(o.joined === true);
  const sync = () => syncSkills({ client: r.client, context: r.context, home: dir, configDir, top: null, dryRun: false, machine: 'test-machine', ...(o.to ? { to: o.to } : {}) });
  await sync();
  const path = join(configDir, 'skills', SKILL.name, 'SKILL.md');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nRun the smoke test first.\n`);
  return { lines: await sync(), path, proposed: r.proposed };
}

test('SKILLS SYNC PRINTS THE LINK to the edit it proposed, never the question’s handle alone', async (t) => {
  const { lines, path, proposed } = await editedSkill(t, { to: HOST });
  assert.equal(proposed.length, 1);
  assert.deepEqual(lines, [`Skill kiln-release was edited in ${path}; kept it and proposed it as version 2: ${AT('SG7')}`]);
});

test('AND A QUESTION ALREADY OPEN keeps the record’s sentence with the link after it', async (t) => {
  const { lines, path } = await editedSkill(t, { to: HOST, joined: true });
  assert.deepEqual(lines, [`Skill kiln-release was edited in ${path}; kept it. Already waiting as SG7. ${AT('SG7')}`]);
});

test('A SYNC HANDED NO HOST, or one whose host names no record, says the handle as before', async (t) => {
  const { lines, path } = await editedSkill(t, {});
  assert.deepEqual(lines, [`Skill kiln-release was edited in ${path}; kept it and proposed it as version 2 (SG7).`]);
  const bare = await editedSkill(t, { to: to('http://127.0.0.1:8787') });
  assert.deepEqual(bare.lines, [`Skill kiln-release was edited in ${bare.path}; kept it and proposed it as version 2 (SG7).`]);
});

type SeenAnswer = { name: string; did: string; row?: string; question?: string };

/**
 * A stand-in record with a tools list: `toolsSeen` answered as told, or refused as an older host does so the scan files
 * its own questions, each as `SG9`. `quill` is held already, started another way.
 */
function toolsRecord(seen: ((found: Record<string, unknown>[]) => SeenAnswer[]) | null) {
  const client = {
    call: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'toolsSeen')
        return seen === null ? { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: 'There is no method called toolsSeen.' } } : { ok: true, value: { tools: seen(args.found as Record<string, unknown>[]) } };
      if (name === 'propose') return { ok: true, value: { id: 'SG9' } };
      return { ok: false, refusal: { code: 'ROUTE_UNKNOWN', fix: `The stand-in does not answer ${name}.` } };
    },
    get: async () => ({ ok: true, value: { register: 'tools', seq: 1, version: 1, fields: { name: 'quill', kind: 'mcp', transport: 'stdio', command: 'npx', args: ['-y', '@example/quill-old'], needs: [] } } }),
    list: async () => ({ ok: true, value: { rows: [] } }),
    create: async () => ({ ok: true, value: { register: 'tools', seq: 2, version: 1, fields: {} } }),
    update: async () => ({ ok: true, value: { register: 'tools', seq: 1, version: 2, fields: {} } }),
  } as unknown as Client;
  return client;
}

async function scanned(t: After, o: { seen: ((found: Record<string, unknown>[]) => SeenAnswer[]) | null; servers: Record<string, unknown>; project?: boolean; held?: boolean; to?: { key: string } }) {
  const dir = home(t);
  const top = join(dir, 'repo');
  mkdirSync(top, { recursive: true });
  writeFileSync(join(dir, '.claude.json'), JSON.stringify({ mcpServers: o.servers }));
  const rows = o.held ? [{ spoken: 'tools#1', version: 1, scope: 'global', state: 'active', name: 'quill' }] : [];
  const context = {
    project: o.project ? { spoken: 'things#1', name: 'Kiln studio', mark: null, hue: null, how: 'folder' } : null,
    registers: [{ id: 'tools', name: 'Tools', rows, inherited: [], truncated: false }],
  } as unknown as Context;
  return scanTools({ client: toolsRecord(o.seen), context, top, cwd: top, home: dir, dryRun: false, deposit: null, machine: 'test-machine', now: () => Date.parse('2026-10-15T09:00:00.000Z'), ...(o.to ? { to: o.to } : {}) });
}

const stdio = (name: string) => ({ command: 'npx', args: ['-y', `@example/${name}-mcp`] });

test('TOOLS SCAN PRINTS THE LINK to each question the record asked or holds open for it', async (t) => {
  const seen = (found: Record<string, unknown>[]): SeenAnswer[] =>
    found.map((f) => (f.name === 'quill' ? { name: 'quill', did: 'asked', row: 'tools#3', question: 'SG3' } : { name: String(f.name), did: 'waiting', row: 'tools#5', question: 'SG4' }));
  const lines = await scanned(t, { seen, servers: { quill: stdio('quill'), marlin: stdio('marlin') }, to: HOST });
  assert.deepEqual(lines.sort(), [`marlin waits on a question already on Decide. ${AT('SG4')}`, `quill runs something else now; the question is on Decide. ${AT('SG3')}`]);
});

test('AND THE QUESTIONS AN OLDER HOST LEAVES TO THE SCAN: a changed start and a tool for use everywhere each carry theirs', async (t) => {
  const changed = await scanned(t, { seen: null, servers: { quill: stdio('quill') }, held: true, to: HOST });
  assert.equal(changed.length, 1, changed.join('\n'));
  assert.match(changed[0]!, /^Tool quill in ~\/\.claude\.json differs from the one in the record, .*asked on Decide: Change how quill starts\? /u);
  assert.ok(changed[0]!.endsWith(` ${AT('SG9')}`), changed[0]);
  const everywhere = await scanned(t, { seen: null, servers: { heron: stdio('heron') }, project: true, to: HOST });
  assert.equal(everywhere.length, 1, everywhere.join('\n'));
  assert.match(everywhere[0]!, /^Tool heron in ~\/\.claude\.json applies everywhere and this run is in a project, /u);
  assert.ok(everywhere[0]!.endsWith(` ${AT('SG9')}`), everywhere[0]);
});

test('A SCAN HANDED NO HOST says the question is on Decide as before, with no link it cannot build', async (t) => {
  const seen = (found: Record<string, unknown>[]): SeenAnswer[] => found.map((f) => ({ name: String(f.name), did: 'asked', row: 'tools#3', question: 'SG3' }));
  assert.deepEqual(await scanned(t, { seen, servers: { quill: stdio('quill') } }), ['quill runs something else now; the question is on Decide.']);
  /* A QUESTION GIVEN IN WORDS IS NO ID, so no address is made of it. */
  const worded = (found: Record<string, unknown>[]): SeenAnswer[] => found.map((f) => ({ name: String(f.name), did: 'asked', row: 'tools#3', question: 'Change how quill starts?' }));
  assert.deepEqual(await scanned(t, { seen: worded, servers: { quill: stdio('quill') }, to: HOST }), ['quill runs something else now; the question is on Decide.']);
});
