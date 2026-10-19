/**
 * The uptime check: five probes of brain.dog from a Worker that shares nothing with it.
 *
 * WHY A WORKER OF ITS OWN. A check run by the site Worker or the app Worker goes down with it. This one goes through
 * the public name, so DNS, the edge, the site Worker and the app Worker are all in the path it measures.
 *
 * FIVE PROBES: the site (`/`), the app shell (`/app`), `/healthz` with `"ok":true`, the MCP door, and the sign-in page.
 * The MCP probe sends no token and wants the 401 that points an agent at OAuth (RFC 9728), because a 200 there would
 * mean the door is open and a 5xx that it is broken.
 *
 * TWO IN A ROW MAIL ONCE, THE FIRST GOOD RUN AFTER MAILS ONCE MORE. The count lives in KV so a fresh isolate does not
 * forget it; with no KV bound it falls back to this isolate's memory and errs towards quiet.
 *
 * EVERY PROBE'S LATENCY IS WRITTEN, ok or not, to Analytics Engine and to the log, and a probe over SLOW_MS is marked
 * `slow` in the log without being a failure, so a slow day shows before it is a down one.
 */

export const SLOW_MS = 3_000;
const TIMEOUT_MS = 10_000;

type Mail = { from: { email: string; name: string }; to: string; subject: string; text: string };

export type Env = {
  EMAIL?: { send(message: Mail): Promise<unknown> };
  STATE?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };
  PROBES?: { writeDataPoint(point: { indexes: string[]; blobs: string[]; doubles: number[] }): void };
  OPS_ALERT_TO?: string;
  MAIL_FROM?: string;
  WATCH_HOST?: string;
};

export type Result = { name: string; ok: boolean; status: number; ms: number; why: string | null };

type Probe = { name: string; method: 'GET' | 'POST'; path: string; body?: string; judge: (res: Response) => Promise<string | null> };

const status200 = async (res: Response): Promise<string | null> => (res.status === 200 ? null : `status ${res.status}`);

export const PROBES: Probe[] = [
  { name: 'site', method: 'GET', path: '/', judge: status200 },
  { name: 'app', method: 'GET', path: '/app', judge: status200 },
  {
    name: 'healthz',
    method: 'GET',
    path: '/healthz',
    judge: async (res) => {
      if (res.status !== 200) return `status ${res.status}`;
      const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      return body?.ok === true ? null : 'answered 200 without "ok":true';
    },
  },
  {
    name: 'mcp',
    method: 'POST',
    path: '/mcp',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'watchdog', version: '0' } } }),
    judge: async (res) => {
      if (res.status !== 401) return `status ${res.status}, wanted 401`;
      return (res.headers.get('www-authenticate') ?? '').includes('resource_metadata') ? null : '401 without the OAuth metadata header';
    },
  },
  { name: 'signin', method: 'GET', path: '/app/signin', judge: status200 },
];

/** One probe: how long it took and why it failed, if it did. A thrown fetch or a timeout is a failure, never an exception. */
export async function run(probe: Probe, host: string, fetcher: typeof fetch = fetch): Promise<Result> {
  const began = Date.now();
  let status = 0;
  let why: string | null;
  try {
    const res = await fetcher(`https://${host}${probe.path}`, {
      method: probe.method,
      ...(probe.body === undefined ? {} : { body: probe.body, headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' } }),
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    why = await probe.judge(res);
  } catch (e) {
    why = `unreachable (${e instanceof Error ? e.name : 'thrown'})`;
  }
  return { name: probe.name, ok: why === null, status, ms: Date.now() - began, why };
}

type State = { failures: number; downSince: string; failing: string[] };
let memory: State = { failures: 0, downSince: '', failing: [] };

async function load(env: Env): Promise<State> {
  if (!env.STATE) return memory;
  try {
    return { ...memory, ...(JSON.parse((await env.STATE.get('state')) ?? '{}') as Partial<State>) };
  } catch {
    return memory;
  }
}

async function save(env: Env, state: State): Promise<void> {
  memory = state;
  try {
    await env.STATE?.put('state', JSON.stringify(state));
  } catch {
    console.error(JSON.stringify({ op: 'watch', state: 'not saved' }));
  }
}

/** One plain mail to the operator. A failed send is a log line: five minutes on there is another chance to be seen. */
async function tell(env: Env, subject: string, text: string): Promise<void> {
  const to = env.OPS_ALERT_TO?.trim() ?? '';
  const from = env.MAIL_FROM?.trim() ?? '';
  if (to === '' || from === '' || !env.EMAIL) return;
  try {
    await env.EMAIL.send({ from: { email: from, name: 'BrainDog' }, to, subject, text });
  } catch {
    console.error(JSON.stringify({ op: 'watch', mail: 'failed' }));
  }
}

export async function watch(env: Env, now = new Date(), fetcher: typeof fetch = fetch): Promise<Result[]> {
  const host = env.WATCH_HOST?.trim() || 'brain.dog';
  const results = await Promise.all(PROBES.map((p) => run(p, host, fetcher)));
  for (const r of results) {
    env.PROBES?.writeDataPoint({ indexes: [r.name], blobs: [r.name, r.ok ? 'ok' : 'fail'], doubles: [r.ms, r.status] });
    console.log(JSON.stringify({ op: 'probe', name: r.name, ok: r.ok, status: r.status, ms: r.ms, slow: r.ms > SLOW_MS, ...(r.why ? { why: r.why } : {}) }));
  }
  const bad = results.filter((r) => !r.ok);
  const state = await load(env);
  if (bad.length === 0) {
    if (state.failures >= 2) await tell(env, 'BrainDog is up again', `Every probe of https://${host} passes again, at ${now.toISOString()}. It failed from ${state.downSince}.`);
    await save(env, { failures: 0, downSince: '', failing: [] });
    return results;
  }
  const failures = state.failures + 1;
  const next: State = { failures, downSince: failures === 2 ? now.toISOString() : state.downSince, failing: bad.map((r) => r.name) };
  await save(env, next);
  console.error(JSON.stringify({ op: 'watch', ok: false, failures, failing: next.failing }));
  if (failures === 2) {
    await tell(
      env,
      'BrainDog is down',
      [
        `https://${host} failed two runs in a row, the last at ${next.downSince}:`,
        ...bad.map((r) => `- ${r.name}: ${r.why}`),
        '',
        `Runbook: if it started with a deploy, DEPLOYMENT.md "Rolling back"; otherwise the app Worker's Workers Logs, and 53 §5.11.`,
        'Nothing more is mailed until every probe passes again.',
      ].join('\n'),
    );
  }
  return results;
}

export default {
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await watch(env);
  },
};
