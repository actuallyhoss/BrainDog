/**
 * The card an agent starts from, on the Cloud: the card the start hook prints and the card `context` answers over
 * `/mcp` are one text, drawn by the record in a Durable Object.
 *
 * WHY THIS FILE EXISTS. The card is composed in the record (`packages/record/src/card.ts`, `carded` in `briefing()`),
 * and what held it was the record over `node:sqlite` (`packages/record/test/card.test.ts`) and the hook's own printer
 * over a hand-made context (`apps/cli/test/brief.test.ts`). Nobody had watched workerd answer `attach`, then `/mcp`
 * `context`, then `/api/context` for one run, and compared what the three said.
 *
 * WHAT RUNS, AND NOTHING IN THE MIDDLE IS A DOUBLE. Built the way `shortcut-in-do.test.ts` builds it: `src/index.ts`
 * bundled by `wrangler`'s own esbuild with `cloudflare:workers` left for workerd, Miniflare serving both Durable Objects
 * on SQLite storage, a record made by `POST /auth/provision`, its owner signed in by spending the claim link, Solo
 * founder installed, a project that lists the repository's remote, and a key minted through `/api/createToken`. The
 * agent's calls carry the headers the command line itself makes (`sessionHeaders`), and the card "the start hook
 * prints" is the hook's own `briefing()` over the `attach` answer, as `hooks.ts` prints it.
 *
 * A STEP EIGHT DAYS OLD NEEDS A CLOCK EIGHT DAYS BACK, and workerd's is the wall's. So a second Worker is booted from a
 * scratch bundle whose record reads its clock through one seam: a request carrying `x-in-do-clock-days` moves the
 * record's `now` that many days for that request, and every other request reads the wall. Only the run that leaves the
 * step sends it. The first Worker is the bundle as it ships, with no seam, and holds every case but that one. A rewrite
 * that no longer finds its line throws, so the seam is never quietly missing.
 *
 * RED FIRST, MEASURED as `shortcut-in-do.test.ts` measured its own, over scratch bundles that rewrite one line before
 * building. `CARD_MUTANT` picks which:
 *   - `mcp-own-card`: `context` over `/mcp` prints the card its own composer draws instead of the record's
 *     (`if (told !== null) said = told;` in `packages/mcp/src/briefing.ts` gone).
 *   - `stale-step`: the briefing hands over the newest open step whatever its age (`open.find(... 'next')` read as
 *     `open[0]` in `packages/record/src/index.ts`).
 *   - `uncapped`: the card's cap is gone (`CARD_MOST` read as no number at all in `packages/record/src/card.ts`).
 *
 * Measured: `mcp-own-card` turned the three card cases red ("context over /mcp said another card than the start hook
 * printed"), `stale-step` the seven-day case ("a step eight days old was handed over", age 691,200 seconds), and
 * `uncapped` the 150-word case ("156 words"). SINCE THE CAP FELL TO 130 AND EACH SLOT IS CUT TO ITS OWN LENGTH, `uncapped`
 * turns nothing here red (21 October, checked): no case reaches the cap. The cap is held in the record's own tests
 * (`card-next-lines`, `card-stale`, `card-lived`), which read `CARD_MOST`.
 *
 * WHAT IT FOUND AT HEAD: the three said one card, 51 words, and the step eight days old was no Next line. The card on a
 * record set up with Solo founder and nothing else carried a Signs line, "1 read red: Pages draw without errors. 2 pages print
 * something raw: Overview, Money.", so a fresh record's card is line one, Signs and More, not line one and More as the
 * scope's "Done when" says. The sign is not this file's to judge, so no case pins it either way. And a task handed to the
 * agent never reached its Next line on a real record, until the briefing carried the field the list's hand.agent names.
 *
 * THE AGENTS OVERHAUL (agents and MCP plan §3) GAVE AN AGENT'S KEY THE PLAN'S CARD: no More line (this is context), no
 * Signs (the app shows them), and the two-sessions warning a line of the card. For a while the record still answered
 * `card` from `card.ts` and only `plan_card` from the plan, so the start hook printed one card and `context` over `/mcp`
 * said another, and the two-sessions warning reached the agent only if it called `context`. Now all three are the plan's.
 *
 * EVERY ANSWER OF 500 OR MORE IS COUNTED, as there.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type Attached, type Client, type Context } from '../../../packages/client/src/index.ts';
import { TWO_SESSIONS, wordCount } from '../../../packages/record/src/card.ts';
import { PLAN_CARD_LINES } from '../../../packages/record/src/context-plan.ts';
import { briefing, nextLine } from '../../../apps/cli/src/brief.ts';
import { sessionHeaders, type Position } from '../../../apps/cli/src/position.ts';

const fromWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'));
const esbuild = fromWrangler('esbuild') as { build(o: object): Promise<{ outputFiles: { text: string }[] }> };
const { Miniflare, convertV4MiniflareOptions } = (await import(pathToFileURL(fromWrangler.resolve('miniflare')).href)) as {
  Miniflare: new (o: object) => { ready: Promise<URL>; dispose(): Promise<void> };
  convertV4MiniflareOptions(o: object): object;
};

const HOST = 'app.example.test';
const ORIGIN = `https://${HOST}`;
/* NOT SECRETS. They guard a Worker that lives in this process for a second or two. */
const PROVISION_KEY = 'card-in-do-operator-key-not-a-secret';
const SESSION_SECRET = 'card-in-do-session-secret-not-a-secret-0123456789';
const DAY_MS = 86_400_000;

/** Where the agent stands, as `positionOf` would read a checkout of Kiln on a MacBook. */
const AT: Position = {
  cwd: '/Users/sam/Developer/kiln',
  repo: 'kiln',
  remote: 'https://github.com/sam/kiln.git',
  host: 'Sams-MacBook-Pro.local',
  branch: 'main',
  head: null,
};
const STEP = 'Cut the release notes for Kiln to one page and send them to Mara.';

/** One line of a file, rewritten in a scratch bundle: written whole, so a reshuffle makes the build throw. */
type Rewrite = { file: RegExp; from: string; to: string };

const WORKER_INDEX = /[\\/]apps[\\/]worker[\\/]src[\\/]index\.ts$/;
/**
 * THE CLOCK SEAM, two lines of `Record$`: its `fetch` reads `x-in-do-clock-days` into a global before anything else,
 * and the record's clock adds it. Absent, the global is 0 and the clock is the wall's.
 */
const SEAM: Rewrite[] = [
  {
    file: WORKER_INDEX,
    from: 'override async fetch(request: Request): Promise<Response> {\n    const out = await this.#answer(request);',
    to: "override async fetch(request: Request): Promise<Response> {\n    (globalThis as { inDoSkew?: number }).inDoSkew = Number(request.headers.get('x-in-do-clock-days') ?? 0) * 86_400_000;\n    const out = await this.#answer(request);",
  },
  {
    file: WORKER_INDEX,
    from: 'clock: { now: () => Date.now() },\n        scheduler: this.#alarm,',
    to: 'clock: { now: () => Date.now() + ((globalThis as { inDoSkew?: number }).inDoSkew ?? 0) },\n        scheduler: this.#alarm,',
  },
];

/** The scratch rewrites the red was measured with: see the header. */
const MUTANTS: Record<string, Rewrite> = {
  'mcp-own-card': { file: /[\\/]packages[\\/]mcp[\\/]src[\\/]briefing\.ts$/, from: '  if (told !== null) said = told;\n', to: '\n' },
  'stale-step': {
    file: /[\\/]packages[\\/]record[\\/]src[\\/]index\.ts$/,
    from: "const first = nextOf(open, aheadOf(hints));\n    const handoff: Context['handoff'] = first",
    to: "const first = open[0];\n    const handoff: Context['handoff'] = first",
  },
  uncapped: { file: /[\\/]packages[\\/]record[\\/]src[\\/]card\.ts$/, from: 'export const CARD_MOST = 130;', to: 'export const CARD_MOST = Number.POSITIVE_INFINITY;' },
};
const mutant = process.env.CARD_MUTANT;

/** One Worker in workerd, and its address. */
type Worker = { mf: InstanceType<typeof Miniflare>; base: string };
let shipped: Worker | undefined;
let aged: Worker | undefined;
/** Every answer of 500 or more this file was given, with its path and body. */
const fives: string[] = [];
let asked = 0;

/** `fetch`, with every answer counted and each one of 500 or more kept. */
async function counted(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  asked++;
  if (res.status >= 500) fives.push(`${String(res.status)} ${String(input)}: ${await res.clone().text()}`);
  return res;
}

/** `src/index.ts` bundled with these rewrites, each found exactly once in its file or the build throws. */
async function boot(rewrites: Rewrite[]): Promise<Worker> {
  const built = await esbuild.build({
    entryPoints: [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    conditions: ['workerd', 'worker', 'browser'],
    mainFields: ['module', 'main'],
    external: ['cloudflare:workers'],
    logLevel: 'silent',
    plugins: [
      {
        name: 'card-rewrites',
        setup(b: { onLoad: Function }) {
          for (const file of new Set(rewrites.map((r) => r.file)))
            b.onLoad({ filter: file }, (args: { path: string }) => {
              let text = readFileSync(args.path, 'utf8');
              for (const r of rewrites.filter((x) => x.file === file)) {
                if (text.split(r.from).length !== 2) throw new Error(`a rewrite's line is not in ${args.path} exactly once: ${r.from}`);
                text = text.replace(r.from, r.to);
              }
              return { contents: text, loader: 'ts' };
            });
        },
      },
    ],
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      /* Port 0, so the system picks one: a fixed port would collide with `wrangler dev` or a gate already listening. */
      port: 0,
      modules: true,
      script: built.outputFiles[0]!.text,
      /* `wrangler.jsonc`'s own date and flags, because a different date is a different runtime. */
      compatibilityDate: '2026-09-01',
      compatibilityFlags: [],
      durableObjects: { RECORD: { className: 'Record$', useSQLite: true }, DIRECTORY: { className: 'Directory$', useSQLite: true } },
      queueProducers: { INGRESS: 'braindog-ingress' },
      bindings: { PUBLIC_HOST: HOST, SESSION_SECRET, PROVISION_KEY, PROVISION_WITHOUT_KEYS: 'yes', BRAINDOG_BUILD: '' },
    }),
  );
  /* A WORKER THAT WILL NOT COME UP IS STOPPED HERE: its `mf` goes no further, so nothing else could dispose it. */
  try {
    return { mf, base: (await mf.ready).origin };
  } catch (e) {
    await mf.dispose();
    throw e;
  }
}

/** One record on a Worker: provisioned, claimed, set up with Solo founder, holding Kiln, and a key for the agent. */
type Held = { w: Worker; owner: Client; bearer: string };

let made = 0;
async function record(w: Worker): Promise<Held> {
  const slug = `card-${String(++made)}`;
  const provisioned = await counted(`${w.base}/auth/provision`, {
    method: 'POST',
    headers: { authorization: `Bearer ${PROVISION_KEY}`, 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ slug, email: `${slug}@example.test`, name: 'Sam' }),
  });
  const out = (await provisioned.json()) as { ok: boolean; value?: { record: string; claim: string } };
  assert.equal(provisioned.status, 200, JSON.stringify(out));
  const redeemed = await counted(`${w.base}/auth/magic/redeem`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ claimToken: out.value!.claim.split('#claim=')[1] }),
  });
  const set = redeemed.headers.getSetCookie().find((c) => c.startsWith('__Host-bd_s='));
  assert.ok(set, `the claim link signed nobody in: ${String(redeemed.status)} ${await redeemed.text()}`);
  const cookie = set.split(';')[0]!;
  const owner = createClient({
    base: w.base,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      sent.set('cookie', cookie);
      sent.set('origin', ORIGIN);
      return counted(input, { ...init, headers: sent });
    },
  });
  const filed = await owner.call<{ id: string }>('propose', { question: 'Install Solo founder?', body_kind: 'pack', body: { install: 'usecase-founder' } });
  assert.ok(filed.ok, `Solo founder could not be offered on the Worker: ${JSON.stringify(filed)}`);
  const accepted = await owner.call('decide', { id: filed.value.id, decide: { option: 'accept', reason: 'the agent needs its projects' } });
  assert.ok(accepted.ok, `Solo founder would not install on the Worker: ${JSON.stringify(accepted)}`);
  /* THE PROJECT THE CHECKOUT IS IN, by the remote it lists, so line one has a project to name. */
  const kiln = await owner.create({ register: 'things', fields: { name: 'Kiln', lane: 'building', repos: ['github.com/sam/kiln'] } });
  assert.ok(kiln.ok, JSON.stringify(kiln));
  const minted = await owner.call<{ bearer: string }>('createToken', { scope: 'write', label: 'MacBook' });
  assert.ok(minted.ok, `the owner could not mint a key on the Worker: ${JSON.stringify(minted)}`);
  return { w, owner, bearer: minted.value.bearer };
}

/** An agent's run on the record: its calls carry the command line's own headers, and `/mcp` is spoken as a client does. */
type Run = { client: Client; mcp(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> };

let ids = 0;
/** The run Claude Code session `client_id` is, on `h`'s key; `days` moves the record's clock for its calls (aged Worker only). */
function run(h: Held, client_id: string, days = 0): Run {
  const said = { ...sessionHeaders(AT, 'claude', { client_id }), ...(days === 0 ? {} : { 'x-in-do-clock-days': String(days) }) };
  const client = createClient({
    base: h.w.base,
    token: h.bearer,
    fetch: (input, init) => {
      const sent = new Headers(init?.headers);
      for (const [name, value] of Object.entries(said)) sent.set(name, value);
      return counted(input, { ...init, headers: sent });
    },
  });
  return {
    client,
    mcp: async (method, params = {}) => {
      const named = method === 'tools/call' ? String(params.name) : undefined;
      const res = await counted(`${h.w.base}/mcp`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${h.bearer}`,
          ...said,
          'mcp-protocol-version': '2025-11-25',
          'mcp-method': method,
          ...(named === undefined ? {} : { 'mcp-name': named }),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++ids, method, params }),
      });
      const body = (await res.json()) as { result?: Record<string, unknown>; error?: unknown };
      assert.equal(res.status, 200, JSON.stringify(body));
      assert.ok(body.result, `/mcp ${method} answered no result: ${JSON.stringify(body)}`);
      return body.result;
    },
  };
}

/** A run that worked here and left its step, as the end hook leaves it. */
async function leaves(r: Run, client_id: string, step: string): Promise<string> {
  const opened = await r.client.attach({ source: 'startup', client_id, branch: 'main' });
  assert.ok(opened.ok, JSON.stringify(opened));
  const left = await r.client.handoff({ state: 'handoff', next: step });
  assert.ok(left.ok, `the run could not leave its step: ${JSON.stringify(left)}`);
  return opened.value.spoken;
}

/** What one starting session is told three ways: the card the start hook prints, `context` over `/mcp`, and `/api/context`. */
type Told = { attached: Attached; hook: string; mcp: { card: string; card_next?: string; text: string }; api: Context };

async function starts(r: Run, client_id: string): Promise<Told> {
  const out = await r.client.attach({ source: 'startup', client_id, branch: 'main' });
  assert.ok(out.ok, JSON.stringify(out));
  /* THE HOOK'S OWN PRINTER over the attach's answer, as `hooks.ts` hands it, with HEAD not moved since the step. */
  const hook = briefing(out.value, { repo: AT.repo, host: AT.host, device: 'MacBook', agent: 'Claude Code' }, undefined);
  const result = await r.mcp('tools/call', { name: 'context', arguments: {} });
  assert.notEqual(result.isError, true, JSON.stringify(result));
  const structured = result.structuredContent as { card: string; card_next?: string };
  const text = (result.content as { text: string }[])[0]!.text;
  const api = await r.client.context();
  assert.ok(api.ok, JSON.stringify(api));
  return { attached: out.value, hook, mcp: { ...structured, text }, api: api.value };
}

before(async () => {
  const rewrite = mutant === undefined ? undefined : MUTANTS[mutant];
  if (mutant !== undefined && rewrite === undefined) throw new Error(`CARD_MUTANT names no mutant: ${mutant}`);
  const extra = rewrite === undefined ? [] : [rewrite];
  /* ONE BOOT FAILING MUST NOT STRAND THE OTHER. `Promise.all` rejected on the first failure and assigned neither, so the
     Worker that did come up was disposed by nobody, its workerd child held this process open for ever, and the suite
     sat at 0% CPU printing nothing for the files after this one. Each is kept as it lands, so `after` stops it. */
  const [one, two] = await Promise.allSettled([boot(extra), boot([...SEAM, ...extra])]);
  if (one.status === 'fulfilled') shipped = one.value;
  if (two.status === 'fulfilled') aged = two.value;
  for (const booted of [one, two]) if (booted.status === 'rejected') throw booted.reason;
});

after(async () => {
  await Promise.all([shipped?.mf.dispose(), aged?.mf.dispose()]);
});

const ULID = /\b[0-9A-HJKMNP-TV-Z]{26}\b/u;

test('THE START HOOK AND context PRINT ONE CARD: line one names the run, the app, the project and the branch, then Next', async () => {
  const h = await record(shipped!);
  const before = await leaves(run(h, 'run-a'), 'run-a', STEP);
  const told = await starts(run(h, 'run-b'), 'run-b');

  /* ONE TEXT, BYTE FOR BYTE, three ways: the hook's print, `context` over `/mcp`, and `/api/context`. */
  assert.equal(told.mcp.card, told.hook, 'context over /mcp said another card than the start hook printed');
  assert.equal(told.api.card, told.hook, '/api/context said another card than the start hook printed');
  assert.ok(told.mcp.text.startsWith(`${told.hook}\n`) || told.mcp.text === told.hook, `context's text does not lead with the card:\n${told.mcp.text}`);

  const lines = told.hook.split('\n');
  assert.equal(lines[0], 'Claude Code on MacBook, working on Kiln');
  /* NEXT STEP FIRST: the first slot after line one is the step the last run left, said as another run's, with no run id. */
  assert.match(lines[1]!, /^Next\s/u, told.hook);
  assert.ok(lines[1]!.includes(STEP.slice(0, 30)) && lines[1]!.includes('Left by Claude') && !lines[1]!.includes(before) && lines[1]!.endsWith('Check before acting.'), lines[1]);
  /* AND A COMPACTION PRINTS THE WHOLE LINE ALONE, from the record's `card_next`, with the handle a tool needs. */
  assert.ok(told.mcp.card_next?.startsWith('Next') && told.mcp.card_next.includes(STEP) && told.mcp.card_next.includes(`Left by Claude (${before}) `), String(told.mcp.card_next));
  assert.equal(nextLine(told.attached, undefined), told.mcp.card_next);

  assert.ok(wordCount(told.hook) <= 130, `${String(wordCount(told.hook))} words:\n${told.hook}`);
  /* NAMES, NEVER IDS: no row's id, no machine's network name, no folder's path. */
  assert.doesNotMatch(told.hook, ULID);
  assert.ok(!told.hook.includes('Sams-MacBook-Pro') && !told.hook.includes('/Users/'), told.hook);
});

test('A STEP MORE THAN A DAY OLD IS NO NEXT LINE, and one twelve hours old still is', async () => {
  const h = await record(aged!);
  await leaves(run(h, 'run-a', -2), 'run-a', STEP);
  const stale = await starts(run(h, 'run-b'), 'run-b');
  assert.equal(stale.mcp.card, stale.hook);
  assert.equal(stale.api.card, stale.hook);
  assert.equal(stale.api.handoff, null, `a step two days old was handed over: ${JSON.stringify(stale.api.handoff)}`);
  assert.ok(!stale.hook.split('\n').some((line) => /^Next\s/u.test(line)), `a Next line for a step two days old:\n${stale.hook}`);
  assert.equal(stale.mcp.card_next, undefined);
  assert.equal(nextLine(stale.attached, undefined), null, 'a compaction would print a step two days old');
  assert.ok(wordCount(stale.hook) <= 150, stale.hook);

  /* AND THE CLOCK WAS MOVED, NOT THE STEP LOST: the same record, a step left twelve hours ago, is the Next line. Without this
     the case would hold for a seam that dropped every step. */
  const fresher = 'Ship the Kiln installer to the two testers.';
  const by = await leaves(run(h, 'run-c', -0.5), 'run-c', fresher);
  const told = await starts(run(h, 'run-d'), 'run-d');
  assert.equal(told.mcp.card, told.hook);
  const next = told.hook.split('\n').find((line) => /^Next\s/u.test(line));
  assert.ok(next?.includes(fresher) && next.endsWith('Left by Claude 12h ago. Check before acting.') && !next.includes(by), told.hook);
  assert.ok(!told.hook.includes(STEP), `the two-day step came back beside the twelve-hour one:\n${told.hook}`);
});

test('A LONG STEP AND THREE QUESTIONS STILL MAKE A BRIEF OF FIVE SHORT LINES, one question said and the step cut to a line', async () => {
  const h = await record(shipped!);
  /* SHORT WORDS, so each slot's character cut leaves as many words as it can: three questions, and a long step. */
  const asks = [
    'Do we go on with it as it is, or do we let it be for now and go back to it in a day or so?',
    'Is it OK if we put the two of them in one box and not in two, as it is a bit too big to fit?',
    'Can we say no to the one in May and yes to the one in June, or do we do both or not at all?',
  ];
  /* ASKED BY A RUN THAT IS STILL AT WORK in this tree, so the card carries the same-tree line as well. */
  for (const question of asks) {
    const filed = await run(h, 'run-x').client.call('propose', { question, body_kind: 'options', body: { options: [{ id: 'yes', label: 'Yes', because: 'It fits.' }, { id: 'no', label: 'No', because: 'Not yet.' }] } });
    assert.ok(filed.ok, `the agent could not ask: ${JSON.stringify(filed)}`);
  }
  const long = 'Go to the box by the door, put it on the cart, and if it is not in by six or so, ask Mo to go get it, as we all said we would do on the call';
  await leaves(run(h, 'run-a'), 'run-a', long);
  const told = await starts(run(h, 'run-b'), 'run-b');
  assert.equal(told.mcp.card, told.hook, 'context over /mcp said another card than the start hook printed');
  assert.equal(told.api.card, told.hook, '/api/context said another card than the start hook printed');
  assert.ok(wordCount(told.hook) <= 130, `${String(wordCount(told.hook))} words:\n${told.hook}`);

  const lines = told.hook.split('\n');
  assert.equal(lines[0], 'Claude Code on MacBook, working on Kiln');
  const next = lines.find((line) => /^Next\s/u.test(line));
  assert.ok(next && next.length <= 100 && next.endsWith('Check before acting.') && next.includes('Go to the box by the door'), told.hook);
  const waiting = lines.find((line) => /^Waiting\s/u.test(line));
  assert.match(waiting ?? '', /^Waiting\s+\d+ (?:here of \d+ )?on .+, first: /u, told.hook);
  /* AN AGENT'S CARD IS THE PLAN'S: five lines at most, and no More line, since this is what context says. */
  assert.ok(lines.length <= PLAN_CARD_LINES, told.hook);
  assert.ok(!told.hook.includes('call context for the full picture'), told.hook);
  /* THE TWO-SESSIONS WARNING REACHES THE AGENT AT START: a line of the card the hook prints, naming the other run (never
     this one), and said once in what context says. */
  const also = lines.find((line) => line.startsWith('Also ') && line.includes(TWO_SESSIONS)) ?? '';
  const named = [...also.matchAll(/\b(S\d+)\b/gu)].map((m) => m[1]);
  assert.ok(named.length > 0 && !named.includes(told.api.session?.spoken), `no two-sessions line naming the other run:\n${told.hook}`);
  assert.equal(told.mcp.text.split(TWO_SESSIONS).length, 2, `the warning is not said once:\n${told.mcp.text}`);
});

/*
 * TODO UNTIL A TASK'S AGENT REACHES THE CARD. Next leads with the rows handed to the agent (`handedTo` in `card.ts` reads
 * each row's `agent`), but the briefing's rows carry only a list's title and `mobile` fields (`brief` in
 * `packages/record/src/index.ts`), and Tasks' are what, thing and state. So on a real record no task handed to an agent
 * is ever on its card; `packages/record/test/card.test.ts` hands `card()` a context it built itself and never saw this.
 * Measured: with `agent` in Tasks' `mobile` in a scratch bundle, Next read "Proof the release notes for Kiln (tasks#1,
 * handed to you) · Cut the release notes ...". It waits on `brief` keeping the field a list's `hand.agent` names.
 */
test('A TASK HANDED TO THE AGENT LEADS ITS NEXT LINE, before the step', async () => {
  const h = await record(shipped!);
  /* WORK COMES WHEN TASKS ARE MENTIONED (founder 2.7.0 says `needs`), so it is added here, as a person adding it would. */
  const work = await h.owner.call<{ id: string }>('propose', { question: 'Install Work?', body_kind: 'pack', body: { install: 'work' } });
  assert.ok(work.ok, `Work could not be offered on the Worker: ${JSON.stringify(work)}`);
  const took = await h.owner.call('decide', { id: work.value.id, decide: { option: 'accept', reason: 'tasks for the agent' } });
  assert.ok(took.ok, `Work would not install on the Worker: ${JSON.stringify(took)}`);
  const task = await h.owner.create({ register: 'tasks', fields: { what: 'Proof the release notes for Kiln', agent: 'claude' } });
  assert.ok(task.ok, `a task could not be handed to the agent: ${JSON.stringify(task)}`);
  await leaves(run(h, 'run-a'), 'run-a', STEP);
  const told = await starts(run(h, 'run-b'), 'run-b');
  assert.equal(told.mcp.card, told.hook);
  const next = told.hook.split('\n').find((line) => /^Next\s/u.test(line)) ?? '';
  /* THE BRIEF'S NEXT IS ONE SHORT LINE with a name and no id: what was handed over leads, and the step it left waits behind it. */
  assert.match(next, /^Next\s+Proof the release notes for Kiln \(handed to you\)$/u, told.hook);
});

test('NOTHING THROUGH THE WORKER WAS ANSWERED 500 OR MORE', () => {
  /* AND IT WAS ASKED SOMETHING. Each record is about seven requests before its case asks anything. */
  assert.ok(asked > 20, `${String(asked)} requests`);
  assert.deepEqual(fives, []);
});
