/**
 * Slash drafting pages from sixteen descriptions, and writing the nightly headlines over a seeded record, asked of a real
 * model on a key, scored on whether the first try was good.
 *
 *   DRAFT_EVAL_MODEL=<model> DRAFT_EVAL_KEY=<key> node packages/record/eval/run.ts
 *   DRAFT_EVAL_PROVIDER=anthropic DRAFT_EVAL_MODEL=<model> DRAFT_EVAL_KEY=<key> node packages/record/eval/run.ts --only 1,3,7
 *   node packages/record/eval/run.ts --dry
 *
 *   DRAFT_EVAL_PROVIDER    `openai` (chat completions, the default) or `anthropic` (Messages)
 *   DRAFT_EVAL_URL         the provider's base address; by default OpenAI's `/v1` or Anthropic's root. Workers AI answers the
 *                          chat completions shape at `https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1`, with a
 *                          model such as `@cf/zai-org/glm-5.3-flash` and an API token as the key
 *   DRAFT_EVAL_MODEL       the model name the provider knows
 *   DRAFT_EVAL_KEY         the key, read from the environment so it stays out of a shell's history; nothing here prints it,
 *                          and any message that would carry it has it cut out first
 *   DRAFT_EVAL_TIMEOUT_MS  how long one ask may take, by default the host's own `SLASH_TIMEOUT_MS` (30 seconds)
 *
 *   --only 1,2,3   only those descriptions, by number (`cases.ts`); the headlines are asked whatever is chosen
 *   --dry          the stub model in `stub.ts`, no key and no network: proves the scorer runs, and scores nothing real
 *   --json         the lines below go to stderr, and stdout is one JSON line, the score object (`Score`), for a runner
 *
 * WHAT IT MEASURES AND WHY IT IS NOT A TEST. The suite in `test/` drives `describe` and the headlines over canned answers,
 * which says what the record does with an answer and nothing about whether a model gives a good one. This asks the model
 * itself and scores what came back, by the bar a drawn page is held to, "good on the first try":
 *
 *   - FIRST TRY: the share of descriptions where a draft drew clean from the first ask, with no repair;
 *   - CALM: `calmFaults` a page, over the pages the first ask drew, before any repair mended them;
 *   - REFUSED: what the record refused when it drew a draft or tried its rules, on every ask, and the drafts still dropped
 *     at the end, which the owner is shown as "nothing was drafted";
 *   - HEADLINES: the share of pages whose line the model wrote and `headlineFault` kept;
 *   - SYSTEM WORDS: row, list, entity, field and the rest in what a person reads (headings, titles, sentences, the question),
 *     leaving out a word the owner used himself, so "a reading list" may be called one.
 *
 * It costs money and differs run to run, so it is not named `*.test.ts` and no package script runs it. CI does, by itself
 * and on its own schedule: `tools/model-checks/run.mjs --suite record` runs it with `--json` from
 * `.github/workflows/model-checks.yml`, a few chosen descriptions a night and all sixteen a week, asks a failed case twice
 * more, and holds the share passed to the bar in `tools/model-checks/baseline.json`.
 *
 * THE ENGINE IS THE SHIPPED ONE. `createRecordApi` from `src/`, over a real SQLite from the kernel's test helper, drafting
 * through `slashDraft` (`describe` with its repairs and `previewChange`) and writing headlines through `slashTick`. The model
 * is the host's own `endpointModel` or `anthropicModel`, so the instructions it is told are `SLASH_INSTRUCTIONS` and
 * `SLASH_HEADLINE_INSTRUCTIONS` as they ship. That is a relative import of `packages/host`, which `src/` may not make
 * (`tools/gates/graph.mjs` reads `src/**` alone): this file is a tool that measures both, and a copy of the instructions
 * here would be measuring a prompt nobody ships.
 *
 * A case passes when a draft was kept and its words are the person's; a headline passes when its line was kept and says no
 * system word. It exits 1 when any case failed, so two runs can be compared by their last lines.
 */

import { anthropicModel, endpointModel, SLASH_TIMEOUT_MS } from '../../host/src/slash.ts';
import { calmFaults, headlineFault, type CallContext, type HeadlineInput, type SlashModel, type SlashModelInput } from '../src/index.ts';
import { CASES, type Case } from './cases.ts';
import { OWNER, seeded } from './record.ts';
import { STUB } from './stub.ts';

const dry = process.argv.includes('--dry');
const provider = process.env['DRAFT_EVAL_PROVIDER'] ?? 'openai';
const modelName = process.env['DRAFT_EVAL_MODEL'] ?? '';
const apiKey = process.env['DRAFT_EVAL_KEY'] ?? '';
if (!dry && ((provider !== 'openai' && provider !== 'anthropic') || modelName === '' || apiKey === '')) {
  console.error('Usage: DRAFT_EVAL_MODEL=<model> DRAFT_EVAL_KEY=<key> [DRAFT_EVAL_PROVIDER=openai|anthropic] [DRAFT_EVAL_URL=<base>] node packages/record/eval/run.ts [--only 1,2,3] [--dry]');
  process.exit(2);
}
/** `--json`: the human lines move to stderr so stdout carries the score object alone. */
const json = process.argv.includes('--json');
const say = (line: string): void => (json ? console.error(line) : console.log(line));
const timeoutSaid = Number(process.env['DRAFT_EVAL_TIMEOUT_MS']);
const timeoutMs = Number.isFinite(timeoutSaid) && timeoutSaid > 0 ? timeoutSaid : SLASH_TIMEOUT_MS;

/** Any text this prints, with the key cut out of it: a provider's message or an address could echo it back. */
const quiet = (text: string): string => (apiKey === '' ? text : text.split(apiKey).join('[key]'));

/** The address each provider answers its asks at, from the base, as the host builds it for an owner's own key. */
const addressOf = (base: string): string => {
  const b = base.replace(/\/+$/u, '');
  if (provider === 'openai') return b.endsWith('/chat/completions') ? b : `${b}/chat/completions`;
  if (b.endsWith('/messages')) return b;
  return b.endsWith('/v1') ? `${b}/messages` : `${b}/v1/messages`;
};

const real = (): SlashModel => {
  const url = addressOf(process.env['DRAFT_EVAL_URL'] ?? (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1'));
  const options = {
    url,
    model: modelName,
    key: async () => apiKey,
    send: (input: URL, init: RequestInit) => fetch(input, init),
    name: modelName,
    keyName: 'DRAFT_EVAL_KEY',
    timeoutMs,
  };
  return provider === 'anthropic' ? anthropicModel(options) : endpointModel(options);
};
const model = dry ? STUB : real();

/* ── the model, counted ─────────────────────────────────────────────── */

/**
 * What one case or the night asked and was answered: each ask's input, the questions the model wrote, the headline input
 * and answer, and the first thing that went wrong, already quiet.
 */
type Tally = { asks: SlashModelInput[]; said: string[]; heard: HeadlineInput | null; lines: Record<string, unknown> | null; fault: string | null; looked: number };
const fresh = (): Tally => ({ asks: [], said: [], heard: null, lines: null, fault: null, looked: 0 });
let tally = fresh();
/** On the night, the daily look's own draft is answered with nothing, so the run pays only for the headlines. */
let night = false;

const failed = (e: unknown): never => {
  tally.fault ??= quiet(e instanceof Error ? e.message : String(e)).slice(0, 160);
  throw e;
};

const counted: SlashModel = {
  name: model.name,
  draft: async (input) => {
    if (night) {
      tally.looked++;
      return { drafts: [] };
    }
    tally.asks.push(input);
    const raw = await model.draft(input).catch(failed);
    const drafts = (raw as { drafts?: unknown })?.drafts ?? raw;
    if (Array.isArray(drafts)) for (const d of drafts) if (typeof (d as { question?: unknown })?.question === 'string') tally.said.push((d as { question: string }).question.trim());
    return raw;
  },
  headline: async (input) => {
    tally.heard = input;
    const raw = await model.headline!(input).catch(failed);
    const lines = (raw as { lines?: unknown })?.lines;
    tally.lines = lines !== null && typeof lines === 'object' && !Array.isArray(lines) ? (lines as Record<string, unknown>) : null;
    return raw;
  },
};

/* ── what a person reads ───────────────────────────────────────────── */

/** The system's words, which never name a person's own things. */
const SYSTEM_WORDS = /\b(?:rows?|lists?|list items?|entit(?:y|ies)|fields?|registers?|blocks?|declarations?|metrics?|records?)\b/giu;
/** The keys whose text a person reads on a drawn page or a question. */
const READ_KEYS = new Set(['title', 'name', 'heading', 'body', 'empty', 'label', 'one', 'holds', 'question', 'text', 'say', 'summary']);

const stem = (w: string): string => w.toLowerCase().replace(/(?:ies)$/u, 'y').replace(/s$/u, '');

/** The system words in `text`, holes left out, and none the owner used in `asked`. */
const systemWords = (text: string, asked: string): string[] => {
  const his = new Set([...asked.matchAll(SYSTEM_WORDS)].map((m) => stem(m[0])));
  return [...text.replace(/\{\{[^{}]*\}\}/gu, ' ').matchAll(SYSTEM_WORDS)].map((m) => m[0].toLowerCase()).filter((w) => !his.has(stem(w)));
};

/** Every string under a key a person reads, anywhere in a change. */
const readText = (x: unknown, out: string[] = [], key = ''): string[] => {
  if (typeof x === 'string') {
    if (READ_KEYS.has(key)) out.push(x);
  } else if (Array.isArray(x)) for (const v of x) readText(v, out, key);
  else if (x !== null && typeof x === 'object') for (const [k, v] of Object.entries(x)) readText(v, out, k);
  return out;
};

/* ── the descriptions ──────────────────────────────────────────────── */

type Page = Parameters<typeof calmFaults>[0][number];
type Seen = { ok: boolean; value?: { pages: Page[] }; refusal?: { code: string; fix: string } };
type Tried = { ok: boolean; value?: { steps?: { state?: string }[] }; refusal?: { at?: string } };
type Drafted = { by: string; drafts: { question: string; change: { to: unknown } }[]; dropped: string[] };

type Scored = { c: Case; pass: boolean; first: boolean; kept: number; asks: number; pages: number; calm: number; refused: number; dropped: number; words: string[]; ms: number; why: string; fault: string | null };

/** A record whose `previewChange` and `tryAutomation` are counted, as `slashDraft` reads them off `this` (`previewerOf`). */
const watched = (api: Record<string, unknown>, ask: () => number, seen: { ask: number; got: Seen }[], tried: Tried[]) => ({
  previewChange: async (args: unknown, ctx: CallContext): Promise<unknown> => {
    const got = (await (api['previewChange'] as (a: unknown, c: CallContext) => Promise<Seen>).call(api, args, ctx)) as Seen;
    seen.push({ ask: ask(), got });
    return got;
  },
  ...(typeof api['tryAutomation'] === 'function'
    ? {
        tryAutomation: async (args: unknown, ctx: CallContext): Promise<unknown> => {
          const got = (await (api['tryAutomation'] as (a: unknown, c: CallContext) => Promise<Tried>).call(api, args, ctx)) as Tried;
          tried.push(got);
          return got;
        },
      }
    : {}),
});

async function described(c: Case): Promise<Scored> {
  tally = fresh();
  const { api, sql } = await seeded(counted);
  const seen: { ask: number; got: Seen }[] = [];
  const tried: Tried[] = [];
  const self = watched(api as unknown as Record<string, unknown>, () => tally.asks.length, seen, tried);
  const started = performance.now();
  const out = (await (api.slashDraft as (this: unknown, args: unknown, ctx: CallContext) => Promise<unknown>).call(
    self,
    { asked: c.asked, ...(c.page === undefined ? {} : { page: c.page }) },
    OWNER,
  )) as { ok: boolean; value?: Drafted; refusal?: { code: string; fix: string } };
  const ms = Math.round(performance.now() - started);
  sql.close();

  const firstDraws = seen.filter((s) => s.ask === 1);
  const pages = firstDraws.flatMap((s) => (s.got.ok ? (s.got.value?.pages ?? []) : []));
  const calm = calmFaults(pages).length;
  const refused =
    seen.reduce((n, s) => n + (s.got.ok ? (s.got.value?.pages ?? []).reduce((m, p) => m + p.blocks.reduce((k, b) => k + (b.refusals?.length ?? 0), 0), 0) : 1), 0) +
    tried.reduce((n, t) => n + (t.ok ? (t.value?.steps ?? []).filter((s) => s.state === 'failed').length : t.refusal?.at?.startsWith('sample') === true ? 0 : 1), 0);
  const firstClean = firstDraws.some((s) => s.got.ok && calmFaults(s.got.value?.pages ?? []).length === 0 && (s.got.value?.pages ?? []).every((p) => p.blocks.every((b) => (b.refusals?.length ?? 0) === 0)));

  if (!out.ok || out.value === undefined) {
    const why = out.refusal ? `${out.refusal.code}: ${out.refusal.fix}` : 'the record refused the description';
    return { c, pass: false, first: false, kept: 0, asks: tally.asks.length, pages: pages.length, calm, refused, dropped: 0, words: [], ms, why: quiet(why), fault: tally.fault };
  }
  const { drafts, dropped } = out.value;
  const words: string[] = [];
  for (const d of drafts) {
    /* THE MODEL'S OWN QUESTION, and not the line the record adds after it about what a change replaces. */
    const own = tally.said.filter((q) => d.question.startsWith(q)).sort((a, b) => b.length - a.length)[0] ?? d.question;
    words.push(...systemWords([own, ...readText(d.change.to)].join('\n'), c.asked));
  }
  const kept = drafts.length;
  const first = kept > 0 && tally.asks.length === 1 && firstClean;
  const why = kept === 0 ? (tally.fault ?? dropped[0] ?? 'nothing was kept') : words.length > 0 ? `says ${[...new Set(words)].join(', ')}` : '';
  return { c, pass: kept > 0 && words.length === 0, first, kept, asks: tally.asks.length, pages: pages.length, calm, refused, dropped: dropped.length, words, ms, why: quiet(why), fault: tally.fault };
}

/* ── the night ─────────────────────────────────────────────────────── */

type Line = { page: string; pass: boolean; text: string; why: string };

async function headlines(): Promise<{ lines: Line[]; why: string; ms: number; fault: string | null }> {
  tally = fresh();
  night = true;
  const { api, sql } = await seeded(counted);
  const started = performance.now();
  const ran = await api.slashTick();
  const ms = Math.round(performance.now() - started);
  night = false;
  const prefs = api.kernel.prefsOf('slash');
  sql.close();
  const heard = tally.heard;
  if (heard === null) {
    const said = ran.ran ? ran.dropped.find((d) => /headline/iu.test(d)) : `the look did not run (${ran.why})`;
    return { lines: [], why: quiet(tally.fault ?? said ?? 'no page was handed to the model'), ms, fault: tally.fault };
  }
  const lines = heard.pages.map((p): Line => {
    const text = typeof tally.lines?.[p.page] === 'string' ? (tally.lines[p.page] as string).trim() : '';
    const kept = prefs[`headline.${p.page}`] !== undefined;
    const words = systemWords(text, '');
    const why = kept ? (words.length > 0 ? `says ${[...new Set(words)].join(', ')}` : '') : (tally.fault ?? headlineFault(text, p) ?? 'not kept');
    return { page: p.page, pass: kept && words.length === 0, text, why: quiet(why) };
  });
  return { lines, why: '', ms, fault: tally.fault };
}

/* ── the run ───────────────────────────────────────────────────────── */

const onlySaid = process.argv.indexOf('--only');
const only = onlySaid === -1 ? null : new Set((process.argv[onlySaid + 1] ?? '').split(',').map((s) => Number(s.trim())));
const asked = CASES.filter((c) => only === null || only.has(c.n));
if (asked.length === 0) {
  console.error(`--only names no description: say numbers from 1 to ${CASES.length}, such as --only 1,3`);
  process.exit(2);
}

say(dry ? `Draft evaluation, dry: ${asked.length} description${asked.length === 1 ? '' : 's'} and the night's headlines, on the stub model` : `Draft evaluation: ${asked.length} description${asked.length === 1 ? '' : 's'} and the night's headlines, ${provider} ${modelName}`);
const scored: Scored[] = [];
for (const c of asked) {
  const s = await described(c);
  scored.push(s);
  say(
    `${String(c.n).padStart(2)} ${s.pass ? 'pass' : 'FAIL'}  ${c.name.padEnd(16)} ${String(s.ms).padStart(6)} ms  asks ${s.asks}  kept ${s.kept}  ` +
      `first try ${s.first ? 'yes' : 'no '}  calm ${s.pages === 0 ? '-' : (s.calm / s.pages).toFixed(1)}/page  refused ${s.refused}  dropped ${s.dropped}` +
      `${s.why === '' ? '' : `  (${s.why.slice(0, 160)})`}`,
  );
}

const nightly = await headlines();
if (nightly.lines.length === 0) say(`   FAIL  headlines          ${String(nightly.ms).padStart(6)} ms  (${nightly.why.slice(0, 160)})`);
for (const l of nightly.lines)
  say(`   ${l.pass ? 'pass' : 'FAIL'}  headline ${l.page.padEnd(9)} ${String(nightly.ms).padStart(6)} ms  "${l.text.slice(0, 140)}"${l.why === '' ? '' : `  (${l.why.slice(0, 160)})`}`);

const n = scored.length;
const pct = (a: number, b: number): string => (b === 0 ? '-' : `${Math.round((100 * a) / b)}%`);
const first = scored.filter((s) => s.first).length;
const pages = scored.reduce((a, s) => a + s.pages, 0);
const calm = scored.reduce((a, s) => a + s.calm, 0);
const refused = scored.reduce((a, s) => a + s.refused, 0);
const dropped = scored.reduce((a, s) => a + s.dropped, 0);
const outright = scored.filter((s) => s.kept === 0).length;
const keptLines = nightly.lines.filter((l) => l.why === '' || l.why.startsWith('says ')).length;
const words = [...scored.flatMap((s) => s.words), ...nightly.lines.flatMap((l) => systemWords(l.text, ''))];
const passed = scored.filter((s) => s.pass).length + nightly.lines.filter((l) => l.pass).length;
const cases = n + Math.max(1, nightly.lines.length);

say('');
say(`first try     ${first} of ${n} drew clean from the first ask, with no repair (${pct(first, n)})`);
say(`calm          ${pages === 0 ? '-' : (calm / pages).toFixed(2)} faults a page, ${calm} over the ${pages} pages the first ask drew`);
say(`refused       ${refused} by the record at a draw or a try, ${dropped} said as dropped, ${outright} of ${n} kept nothing`);
say(`headlines     ${keptLines} of ${nightly.lines.length} kept (${pct(keptLines, nightly.lines.length)})`);
say(`system words  ${words.length}${words.length === 0 ? '' : `: ${[...new Set(words)].join(', ')}`}`);
say(
  `score         first try ${pct(first, n)}, calm ${pages === 0 ? '-' : (calm / pages).toFixed(2)}/page, refused ${refused}, headlines ${pct(keptLines, nightly.lines.length)}, ` +
    `system words ${words.length}, ${passed} of ${cases} passed`,
);

/**
 * What `--json` prints, the one shape `tools/model-checks` reads from both harnesses. `score` is the share of cases that
 * passed, 0 to 100, the headlines counted as one case each (or one case when none came back), which is what the bar in
 * `baseline.json` is held to. A case is named by `id`: a description's number, or `headline <page>`, whose `n` is null
 * because `--only` names descriptions and the headlines are asked on every run. A case's
 * `fault` is the provider's own words, already quiet, so the runner can tell no answer from a wrong one.
 */
type Score = {
  suite: 'record';
  model: string;
  passed: number;
  total: number;
  score: number;
  firstTry: number;
  headlines: { kept: number; of: number };
  systemWords: number;
  cases: { id: string; n: number | null; pass: boolean; ms: number; code: string | null; fault: string | null }[];
};
if (json) {
  const night =
    nightly.lines.length === 0
      ? [{ id: 'headlines', n: null, pass: false, ms: nightly.ms, code: nightly.why || null, fault: nightly.fault }]
      : nightly.lines.map((l) => ({ id: `headline ${l.page}`, n: null, pass: l.pass, ms: nightly.ms, code: l.pass ? null : l.why || null, fault: l.pass ? null : nightly.fault }));
  const score: Score = {
    suite: 'record',
    model: dry ? 'stub' : modelName,
    passed,
    total: cases,
    score: Math.round((100 * passed) / cases),
    firstTry: n === 0 ? 0 : Math.round((100 * first) / n),
    headlines: { kept: keptLines, of: nightly.lines.length },
    systemWords: words.length,
    cases: [...scored.map((s) => ({ id: String(s.c.n), n: s.c.n, pass: s.pass, ms: s.ms, code: s.pass ? null : s.why || null, fault: s.fault })), ...night],
  };
  console.log(JSON.stringify(score));
}

process.exit(passed === cases ? 0 : 1);
