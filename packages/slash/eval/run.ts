/**
 * Slash's thirty questions over the fixture record, asked of a real model on a key, with which rows each answer cited.
 *
 *   SLASH_EVAL_MODEL=<model> SLASH_EVAL_KEY=<key> node packages/slash/eval/run.ts
 *   SLASH_EVAL_PROVIDER=anthropic SLASH_EVAL_MODEL=<model> SLASH_EVAL_KEY=<key> node packages/slash/eval/run.ts --only 1,9,28
 *
 *   SLASH_EVAL_PROVIDER  `openai` (chat completions, the default) or `anthropic` (Messages)
 *   SLASH_EVAL_URL       the provider's base address; by default OpenAI's `/v1` or Anthropic's root. Workers AI answers the
 *                        chat completions shape at `https://api.cloudflare.com/client/v4/accounts/<account>/ai/v1`, with
 *                        a model such as `@cf/zai-org/glm-5.3-flash` and an API token as the key
 *   SLASH_EVAL_MODEL     the model name the provider knows
 *   SLASH_EVAL_KEY       the key, read from the environment so it stays out of a shell's history; nothing here prints it
 *   SLASH_EVAL_TIMEOUT_MS how long one ask may take, by default 30 seconds as the host's own; past it the ask is a fault
 *
 *   --only 1,2,3   only those questions, by number (`questions.ts`)
 *   --json         the lines below go to stderr, and stdout is one JSON line, the score object (`Score`), for a runner
 *
 * WHAT IT MEASURES AND WHY IT IS NOT A TEST. The suite in `test/` drives the package over canned answers, which says what
 * this package does with an answer and nothing about whether a model gives a good one. This asks the model itself, twice
 * per question as the palette does (the predicate, then the answer on the same ask), and scores what came back against
 * `questions.ts`: did the predicate parse, did the answer parse, and did it cite exactly the rows it should. It costs
 * money and differs run to run, so it is not named `*.test.ts` and `pnpm test` never runs it. CI does, by itself and on
 * its own schedule: `tools/model-checks/run.mjs --suite slash` runs it with `--json` from `.github/workflows/model-checks.yml`,
 * eight chosen questions a night and all thirty a week, asks a failed question twice more, and holds the share cited
 * right to the bar in `tools/model-checks/baseline.json`.
 *
 * THE ENGINE IS THE SHIPPED ONE. `createSlash` from `src/`, over a real SQLite from `test/double.ts`, on the included
 * tier with its cap raised past the sixty calls a full run makes. Only the adapter is this file's: the same request shape
 * the hosts send (`endpointInference` and `anthropicInference` in `packages/host/src/slash.ts`), strict `json_schema` on
 * chat completions and the schema in the system text on Messages, because `packages/host` is not this package's to import.
 *
 * It exits 1 when any question failed, so two runs can be compared by their last lines.
 */

import { createSlash, type Inference, type InferenceCall, type InferenceReply } from '../src/index.ts';
import { OWNER, openSqlite } from '../test/double.ts';
import { QUESTIONS, type Question } from './questions.ts';
import { evalRecord, NOW } from './record.ts';

const provider = process.env['SLASH_EVAL_PROVIDER'] ?? 'openai';
const model = process.env['SLASH_EVAL_MODEL'] ?? '';
const apiKey = process.env['SLASH_EVAL_KEY'] ?? '';
if ((provider !== 'openai' && provider !== 'anthropic') || model === '' || apiKey === '') {
  console.error('Usage: SLASH_EVAL_MODEL=<model> SLASH_EVAL_KEY=<key> [SLASH_EVAL_PROVIDER=openai|anthropic] [SLASH_EVAL_URL=<base>] node packages/slash/eval/run.ts [--only 1,2,3]');
  process.exit(2);
}
const timeoutSaid = Number(process.env['SLASH_EVAL_TIMEOUT_MS']);
const timeoutMs = Number.isFinite(timeoutSaid) && timeoutSaid > 0 ? timeoutSaid : 30_000;
/** `--json`: the human lines move to stderr so stdout carries the score object alone. */
const json = process.argv.includes('--json');
const say = (line: string): void => (json ? console.error(line) : console.log(line));
const baseUrl = (process.env['SLASH_EVAL_URL'] ?? (provider === 'anthropic' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1')).replace(/\/+$/, '');

/** A fenced reply, which some models send even when asked for JSON alone. */
const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/u;
const unfenced = (text: string): string => FENCE.exec(text)?.[1] ?? text;

/** A reply that is not ok, as the provider said it, cut to a line: this is where a refused `json_schema` shows. */
async function posted(url: string, headers: Record<string, string>, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = JSON.stringify(payload);
  const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} from ${url}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

const openai = async (call: InferenceCall): Promise<InferenceReply> => {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` };
  const got = await posted(`${baseUrl}/chat/completions`, headers, {
    model,
    temperature: 0,
    max_tokens: call.maxTokens,
    response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: call.jsonSchema, strict: true } },
    messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  const choices = got['choices'] as { message?: { content?: unknown } }[] | undefined;
  const usage = (got['usage'] ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  const content = choices?.[0]?.message?.content;
  return { text: unfenced(typeof content === 'string' ? content : ''), usage: { in: usage.prompt_tokens ?? 0, out: usage.completion_tokens ?? 0 } };
};

const anthropic = async (call: InferenceCall): Promise<InferenceReply> => {
  const headers = { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  const system = call.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const got = await posted(`${baseUrl}/v1/messages`, headers, {
    model,
    max_tokens: call.maxTokens,
    temperature: 0,
    system: `${system}\n\nAnswer with one JSON object and nothing else, matching this JSON Schema: ${JSON.stringify(call.jsonSchema)}`,
    messages: call.messages.filter((m) => m.role === 'user').map((m) => ({ role: 'user', content: m.content })),
  });
  const blocks = (got['content'] ?? []) as { type?: string; text?: string }[];
  const usage = (got['usage'] ?? {}) as { input_tokens?: number; output_tokens?: number };
  const said = blocks.map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('');
  return { text: unfenced(said), usage: { in: usage.input_tokens ?? 0, out: usage.output_tokens ?? 0 } };
};

/** The adapter, counting the run's calls and tokens, and the provider's own words for each failure of the question asked now. */
const spent = { calls: 0, in: 0, out: 0, faults: [] as string[] };
const inference: Inference = {
  complete: async (call) => {
    spent.calls++;
    try {
      const reply = await (provider === 'anthropic' ? anthropic(call) : openai(call));
      spent.in += reply.usage.in;
      spent.out += reply.usage.out;
      return reply;
    } catch (e) {
      spent.faults.push(e instanceof Error ? e.message : String(e));
      throw e;
    }
  },
};

const record = evalRecord();
const slash = createSlash({ sql: openSqlite(), clock: { now: () => NOW }, inference, record });
const raised = slash.configure({ ask_cap: 1000 }, OWNER);
if (!raised.ok) {
  console.error(`The evaluation could not raise the ask cap: ${'refusal' in raised ? raised.refusal.fix : 'refused'}`);
  process.exit(2);
}

const onlySaid = process.argv.indexOf('--only');
const only = onlySaid === -1 ? null : new Set((process.argv[onlySaid + 1] ?? '').split(',').map((s) => Number(s.trim())));
const asked = QUESTIONS.filter((q) => only === null || only.has(q.n));

type Scored = { q: Question; predicate: boolean; answered: boolean; cited: string[]; pass: boolean; ms: number; code: string | null };

/** Whether the cited rows are every row `cite` names and nothing outside `cite` and `may`. */
const right = (q: Question, cited: readonly string[]): boolean => {
  const allowed = new Set([...q.cite, ...(q.may ?? [])]);
  return q.cite.every((c) => cited.includes(c)) && cited.every((c) => allowed.has(c));
};

const scored: Scored[] = [];
const faultOf = new Map<number, string>();
say(`Slash evaluation: ${asked.length} questions, ${provider} ${model} at ${baseUrl}`);
for (const q of asked) {
  spent.faults.length = 0;
  const started = performance.now();
  const read = await slash.read(q.ask, OWNER);
  let predicate = false;
  let answered = false;
  let cited: string[] = [];
  let code: string | null = null;
  if (!read.ok) code = 'refusal' in read ? read.refusal.code : 'CONFLICT';
  else {
    predicate = read.value.predicate !== null;
    const proposal = await slash.propose(q.ask, OWNER, undefined, read.value.ask_id);
    if (!proposal.ok) code = 'refusal' in proposal ? proposal.refusal.code : 'CONFLICT';
    else {
      answered = true;
      cited = [...new Set(proposal.value.citations)];
    }
  }
  const ms = Math.round(performance.now() - started);
  const pass = answered && right(q, cited);
  scored.push({ q, predicate, answered, cited, pass, ms, code });
  const first = spent.faults[0];
  if (first !== undefined) faultOf.set(q.n, first.slice(0, 300));
  const fault = first === undefined ? '' : `  (${first.slice(0, 160)})`;
  say(
    `${String(q.n).padStart(2)} ${pass ? 'pass' : 'FAIL'}  ${String(ms).padStart(6)} ms  predicate ${predicate ? 'yes' : 'no '}  ` +
      `answer ${answered ? 'yes' : `no, ${code}`}  cited ${cited.join(' ') || 'nothing'}  wanted ${q.cite.join(' ') || 'nothing'}${fault}`,
  );
}

const times = scored.map((s) => s.ms).sort((a, b) => a - b);
const at = (p: number): number => times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0;
const count = (f: (s: Scored) => boolean): number => scored.filter(f).length;
say('');
say(`cited right   ${count((s) => s.pass)} of ${scored.length}`);
say(`predicates    ${count((s) => s.predicate)} of ${scored.length} parsed, ${record.unevaluable} refused by the grammar`);
say(`answers       ${count((s) => s.answered)} of ${scored.length} parsed, ${record.filed.length} would have been filed on Decide`);
say(`latency       median ${at(0.5)} ms, slowest ${at(1)} ms, per question and both calls`);
say(`tokens        ${spent.in} in, ${spent.out} out, over ${spent.calls} calls`);

/**
 * What `--json` prints, the one shape `tools/model-checks` reads from both harnesses. `score` is the share that passed,
 * 0 to 100, which is what the bar in `baseline.json` is held to. A case's `fault` is the provider's own words for its
 * first failed call, so the runner can tell a provider that gave no answer (not measured) from an answer that was wrong.
 */
type Score = {
  suite: 'slash';
  model: string;
  passed: number;
  total: number;
  score: number;
  cases: { id: string; n: number; pass: boolean; ms: number; code: string | null; fault: string | null }[];
  tokens: { in: number; out: number; calls: number };
  latency: { median: number; slowest: number };
};
if (json) {
  const score: Score = {
    suite: 'slash',
    model,
    passed: count((s) => s.pass),
    total: scored.length,
    score: scored.length === 0 ? 0 : Math.round((100 * count((s) => s.pass)) / scored.length),
    cases: scored.map((s) => ({ id: String(s.q.n), n: s.q.n, pass: s.pass, ms: s.ms, code: s.code, fault: faultOf.get(s.q.n) ?? null })),
    tokens: { in: spent.in, out: spent.out, calls: spent.calls },
    latency: { median: at(0.5), slowest: at(1) },
  };
  console.log(JSON.stringify(score));
}

process.exit(scored.every((s) => s.pass) ? 0 : 1);
