/**
 * `settings`: read the repository's settings on GitHub once a day and hold them to what was decided.
 *
 *   node tools/watch/settings.mjs                     the repository GITHUB_REPOSITORY names, with WATCH_TOKEN
 *   node tools/watch/settings.mjs --repo owner/name   another repository, the same questions
 *
 * WHAT WAS DECIDED IS `.github/settings.expected.json`: the rules on master, secret scanning, push protection, validity
 * checks, private vulnerability reporting, Actions off or taking only chosen actions pinned to a commit, the workflow
 * token's default, no registered runner, the wiki and Discussions off, the description the README's first heading, the
 * production environment's reviewers and branches, and no open high or critical alert. One line a setting, every miss printed under its line, never the first only.
 *
 * `at: public` IS A SETTING FREE ONLY ONCE THE REPOSITORY IS PUBLIC. While it is private and the setting is
 * off, the line reads `waits on going public` and is not red. The day it is public, the same line off is a miss.
 *
 * A READ-ONLY FINE-GRAINED TOKEN, `WATCH_TOKEN`, because the workflow's own token cannot read alerts or the security
 * settings. He makes it and puts it as a secret; nothing here makes, stores or prints one. Its value goes in one
 * header to `https://api.github.com` and nowhere else: every URL is held to that origin, a redirect is refused rather
 * than followed, and every printed line has the value cut out in case GitHub ever echoed it. Every question is a GET.
 *
 * WITH NO TOKEN IT SKIPS: `skipped: no read-only token`, exit 0, so a fork or a checkout without the secret is not red.
 *
 * EXIT CODES: 0 when every setting is as decided (or waits on going public), 1 when any is not.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The one origin the token is sent to. */
export const API = 'https://api.github.com';

/** How long one question waits. */
export const ASK_MS = 10_000;

/** The rule types of a ruleset, in words. A type with no words here is printed as GitHub names it. */
const RULE_WORDS = {
  deletion: 'deletion',
  non_fast_forward: 'force push',
  creation: 'creation',
  update: 'update',
  pull_request: 'pull request',
  required_signatures: 'signed commits',
  required_status_checks: 'status checks',
  required_linear_history: 'linear history',
};
const ruleWord = (type) => RULE_WORDS[type] ?? type;

/** The README's first heading, the first line a reader sees under the banner. */
export function readmeLine(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const heading = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) return heading[1];
  }
  return '';
}

/** Why a question got no answer to judge, in words, from its status alone. */
function unread(r) {
  if (r.error) return r.error;
  if (r.status === 401) return 'GitHub refused the token';
  if (r.status === 403) return 'the token may not read this (GitHub answered 403)';
  if (r.status === 404) return 'GitHub says there is none, or the token may not read it (404)';
  return `GitHub answered ${r.status}`;
}

/** One GET to the API with the token: `{ status, body }`, or `{ status: 0, error }` when nothing answered. */
async function get(ask, token, path, ms) {
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error('only api.github.com is asked');
  try {
    const res = await ask(url.href, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(ms),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'braindog-watch',
        'x-github-api-version': '2022-11-28',
      },
    });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: null, error: err?.name === 'TimeoutError' ? `no answer within ${ms / 1000} seconds` : 'GitHub could not be reached' };
  }
}

/** Every answer the comparison needs, read once each. Nothing is written. */
export async function readRepository({ repo, token, branch, severity, ask = fetch, ms = ASK_MS }) {
  const base = `/repos/${repo}`;
  const ask1 = (path) => get(ask, token, `${base}${path}`, ms);
  const [info, rules, reporting, actions, token_, runners, production, alerts] = await Promise.all([
    ask1(''),
    ask1(`/rules/branches/${encodeURIComponent(branch)}`),
    ask1('/private-vulnerability-reporting'),
    ask1('/actions/permissions'),
    ask1('/actions/permissions/workflow'),
    ask1('/actions/runners?per_page=1'),
    ask1('/environments/production'),
    ask1(`/dependabot/alerts?state=open&severity=${severity.join(',')}&per_page=100`),
  ]);
  return { info, rules, reporting, actions, workflowToken: token_, runners, production, alerts };
}

const ok = (says, note = '') => ({ says, state: 'ok', note, miss: null });
const miss = (says, why) => ({ says, state: 'miss', note: '', miss: why });
const wait = (says) => ({ says, state: 'wait', note: 'waits on going public', miss: null });

/**
 * The answers held to the expected file: one line a setting, `ok`, `miss` with why, or `wait` for a setting free only
 * once public while the repository is still private. `readme` is the README's text, for the description.
 */
export function compare(expected, got, readme) {
  const out = [];
  const info = got.info.status === 200 ? got.info.body ?? {} : null;
  const isPublic = info?.visibility === 'public' || info?.private === false;
  /* A setting `at: public` that is off waits while private; on, or once public, it is judged as any other. */
  const judged = (says, want, on, onWord, why) =>
    on ? ok(says, onWord) : want.at === 'public' && info && !isPublic ? wait(says) : miss(says, why);

  if (got.rules.status !== 200 || !Array.isArray(got.rules.body)) {
    out.push(miss(`the rules on ${expected.branch}`, unread(got.rules)));
  } else {
    const have = new Set(got.rules.body.map((r) => String(r?.type ?? '')));
    const want = new Set(expected.rules);
    const lacking = [...want].filter((t) => !have.has(t)).map(ruleWord);
    const extra = [...have].filter((t) => !want.has(t)).map(ruleWord);
    const says = `the rules on ${expected.branch}: ${expected.rules.map(ruleWord).join(', ')}`;
    const why = [lacking.length ? `not held: ${lacking.join(', ')}` : '', extra.length ? `held and not decided: ${extra.join(', ')}` : ''];
    out.push(lacking.length || extra.length ? miss(says, why.filter(Boolean).join('; ')) : ok(says));
  }

  const sa = info?.security_and_analysis ?? null;
  for (const [key, field, says] of [
    ['secret_scanning', 'secret_scanning', 'secret scanning is on'],
    ['push_protection', 'secret_scanning_push_protection', 'push protection is on'],
    ['validity_checks', 'secret_scanning_validity_checks', 'validity checks are on'],
  ]) {
    const want = expected[key];
    const status = sa?.[field]?.status;
    const why = !info ? unread(got.info) : !sa ? 'GitHub did not say; the token needs Administration: read' : `GitHub says ${status ?? 'nothing'}`;
    out.push(judged(says, want, status === want.want, '', why));
  }

  const pvr = got.reporting.status === 200 ? got.reporting.body?.enabled : undefined;
  out.push(judged('private vulnerability reporting is on', expected.private_reporting, pvr === expected.private_reporting.want, '',
    pvr === undefined ? unread(got.reporting) : 'GitHub says it is off'));

  /* OFF IS AS GOOD AS CHOSEN. A public repository with Actions on and every action allowed runs a stranger's new workflow
     file on the first approved pull request, so this is either switched off or held to a list and to whole commits. */
  const actions = got.actions.status === 200 ? got.actions.body ?? {} : null;
  const actionsSays = 'Actions are off, or take only chosen actions pinned to a commit';
  const chosen = expected.actions.off_or;
  out.push(judged(actionsSays, expected.actions,
    actions !== null && (actions.enabled === false || (actions.allowed_actions === chosen.allowed_actions && actions.sha_pinning_required === chosen.sha_pinning_required)), '',
    actions === null ? unread(got.actions) : `they are on, allowing ${actions.allowed_actions ?? 'nothing said'}, pinning ${actions.sha_pinning_required ? 'required' : 'not required'}`));

  const tokenSays = `the workflow token defaults to ${expected.workflow_token.default} and ${expected.workflow_token.can_approve ? 'may' : 'may not'} approve a pull request`;
  const tok = got.workflowToken.status === 200 ? got.workflowToken.body ?? {} : null;
  out.push(tok && tok.default_workflow_permissions === expected.workflow_token.default && tok.can_approve_pull_request_reviews === expected.workflow_token.can_approve
    ? ok(tokenSays)
    : miss(tokenSays, tok ? `it defaults to ${tok.default_workflow_permissions}, approving ${tok.can_approve_pull_request_reviews ? 'allowed' : 'refused'}` : unread(got.workflowToken)));

  const count = got.runners.status === 200 ? Number(got.runners.body?.total_count) : NaN;
  const runnersSays = expected.runners === 0 ? 'no runner is registered' : `${expected.runners} runners are registered`;
  out.push(count === expected.runners ? ok(runnersSays) : miss(runnersSays, Number.isFinite(count) ? `${count} registered` : unread(got.runners)));

  for (const [field, want, word] of [['has_wiki', expected.wiki, 'the wiki'], ['has_discussions', expected.discussions, 'Discussions']]) {
    const says = `${word} is ${want ? 'on' : 'off'}`;
    out.push(!info ? miss(says, unread(got.info)) : info[field] === want ? ok(says) : miss(says, `GitHub says it is ${info[field] ? 'on' : 'off'}`));
  }

  const line = readmeLine(readme);
  const descSays = `the description is ${expected.description.from}'s first heading`;
  out.push(!line ? miss(descSays, `${expected.description.from} has no heading`)
    : !info ? miss(descSays, unread(got.info))
    : info.description === line ? ok(descSays, line)
    : miss(descSays, `it is "${info.description ?? ''}", and the heading is "${line}"`));

  for (const [env, most] of Object.entries(expected.reviewers)) {
    const says = `the ${env} environment has ${most === 0 ? 'no required reviewer' : `${most} required reviewers`}`;
    const r = env === 'production' ? got.production : { status: 0, error: `${env} is not read` };
    if (r.status !== 200) {
      out.push(miss(says, r.status === 404 ? `there is no ${env} environment` : unread(r)));
      continue;
    }
    const rule = (r.body?.protection_rules ?? []).find((p) => p?.type === 'required_reviewers');
    const n = Array.isArray(rule?.reviewers) ? rule.reviewers.length : 0;
    out.push(n === most ? ok(says) : miss(says, `GitHub says ${n}`));
  }

  /* A BRANCH POLICY, because an environment with none hands its secrets to a job on any branch that names it. */
  const branchesSays = 'the production environment deploys from chosen branches only';
  if (got.production.status === 200) out.push(judged(branchesSays, expected.production_branches, Boolean(got.production.body?.deployment_branch_policy), '', 'any branch may name it'));

  const alerts = got.alerts.status === 200 && Array.isArray(got.alerts.body) ? got.alerts.body : null;
  const sev = expected.open_alerts.severity.join(' or ');
  const alertSays = `${expected.open_alerts.most === 0 ? 'no' : `at most ${expected.open_alerts.most}`} open ${sev} alert`;
  if (!alerts) out.push(miss(alertSays, unread(got.alerts)));
  else if (alerts.length <= expected.open_alerts.most) out.push(ok(alertSays));
  else {
    const named = [...new Set(alerts.map((a) => `${a?.dependency?.package?.name ?? 'a package'} (${a?.security_advisory?.severity ?? 'severity unknown'})`))];
    out.push(miss(alertSays, `${alerts.length >= 100 ? '100 or more' : alerts.length} open: ${named.join(', ')}`));
  }
  return out;
}

/** A repository named as `owner/name`, held to that shape so it cannot be anything else in a URL. */
export function repoInput(said) {
  const repo = String(said ?? '').trim();
  if (repo === '') throw new Error('no repository named: set GITHUB_REPOSITORY or pass --repo owner/name');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error(`${JSON.stringify(said)} is not owner/name`);
  return repo;
}

/**
 * The whole check: every setting printed one line each, every miss with why under it. Answers the exit code, 1 on any
 * miss. No token is a skip and 0. The token's value is cut out of every line before it is printed.
 */
export default async function settings({ expected, readme, repo, token, ask = fetch, ms = ASK_MS, log = console.log }) {
  if (!token) {
    log('  settings: skipped: no read-only token (WATCH_TOKEN is not set)');
    return 0;
  }
  const say = (line) => log(line.split(token).join('***'));
  say('');
  say(`  settings: ${repo}, read-only, against .github/settings.expected.json`);
  const got = await readRepository({ repo, token, branch: expected.branch, severity: expected.open_alerts.severity, ask, ms });
  const lines = compare(expected, got, readme);
  let missed = 0;
  let waiting = 0;
  for (const l of lines) {
    if (l.state === 'miss') missed += 1;
    if (l.state === 'wait') waiting += 1;
    const mark = l.state === 'miss' ? 'MISS' : l.state === 'wait' ? 'WAIT' : 'ok  ';
    say(`  ${mark}  ${l.says}${l.note ? `: ${l.note}` : ''}`);
    if (l.miss) say(`           ${l.miss}`);
  }
  say(`  settings: ${repo}, ${missed} missed, ${waiting} waiting on going public`);
  return missed === 0 ? 0 : 1;
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    const token = process.env.WATCH_TOKEN ?? '';
    const at = process.argv.indexOf('--repo');
    const named = at === -1 ? process.env.GITHUB_REPOSITORY : process.argv[at + 1];
    const repo = token ? repoInput(named) : '';
    const expected = JSON.parse(readFileSync(`${root}.github/settings.expected.json`, 'utf8'));
    const readme = readFileSync(`${root}README.md`, 'utf8');
    process.exitCode = await settings({ expected, readme, repo, token });
  } catch (err) {
    console.error(`  settings: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}
