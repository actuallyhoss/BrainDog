/**
 * Slash asked once on a real host, as a signed-in person, with what each ask cost in time and whether it came back readable.
 *
 *   BRAINDOG_SESSION=<cookie value> node tools/slash-smoke.mjs --base https://app.brain.dog/app/<slug>
 *   BRAINDOG_SESSION=<cookie value> node tools/slash-smoke.mjs --base http://localhost:8787 --rule <automation id> --look
 *
 *   --base      the record's address, as the app's `apiBase()` builds it: the origin, and `/app/<slug>` where the host
 *               keeps more than one record
 *   --ask       the question the read and the propose are asked (default: what is due in the next thirty days)
 *   --rule      an automation with a Run now button and an `ask_slash` step: it is run once and its step is watched
 *   --look      Slash's daily look, run once where today's has not run yet
 *   --wait      how many seconds a rule's step or the daily look is waited for (default 90)
 *
 * WHY IT EXISTS. Every Slash test drives the package over a canned model, so none of them says which model production
 * answers with, how long an ask takes there, or whether Workers AI accepts the strict `json_schema` the Worker's adapter
 * sends (`apps/worker/src/inference.ts`, `formatFor`). Those three are facts about a deployed host, and `docs/46` §7.1
 * records them from this script's output (`loop/finish/agents.md` AGT-30).
 *
 * A BROWSER SESSION AND NOT A TOKEN, because every Slash door refuses a bearer (`serveSlash` in
 * `packages/host/src/slash-ask.ts`, `NEEDS_BROWSER_SESSION`) and `automationRun` and `slash` are the owner's in a browser.
 * The cookie's value is read from the environment and never from an argument, so it does not land in a shell's history,
 * and nothing here prints it. Copy it from the browser's storage panel for the host, under `__Host-bd_s` on https or
 * `bd_s` on a loopback http address (`COOKIE` in `packages/host/src/auth.ts`).
 *
 * `Origin` IS THE BASE'S OWN ON EVERY REQUEST. A POST to a Slash door with none is refused as a page elsewhere, a cookie
 * POST to a method is held to `sameOrigin`, and the status door admits a named origin it answers for, so one header
 * satisfies all three.
 *
 * WHAT IT CHANGES ON THE RECORD. The read writes a ledger row and the propose files one suggestion on Decide when the
 * model answers with anything but a query; the id is printed so it can be dismissed. `--rule` runs the automation once,
 * with everything its steps do. `--look` only makes the requests after which the host runs the look it would have run on
 * its next alarm. Each model call counts against the month's asks, as the owner's own would.
 *
 * It exits 1 when any step it was asked to run did not come back readable, so it can stand as a check after a deploy.
 */

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? undefined : (args[at + 1] ?? '');
};
const has = (name) => args.includes(`--${name}`);

const baseSaid = flag('base');
const cookieValue = process.env.BRAINDOG_SESSION ?? '';
if (!baseSaid || cookieValue === '') {
  console.error('Usage: BRAINDOG_SESSION=<cookie value> node tools/slash-smoke.mjs --base <record address> [--ask <question>] [--rule <id>] [--look] [--wait <seconds>]');
  process.exit(2);
}

const base = baseSaid.replace(/\/+$/, '');
const origin = new URL(base).origin;
/* THE COOKIE'S NAME FOLLOWS THE ADDRESS, as `cookieMode` decides it: `__Host-` on https, the bare name on loopback http. */
const cookieName = new URL(base).protocol === 'https:' ? '__Host-bd_s' : 'bd_s';
const question = flag('ask') ?? 'What is due in the next thirty days?';
const waitMs = Math.max(1, Number(flag('wait') ?? '90') || 90) * 1000;

let failed = false;
const say = (line) => console.log(line);
const fail = (line) => {
  failed = true;
  console.log(line);
};

/** One request as the signed-in person, with the time it took and the answer's envelope, or the reason there is none. */
async function ask(method, path, body) {
  const headers = { cookie: `${cookieName}=${cookieValue}`, origin };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const started = performance.now();
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return { ms: Math.round(performance.now() - started), status: 0, out: null, why: e instanceof Error ? e.message : String(e) };
  }
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  let out = null;
  try {
    out = JSON.parse(text);
  } catch {
    return { ms, status: res.status, out: null, why: `${res.status} with a body that is not JSON` };
  }
  if (out === null || typeof out !== 'object' || typeof out.ok !== 'boolean') return { ms, status: res.status, out: null, why: `${res.status} with no ok in the answer` };
  return { ms, status: res.status, out, why: null };
}

/** A refusal in one line: its code, where, and its sentence. */
const refusedLine = (r) => {
  if (r.out === null) return r.why ?? 'no answer';
  const f = r.out.refusal ?? {};
  return `${f.code ?? 'REFUSED'}${f.at ? ` at ${f.at}` : ''}: ${f.fix ?? ''}`.trim();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (s, n = 160) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1)}…` : s);

say(`Slash on ${base}`);

/* ── status ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const status = await ask('GET', '/api/slash/status');
let source = null;
if (status.out?.ok) {
  const s = status.out.value;
  source = s.source ?? null;
  say(`status   ${status.ms} ms  model ${s.model}  source ${s.source}${s.provider ? ` (${s.provider})` : ''}  asks ${s.asks?.used}/${s.asks?.cap}${s.asks?.capped ? '' : ', not capped'}`);
} else fail(`status   ${status.ms} ms  refused  ${refusedLine(status)}`);

/* ── one read, then one propose on the same ask ─────────────────────────────────────────────────────────────────────── */

/* The codes a model's answer that did not fit its schema comes back as, on the included model and on a key. Anything
   else refused is the host, the vault or the cap, which says nothing about the schema. */
const SCHEMA_CODES = new Set(['PROPOSAL_SCHEMA', 'ANSWER_UNREADABLE', 'PROPOSAL_UNCITED']);
const answered = { parsed: 0, unreadable: [], other: [] };
const tally = (r) => {
  if (r.out?.ok) answered.parsed++;
  else if (SCHEMA_CODES.has(r.out?.refusal?.code)) answered.unreadable.push(r.out.refusal.code);
  else answered.other.push(r.out?.refusal?.code ?? r.why);
};

let askId;
if (status.out?.ok) {
  const read = await ask('POST', '/api/slash/read', { question });
  tally(read);
  if (read.out?.ok) {
    const v = read.out.value;
    askId = v.ask_id;
    const how = v.predicate !== null ? 'yes, a predicate' : v.q ? `a keyword search instead ("${clip(v.q, 40)}")` : 'no predicate and no keywords';
    say(`read     ${read.ms} ms  parsed ${how}  rows ${v.rows?.length ?? 0}  from ${(v.read ?? []).map((t) => t.register).join(', ') || 'nothing'}`);
  } else fail(`read     ${read.ms} ms  parsed no  ${refusedLine(read)}`);

  const propose = await ask('POST', '/api/slash/propose', askId === undefined ? { question } : { question, ask_id: askId });
  tally(propose);
  if (propose.out?.ok) {
    const p = propose.out.value;
    say(`propose  ${propose.ms} ms  parsed yes  model ${p.model}  ${p.body_kind}${p.filed ? `, filed ${p.filed} on Decide` : ''}  cites ${(p.citations ?? []).join(' ') || 'nothing'}`);
    say(`         ${clip(p.text)}`);
  } else fail(`propose  ${propose.ms} ms  parsed no  ${refusedLine(propose)}`);

  /* THE SCHEMA VERDICT IS THE INCLUDED MODEL'S ONLY. On his own key the adapter is his provider's, and Anthropic's carries
     the schema in the system prompt (`withSchema` in `packages/host/src/slash.ts`), so a parse there says nothing about
     Workers AI. */
  if (source === 'included') {
    if (answered.parsed > 0) say(`json_schema  accepted: ${answered.parsed} of 2 answers parsed against the strict schema`);
    else if (answered.unreadable.length > 0) say(`json_schema  sent and not honoured: ${answered.unreadable.join(', ')}`);
    else say(`json_schema  not shown: no model answer came back (${answered.other.join(', ')})`);
  }
}

/* ── an automation's question, once ─────────────────────────────────────────────────────────────────────────────────── */

const rule = flag('rule');
if (rule !== undefined) {
  const started = performance.now();
  const run = await ask('POST', '/api/automationRun', { rule });
  if (!run.out?.ok) fail(`ask_slash  refused  ${refusedLine(run)}`);
  else {
    const id = run.out.value?.run;
    /* THE HOST ANSWERS THE STEP ON ITS OWN PASS, the Worker's alarm or the self-host's poll (`serveAsks`), so the run is
       read back until its `ask_slash` step settles or the run ends. Each read is also a request that wakes the object. */
    let step = null;
    let last = null;
    while (performance.now() - started < waitMs) {
      const read = await ask('GET', `/api/automations?rule=${encodeURIComponent(rule)}&limit=1`);
      last = (read.out?.ok ? read.out.value?.runs ?? [] : []).find((r) => r.id === id) ?? null;
      step = last?.steps?.find((s) => s.kind === 'ask_slash') ?? null;
      const settled = step !== null && step.state !== 'waiting' && step.state !== 'pending' && step.state !== 'running';
      if (settled || (last !== null && ['done', 'failed', 'cancelled'].includes(last.state))) break;
      await sleep(2000);
    }
    const ms = Math.round(performance.now() - started);
    if (last === null) fail(`ask_slash  ${ms} ms  run ${id} was not found under ${rule}`);
    else if (step === null) fail(`ask_slash  ${ms} ms  run ${id} ${last.state} with no ask_slash step${last.say ? `: ${clip(last.say)}` : ''}`);
    else if (step.answer === null || step.state === 'waiting') fail(`ask_slash  ${ms} ms  run ${id} still ${step.state} after ${waitMs / 1000} s`);
    else {
      const line = `ask_slash  ${ms} ms  run ${id} ${last.state}, step ${step.n} ${step.state}  ${clip(step.answer)}`;
      if (last.state === 'failed') fail(line);
      else say(line);
    }
  }
}

/* ── the daily look, once ───────────────────────────────────────────────────────────────────────────────────────────── */

if (has('look')) {
  const today = new Date().toISOString().slice(0, 10);
  const started = performance.now();
  let seen = await ask('GET', '/api/slash');
  if (!seen.out?.ok) fail(`look     refused  ${refusedLine(seen)}`);
  else if (seen.out.value?.daily?.on === false) say('look     off: the owner turned the daily look off, so there is nothing to run');
  else if (seen.out.value?.daily?.last === today) say(`look     already ran today (${today}); the record runs it once a UTC day, model ${seen.out.value.model ?? 'none'}`);
  else {
    /* THE HOST RUNS IT AFTER A REQUEST, NOT BECAUSE OF ONE: the Worker's `slashLook` rides `waitUntil` beside every record
       request, and the self-host's rides its poll. So the record is read until it says today's has run. */
    while (performance.now() - started < waitMs && seen.out?.value?.daily?.last !== today) {
      await sleep(2000);
      seen = await ask('GET', '/api/slash');
    }
    const ms = Math.round(performance.now() - started);
    if (seen.out?.value?.daily?.last === today) say(`look     ran in under ${ms} ms, model ${seen.out.value.model ?? 'none'}, ${seen.out.value.waiting?.length ?? 0} waiting on Decide`);
    else fail(`look     had not run after ${waitMs / 1000} s (last ${seen.out?.value?.daily?.last ?? 'never'})`);
  }
}

process.exit(failed ? 1 : 0);
