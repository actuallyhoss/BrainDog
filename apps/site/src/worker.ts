/**
 * The site Worker's only code: a request for one of the app's doors, handed to the app Worker whole.
 *
 * IT RUNS ONLY FOR THE PATHS `wrangler.jsonc` LISTS IN `run_worker_first`, AND ONLY WHERE THE SAME ENVIRONMENT BINDS
 * `APP`. Every other path is a file or the site's `404.html`, answered by the asset layer before this runs: through
 * `wrangler dev -c site -c app` on 23 September, `/pricing`, `/nope/deep/er`, a POST and a PUT to `/nope/deep/er` and a
 * POST to `/pricing` never reached this function, and every listed door did. So a 404 costs no invocation, and a miss is never a place for logic to run.
 *
 * NOTHING IS COPIED, ADDED OR REWRITTEN. The app reads its host from the URL, its CSRF check from `Origin` and its
 * session from `Cookie`, and a service binding carries the request as it arrived: the app saw the URL, method, body and
 * headers this function saw, `cf-connecting-ip` included, and its `Set-Cookie` headers and redirects came back as it sent
 * them (section 2.2). `test/forward.test.ts` holds the function to that by identity.
 *
 * AND ONE CRON, THE UPTIME WATCHDOG (`watch`), which is here and not in the app Worker because a check the app ran on
 * itself could not see the app down.
 */

type Env = {
  APP: { fetch(request: Request): Promise<Response> };
  /** The `send_email` binding the app Worker sends with, bound in production for the watchdog alone. */
  EMAIL?: { send(message: { from: { email: string; name: string }; to: string; subject: string; text: string }): Promise<unknown> };
  /** Where the watchdog mails. Unset, and it checks and logs but mails nobody. */
  OPS_ALERT_TO?: string;
  MAIL_FROM?: string;
};

/*
 * THE WATCHDOG'S STATE IS THIS ISOLATE'S, because the site binds no storage and one counter is not worth a KV
 * namespace. A cron invocation that lands on a fresh isolate starts from zero, so an outage can take more than two
 * minutes to mail, and a recovery seen by a fresh isolate mails nothing. It errs towards quiet, never towards a storm.
 */
let failures = 0;
let downSince = '';

/** Why `/healthz` is not healthy, or `null` when it answered 200 with `"ok":true`. */
async function sick(env: Env): Promise<string | null> {
  try {
    const answer = await env.APP.fetch(new Request('https://brain.dog/healthz'));
    if (answer.status !== 200) return `status ${answer.status}`;
    const body = (await answer.json()) as { ok?: unknown } | null;
    return body?.ok === true ? null : 'answered 200 without "ok":true';
  } catch (e) {
    return `unreachable (${e instanceof Error ? e.name : 'thrown'})`;
  }
}

/** One plain mail to the operator. A send that fails is a log line: the next minute is another chance to be seen. */
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

/**
 * The uptime check, once a minute from the cron in `wrangler.jsonc`: the app's `/healthz` through `APP`, the path a
 * visitor's request takes, so a dead app Worker is seen by a Worker that is still up.
 *
 * TWO FAILURES IN A ROW MAIL ONCE, AND THE FIRST SUCCESS AFTER THEM MAILS ONCE MORE. One failure is a blip a retry
 * would have hidden; a mail on every minute of an outage is a mail nobody reads.
 */
export async function watch(env: Env, now = new Date()): Promise<void> {
  const why = await sick(env);
  if (why === null) {
    if (failures >= 2) await tell(env, 'BrainDog is up again', `https://brain.dog/healthz answers again, at ${now.toISOString()}. It failed from ${downSince}.`);
    failures = 0;
    return;
  }
  failures += 1;
  console.error(JSON.stringify({ op: 'watch', ok: false, failures, why }));
  if (failures !== 2) return;
  downSince = now.toISOString();
  await tell(
    env,
    'BrainDog is down',
    [
      `https://brain.dog/healthz failed twice in a row, the last at ${downSince}: ${why}.`,
      '',
      `Runbook: if it started with a deploy, DEPLOYMENT.md "Rolling back"; otherwise the app Worker's Workers Logs, and 53 §5.11.`,
      'Nothing more is mailed until it answers again.',
    ].join('\n'),
  );
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.APP.fetch(request);
  },

  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await watch(env);
  },
};
