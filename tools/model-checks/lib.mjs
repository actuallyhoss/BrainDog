/**
 * The model checks' rules, apart from the network, so `test/outcomes.test.mjs` can hold them (ENG-A03).
 *
 * THREE OUTCOMES AND NO FOURTH. `measured-pass`: the model answered and met its bar. `measured-below`: the model answered
 * and fell under it, or the route table names an id the provider does not serve; the only red. `not-measured`: the
 * provider gave no answer after three tries with a growing wait, or there is no token; yellow, exit 0, one warning line.
 * A timeout is never red, because a night the provider was slow says nothing about the prompt or the route.
 *
 * TWO OF THREE. A case that fails is asked up to twice more and passes when two of its three tries pass. A model is not
 * deterministic even at temperature 0, and a check that goes red on one unlucky answer is a check people learn to ignore.
 *
 * Plain Node, no package: the runner is a checkout and one command, and the lockfile is not this folder's.
 */

export const PASS = 'measured-pass';
export const BELOW = 'measured-below';
export const NONE = 'not-measured';

/** Why nothing was measured: no token is the owner's hands (a warning only), no answer is the provider's (counted). */
export const NO_TOKEN = 'no-token';
export const NO_ANSWER = 'no-answer';
export const CEILING = 'neuron-ceiling';

/** The default neuron ceilings: 22 cents and $1.10 at the very most, at $0.011 a thousand neurons (`slash.ts:86-87`). */
export const MAX_NEURONS = { small: 20_000, full: 100_000 };

/** The eight chosen cases `--small` asks: one a list and the cross-list and empty answers on Slash, two descriptions. */
export const SMALL = { slash: [1, 9, 16, 21, 28, 29], record: [1, 7] };

/** How many cases each harness holds (`questions.ts`, `cases.ts`), used only to reckon a full run's worst spend. */
export const CASES = { slash: 30, record: 16 };

/** The worst a harness case can spend, in neurons: two asks at the package's worst call (232, `worstAsk`) on Slash, three on a draft with its repairs. */
export const WORST_CASE = { slash: 2 * 257, record: 3 * 257 };

/**
 * Whether a provider's message means it gave no answer at all: a timeout, a dropped connection, a 5xx or a 429. The host's own words
 * for its clock running out (`packages/host/src/slash.ts`, "did not finish answering") count too. Anything else is an answer, and a 400 that refuses the schema or a 404 that names no such model is a measurement, not a blip.
 */
/* A STATUS COUNTS ONLY WHERE A STATUS IS WRITTEN: first in the message (`503: ...` here, `503 from ...` in the Slash harness) or
   after "answered" (`The Slash endpoint answered 503.` in the host). Anywhere else a 5xx is a number in the provider's words,
   such as "max_tokens above 512", and a refusal that says one is still an answer. */
const QUIET = /timeout|timed out|aborted|did not finish answering|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|network|(?:^|answered )(?:408|425|429|5\d\d)\b/iu;
export const noAnswer = (said) => typeof said === 'string' && said !== '' && QUIET.test(said);

/**
 * Whether the provider turned the token away (401 or 403), written where `QUIET` reads a status. That is the owner's hands and
 * not the model's answer: not measured, never red, and counted towards the three nights, so a token revoked or short of the
 * Workers AI permission is still mailed about.
 */
export const REFUSED = 'token-refused';
const TURNED_AWAY = /(?:^|answered )(?:401|403)\b/iu;
export const refused = (said) => typeof said === 'string' && TURNED_AWAY.test(said);

/** What the provider says when the id is not served, as `NO_SUCH_MODEL` in `apps/worker/src/inference.ts` matches it. */
const UNSERVED = /no such model|model not found|not a valid model|unknown model|\b404\b/iu;
export const unserved = (said) => typeof said === 'string' && UNSERVED.test(said);

/**
 * Any text the report keeps, with the token and the account cut out and the length held to 300. A provider's message can
 * quote the address it was sent to, and the address holds the account.
 */
export const scrub = (text, secrets = []) => {
  let out = String(text ?? '');
  for (const s of secrets) if (typeof s === 'string' && s.length >= 4) out = out.split(s).join('[hidden]');
  return out.slice(0, 300);
};

/**
 * One ask with three tries and a growing wait, the first two `waits` apart. `ask` resolves `{ answered, ...rest }`; a try
 * that was not answered is tried again, and one that was is final whatever it said. `sleep` is handed in so a test waits
 * for nothing.
 */
export async function tried(ask, { tries = 3, waits = [2_000, 8_000], sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let last = { answered: false, said: '' };
  for (let i = 0; i < tries; i++) {
    if (i > 0) await sleep(waits[i - 1] ?? waits.at(-1) ?? 0);
    try {
      last = await ask(i);
    } catch (e) {
      const said = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      last = { answered: !noAnswer(said), said };
    }
    if (last.answered) return { ...last, tries: i + 1 };
  }
  return { ...last, tries };
}

/**
 * A case's verdict from its tries so far, each `true` (passed), `false` (answered and failed) or `null` (no answer), at
 * most three. `pass` when the first answer passed or two answers did; `fail` on two answers that failed, which is two of
 * three that can no longer pass; `none` when the three tries ran out with neither, which a timeout alone can cause and
 * which is never red; `more` while another try could still decide it.
 */
export function verdict(results) {
  const answered = results.filter((r) => r !== null);
  const passed = answered.filter((r) => r === true).length;
  const failed = answered.length - passed;
  if (answered[0] === true || passed >= 2) return 'pass';
  if (failed >= 2) return 'fail';
  return results.length >= 3 ? 'none' : 'more';
}

/**
 * A suite's outcome from its settled cases and its bar (a share, 0 to 100, or `null` before the first full run). Cases
 * with no answer are left out of the share; if fewer than half were answered, nothing was measured. With no bar yet the
 * suite cannot fall below one, so it passes and says what the bar would be.
 */
export function suiteOutcome(cases, bar) {
  const measured = cases.filter((c) => c.verdict === 'pass' || c.verdict === 'fail');
  const passed = measured.filter((c) => c.verdict === 'pass').length;
  if (cases.length === 0 || measured.length * 2 < cases.length) return { outcome: NONE, reason: NO_ANSWER, score: null, measured: measured.length, of: cases.length };
  const score = Math.round((100 * passed) / measured.length);
  const outcome = bar === null || bar === undefined || score >= bar ? PASS : BELOW;
  return { outcome, score, bar: bar ?? null, measured: measured.length, of: cases.length, passed };
}

/**
 * One route's outcome from its ask. Served and the schema honoured is a pass. Answered and not served, or served and the
 * schema broken or refused, is red: the Worker would fail every call on that row. No answer is not measured.
 */
export function routeOutcome(ask) {
  if (!ask.answered) return NONE;
  return ask.served && ask.strict ? PASS : BELOW;
}

/** The run's outcome: red if anything was red, else yellow if anything went unmeasured, else green. */
export const overall = (outcomes) => (outcomes.includes(BELOW) ? BELOW : outcomes.length === 0 || outcomes.includes(NONE) ? NONE : PASS);

/**
 * Whether tonight mails the operator, from the nights so far, newest last: two scheduled nights below the bar running, or
 * three scheduled nights with no measurement from a provider that was asked. A night with no token is the owner's hands,
 * says so in one warning line, and is neither counted nor mailed. A run by hand is not a night.
 */
export function alarm(history) {
  const nights = history.filter((h) => h.scheduled && h.reason !== NO_TOKEN);
  const last = (n) => nights.slice(-n);
  if (last(2).length === 2 && last(2).every((h) => h.outcome === BELOW)) return { why: 'below', nights: 2 };
  if (last(3).length === 3 && last(3).every((h) => h.outcome === NONE)) return { why: 'not-measured', nights: 3 };
  return null;
}

/** How many nights a report carries forward: a fortnight is enough for either rule and to see a trend. */
export const KEPT = 14;

/** Neurons an answered ask cost, from the provider's token counts and the row's own rates (`ROUTED`). */
export const neurons = (route, usage) => Math.ceil(((usage?.in ?? 0) * route.inPerM + (usage?.out ?? 0) * route.outPerM) / 1_000_000);

/** The worst an ask could cost before it is sent, as `aiInference` reckons it: every prompt byte, and the output at its ceiling. */
export const worst = (route, prompt, maxTokens) =>
  Math.ceil((Math.ceil(new TextEncoder().encode(prompt).length / 4) * route.inPerM + maxTokens * route.outPerM) / 1_000_000);

/** Whether a changed file is watched: an exact path, or a folder written as `dir/**`. */
export const watches = (globs, file) => globs.some((g) => (g.endsWith('/**') ? file.startsWith(g.slice(0, -2)) : file === g));

/** The flags, read plainly. An unknown flag is an error, so a typo never runs the expensive default. */
export function parseArgs(argv) {
  const out = { routes: false, suites: [], small: false, changed: null, maxNeurons: null, out: 'model-checks.json', history: null, scheduled: false, setBaseline: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--routes') out.routes = true;
    else if (a === '--suite') {
      const v = next();
      if (v === 'limits') throw new Error('--suite limits is not built yet: ENG-A14 fills it');
      if (v !== 'slash' && v !== 'record') throw new Error(`--suite takes slash or record, not ${v}`);
      out.suites.push(v);
    } else if (a === '--small') out.small = true;
    else if (a === '--changed') out.changed = next();
    else if (a === '--max-neurons') {
      const v = next();
      if (!/^[0-9]+$/u.test(v)) throw new Error(`--max-neurons takes a whole number, not ${v}`);
      out.maxNeurons = Number(v);
    } else if (a === '--out') out.out = next();
    else if (a === '--history') out.history = next();
    else if (a === '--scheduled') out.scheduled = true;
    else if (a === '--set-baseline') out.setBaseline = true;
    else throw new Error(`unknown flag ${a}`);
  }
  /* `--small` IS THE ROUTES AND EIGHT CASES, and nothing named is everything. */
  if (out.small || (!out.routes && out.suites.length === 0)) {
    out.routes = true;
    if (out.suites.length === 0) out.suites = ['slash', 'record'];
  }
  out.maxNeurons ??= out.small ? MAX_NEURONS.small : MAX_NEURONS.full;
  return out;
}
