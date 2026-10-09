/**
 * Two of the record's vital signs, filed by the record layer through the kernel's `signRead` (PRF-A05 jobs 2 and 3,
 * `loop/scope/area-proof-a.md` 2.2): whether the briefing a new session is handed is true (`briefing-true`), and whether
 * agents that connect are given the tool list (`tools-listed`). The route that reads every sign is `methods/signs.ts`.
 *
 * WHY. The card a session on his record started with handed a next step from a run ten hours and 53 commits old, and
 * for a week no client was given the tools; nothing in the record could say either (D40.25, "whether the tools list").
 *
 * EACH IS COUNTED APART FROM THE CODE IT WATCHES. The briefing is the record's own `context` value, taken as a set of
 * claims (this handoff, these questions, these runs live) and checked against reads of the tables written here, never
 * through the code that built it, so a fault in `briefing` cannot also turn this green. The tools sign reads the
 * kernel's `doorMarks` for the counts, and the marks table itself for which client and which session.
 *
 * NONE IS NOT GREEN: no run in any repository, or no session that connected this week, reads `none`.
 * A READING NAMES THINGS: a repository by its name, a run by what it was doing, a client by its name. Never an id.
 */

import { openHandoffs, type SignReading } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';

import type { Context } from './index.ts';
import { isHandle, spokenOf } from './question-handles.ts';
import { scrubbed } from './scrub.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/* ── the thresholds, one line each, as 2.2 sets them ──────────────────────────────────────────────────────────────────── */

/** How many repositories the briefing is checked for: the ones with the newest runs. */
export const BRIEFING_REPOS = 3;
/** A handoff older than this is not a briefing anybody should start from. */
export const BRIEFING_HANDOFF_DAYS = 7;
/** A run named live must have been heard from inside this working window (the kernel's stale mark). */
export const BRIEFING_LIVE_MS = 45 * MIN;
/** How many questions the briefing carries at most (`ASKED` in `index.ts`), so a longer queue is not a lie. */
export const BRIEFING_WAITING_MOST = 8;
/** The window the tools sign reads. */
export const TOOLS_WINDOW_DAYS = 7;
/** The newest session of a client is red once it said hello this long ago and was never given the list. */
export const TOOLS_LIST_WITHIN_MS = 10 * MIN;
/** The share rule applies from this many sessions... */
export const TOOLS_SESSIONS_LEAST = 3;
/** ...and is red when fewer than 9 in 10 were given the list: listed * 10 < hello * 9. */
export const TOOLS_LISTED_TENTHS = 9;

/** What the door's marks add up to (`packages/kernel/src/door.ts` `DoorSigns`), the two counts this reads. */
export type DoorCounts = { hello: number; listed: number };

/** What this needs of the kernel: the verb that files, and where the record has it, the door's marks. */
export type RecordSignsKernel = {
  signRead: (id: string, reading: SignReading) => Result<{ sign: string; day: string }>;
  doorMarks?: (sinceMs?: number) => DoorCounts | Result<DoorCounts>;
};

/** What the record hands: its database, and what a new session standing in a repository would be handed. */
export type RecordSignsDeps = {
  sql: Sql;
  briefing: (repo: string) => Context | null | Promise<Context | null>;
};

/* ── helpers ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** How long ago, as a person says it: `25 minutes`, `3 hours`, `10 days`. */
function ago(ms: number): string {
  if (ms < MIN) return 'a moment';
  if (ms < HOUR) return count(Math.round(ms / MIN), 'minute');
  if (ms < 2 * DAY) return count(Math.round(ms / HOUR), 'hour');
  return count(Math.round(ms / DAY), 'day');
}

/** A repository by its name, never its address: `git@github.com:ada/kiln.git` and `/Users/ada/kiln` are both `kiln`. */
export function repoName(repo: string): string {
  const tail = repo.trim().replace(/\.git$/u, '').replace(/[/\\]+$/u, '').split(/[/\\:]/u).pop() ?? '';
  return tail === '' ? 'a repository' : tail.slice(0, 60);
}

/**
 * A run as a person reads it: what it was doing, quoted, or "a run" when it said nothing. An agent wrote those words, so
 * an address, a link or a key goes (`scrubbed`), and so does a file path.
 */
function runSaid(doing: unknown): string {
  const cut = typeof doing === 'string' ? doing.replace(/(?:~|\.{1,2})?(?:[/\\][\w.@-]+){2,}[/\\]?/gu, '').replace(/\b[0-9A-HJKMNP-TV-Z]{26}\b/gu, '') : '';
  const plain = (scrubbed(cut) ?? '').replace(/\s+/gu, ' ').trim();
  return plain === '' ? 'a run' : `"${plain.slice(0, 60)}"`;
}

const reading = (state: SignReading['state'], value: number | null, said: string, facts: string[] = []): SignReading => ({
  state,
  value,
  said: said.slice(0, 280),
  facts: facts.slice(0, 6).map((f) => f.slice(0, 200)),
});

const hasTable = (sql: Sql, name: string): boolean => sql.one("SELECT 1 AS n FROM sqlite_master WHERE type = 'table' AND name = ?", name) !== undefined;

/* ── briefing-true ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** One run as the tables hold it. */
type RunRow = { seq: number; doing: string | null; next: string | null; repo: string | null; project: string | null; state: string | null; last_seen: string | null; updated_at: string; deleted_at: string | null };

const RUN_COLUMNS = `seq, json_extract(fields, '$.doing') AS doing, json_extract(fields, '$.next') AS next, json_extract(fields, '$.repo') AS repo,
  json_extract(fields, '$.project') AS project, coalesce(state, json_extract(fields, '$.state')) AS state,
  json_extract(fields, '$.last_seen') AS last_seen, updated_at, deleted_at`;

/** When a run was last heard from: `last_seen`, or its row's last change for a run nobody heard from. */
const heard = (r: RunRow): number => Date.parse(r.last_seen ?? r.updated_at);

/** The repositories with the newest runs, newest first. */
function newestRepos(sql: Sql): string[] {
  return sql
    .all<{ repo: string }>(
      `SELECT json_extract(fields, '$.repo') AS repo, max(coalesce(json_extract(fields, '$.last_seen'), updated_at)) AS at
       FROM entry WHERE register = 'session' AND deleted_at IS NULL AND coalesce(json_extract(fields, '$.repo'), '') <> ''
       GROUP BY 1 ORDER BY at DESC LIMIT ?`,
      BRIEFING_REPOS,
    )
    .map((r) => String(r.repo));
}

/**
 * The run whose step a session standing here should be handed: the newest step the kernel marks `next` here
 * (`openHandoffs`, AGT-C05), the one the briefing hands, so a step a done run left, or one older than the kernel hands
 * over, is not expected. Here is the project the briefing placed the caller on, or the repository alone.
 */
function expectedHandoff(sql: Sql, repo: string, project: string | null, nowMs: number): RunRow | null {
  const open = openHandoffs(sql, { project, repo }, null, nowMs).find((h) => h.mark === 'next');
  const seq = open === undefined ? null : seqOf(open.spoken);
  return seq === null ? null : runBySeq(sql, seq);
}

/** A run by its number, deleted or not. */
const runBySeq = (sql: Sql, seq: number): RunRow | null => sql.one<RunRow>(`SELECT ${RUN_COLUMNS} FROM entry WHERE register = 'session' AND seq = ?`, seq) ?? null;

/** The number in a run's handle, `S42` → 42. */
const seqOf = (spoken: string): number | null => {
  const m = /(\d+)$/u.exec(spoken);
  return m === null ? null : Number(m[1]);
};

/** Questions open now, deferrals not yet come round left out, counted from the table. */
const openQuestions = (sql: Sql, nowMs: number): number =>
  Number(sql.one<{ n: number }>("SELECT count(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?)", new Date(nowMs).toISOString())?.n ?? 0);

/** Whether a question the briefing names is open now on the table, its deferral come round. */
function isOpenQuestion(sql: Sql, said: string, nowMs: number): boolean {
  const id = isHandle(said) ? spokenOf(sql, said) : said;
  return (
    id !== null &&
    sql.one("SELECT 1 AS n FROM suggestion WHERE id = ? AND status = 'open' AND (defer_until IS NULL OR defer_until <= ?)", id, new Date(nowMs).toISOString()) !== undefined
  );
}

/** What is false in one repository's briefing, each a sentence, and the line it says when it is all true. */
function checkBriefing(sql: Sql, repo: string, b: Context, nowMs: number): { wrong: string[]; fine: string } {
  const name = repoName(repo);
  const wrong: string[] = [];
  const want = expectedHandoff(sql, repo, b.project?.spoken ?? null, nowMs);
  const got = b.handoff;
  const gotRow = got === null ? null : ((n) => (n === null ? null : runBySeq(sql, n)))(seqOf(got.from));
  if (got !== null && (gotRow === null || gotRow.deleted_at !== null)) wrong.push(`The briefing for ${name} hands a step no run on the record left.`);
  else if (got !== null && want === null) wrong.push(`The briefing for ${name} hands a step from ${runSaid(gotRow!.doing)}, which left none here.`);
  else if (got === null && want !== null) wrong.push(`The briefing for ${name} hands no step, though ${runSaid(want.doing)} left one ${ago(nowMs - heard(want))} ago.`);
  else if (got !== null && want !== null && gotRow!.seq !== want.seq)
    wrong.push(`The briefing for ${name} hands the step ${runSaid(gotRow!.doing)} left, ${ago(Math.abs(heard(want) - heard(gotRow!)))} before the newest, from ${runSaid(want.doing)}.`);
  else if (got !== null && want !== null && got.next.trim() !== String(want.next ?? '').trim()) wrong.push(`The briefing for ${name} hands a step its run did not leave.`);
  if (got !== null && got.age_s > BRIEFING_HANDOFF_DAYS * 86_400) wrong.push(`The briefing for ${name} hands a step ${ago(got.age_s * 1000)} old.`);

  const open = openQuestions(sql, nowMs);
  const shown = Math.min(open, BRIEFING_WAITING_MOST);
  if (b.waiting.length !== shown) wrong.push(`The briefing for ${name} says ${count(b.waiting.length, 'question')} ${b.waiting.length === 1 ? 'waits' : 'wait'}, and ${open} ${open === 1 ? 'is' : 'are'} open.`);
  /* EACH QUESTION IT NAMES MUST BE ONE OPEN NOW, so a queue of the right length holding a question that was answered, or
     never asked, is caught too. A handle (`q.<id>`) is turned back into its number first. */
  const notOpen = b.waiting.filter((w) => !isOpenQuestion(sql, w.id, nowMs)).length;
  if (notOpen > 0) wrong.push(`The briefing for ${name} says ${count(notOpen, 'question')} ${notOpen === 1 ? 'waits that is' : 'wait that are'} not open.`);

  for (const live of [...b.live.same_repo, ...b.live.elsewhere]) {
    const n = seqOf(live.spoken);
    const row = n === null ? null : runBySeq(sql, n);
    if (row === null || row.deleted_at !== null) wrong.push(`The briefing for ${name} names a run as live that is not on the record.`);
    else if (row.state === 'done' || row.state === 'abandoned') wrong.push(`The briefing for ${name} names ${runSaid(row.doing)} as live, and it has ended.`);
    else if (row.last_seen === null || nowMs - Date.parse(row.last_seen) > BRIEFING_LIVE_MS)
      wrong.push(`The briefing for ${name} names ${runSaid(row.doing)} as live, and ${row.last_seen === null ? 'it was never heard from' : `it was last heard from ${ago(nowMs - Date.parse(row.last_seen))} ago`}.`);
  }
  const fine = want === null ? `${name}: no run left a step, and none is handed.` : `${name}: hands the step ${runSaid(want.doing)} left ${ago(nowMs - heard(want))} ago.`;
  return { wrong, fine };
}

/** `briefing-true`, read now for the repositories with the newest runs. */
export async function readBriefingSign(deps: RecordSignsDeps, nowMs: number): Promise<SignReading> {
  if (!hasTable(deps.sql, 'entry')) return reading('none', null, 'No agent has worked in a repository yet.');
  const repos = newestRepos(deps.sql);
  if (repos.length === 0) return reading('none', null, 'No agent has worked in a repository yet.');
  const wrong: string[] = [];
  const fine: string[] = [];
  for (const repo of repos) {
    const b = await deps.briefing(repo);
    if (b === null) {
      wrong.push(`The briefing for ${repoName(repo)} could not be read.`);
      continue;
    }
    const checked = checkBriefing(deps.sql, repo, b, nowMs);
    wrong.push(...checked.wrong);
    fine.push(checked.fine);
  }
  const unique = [...new Set(wrong)];
  if (unique.length > 0) {
    const more = unique.length - 1;
    return reading('red', unique.length, `${unique[0]!}${more > 0 ? ` And ${count(more, 'more thing')} ${more === 1 ? 'is' : 'are'} not true.` : ''}`, unique.slice(1));
  }
  const names = repos.map(repoName);
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
  return reading('green', 0, `The briefing a new session is handed is true in ${list}.`, fine);
}

/* ── tools-listed ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** A client as a person names it: the names the common ones send, else what it sent with its dashes as spaces. */
const CLIENTS: Readonly<Record<string, string>> = {
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude',
  claude: 'Claude',
  codex: 'Codex',
  'codex-mcp-client': 'Codex',
  cursor: 'Cursor',
  'cursor-vscode': 'Cursor',
  windsurf: 'Windsurf',
  'braindog-cli': 'The BrainDog command',
};
export function clientName(client: string | null): string {
  if (client === null || client.trim() === '') return 'An agent';
  const key = client.trim().toLowerCase().split(/[\s/@]/u)[0]!;
  const said = CLIENTS[key] ?? key.replace(/[-_]+/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
}

/** The kernel's counts, whichever shape its verb answers in, or `null` where this build has none. */
function countsOf(kernel: RecordSignsKernel, sinceMs: number): DoorCounts | null {
  if (typeof kernel.doorMarks !== 'function') return null;
  const got = kernel.doorMarks(sinceMs);
  const value = 'ok' in got ? (got.ok ? got.value : null) : got;
  return value !== null && typeof value.hello === 'number' && typeof value.listed === 'number' ? value : null;
}

/** Each client's sessions in the window, read from the marks themselves: said hello, given the list, and the newest. */
type ClientSessions = { client: string | null; hello: number; listed: number; waiting: number; newestRun: string; newestAt: string };
function byClient(sql: Sql, since: string, nowMs: number): ClientSessions[] {
  if (!hasTable(sql, 'door_mark')) return [];
  const hellos = sql.all<{ run: string; at: string; client: string | null; listed: number }>(
    `SELECT h.run, h.at, coalesce(h.client, (SELECT d.client FROM door_mark d WHERE d.run = h.run AND d.client IS NOT NULL LIMIT 1)) AS client,
       EXISTS (SELECT 1 FROM door_mark l WHERE l.run = h.run AND l.kind = 'listed') AS listed
     FROM door_mark h WHERE h.kind = 'hello' AND h.at >= ? ORDER BY h.at DESC`,
    since,
  );
  const out = new Map<string, ClientSessions>();
  for (const h of hellos) {
    const key = clientName(h.client);
    const c = out.get(key) ?? { client: h.client, hello: 0, listed: 0, waiting: 0, newestRun: h.run, newestAt: h.at };
    c.hello += 1;
    /* A SESSION STILL INSIDE ITS TEN MINUTES WITH NO LIST IS NOT JUDGED YET, either way. */
    if (Number(h.listed) === 1) c.listed += 1;
    else if (nowMs - Date.parse(h.at) <= TOOLS_LIST_WITHIN_MS) c.waiting += 1;
    out.set(key, c);
  }
  return [...out.values()];
}

const givenSaid = (listed: number, hello: number): string =>
  listed === hello ? 'every time' : `${count(listed, 'time')} of ${hello}`;

/** `tools-listed`, over the last seven days of the door's marks. */
export function readToolsSign(kernel: RecordSignsKernel, sql: Sql, nowMs: number): SignReading {
  const sinceMs = nowMs - TOOLS_WINDOW_DAYS * DAY;
  const counts = countsOf(kernel, sinceMs);
  if (counts === null) return reading('none', null, 'This BrainDog does not yet keep what happens when an agent connects.');
  const { hello, listed } = counts;
  /* A LIST SENT WITH NO HELLO HEARD is nothing to judge by either: the count it would be held against is not kept. */
  if (hello === 0) return reading('none', null, 'No agent connected this week.');
  const clients = byClient(sql, new Date(sinceMs).toISOString(), nowMs);
  const judged = Math.max(0, hello - clients.reduce((n, c) => n + c.waiting, 0));
  /* EVERY SESSION STILL INSIDE ITS TEN MINUTES is not judged yet, so it is not green. */
  if (judged === 0)
    return reading('none', null, `${hello === 1 ? 'The one agent that connected' : `All ${hello} agents that connected`} this week did so in the last ten minutes, so it is too soon to tell.`);
  const facts = clients.map((c) => `${clientName(c.client)} connected ${count(c.hello, 'time')} and was given the tool list ${givenSaid(c.listed, c.hello)}.`);

  /* THE NEWEST SESSION OF EACH CLIENT, given ten minutes to be sent the list. */
  for (const c of clients) {
    const listedNewest = sql.one("SELECT 1 AS n FROM door_mark WHERE run = ? AND kind = 'listed'", c.newestRun) !== undefined;
    const waited = nowMs - Date.parse(c.newestAt);
    if (!listedNewest && waited > TOOLS_LIST_WITHIN_MS)
      return reading('red', listed, `The newest ${clientName(c.client)} session connected ${ago(waited)} ago and was not given the tool list.`, facts);
  }
  if (judged >= TOOLS_SESSIONS_LEAST && listed * 10 < judged * TOOLS_LISTED_TENTHS) {
    const worst = [...clients].sort((a, b) => a.listed / a.hello - b.listed / b.hello)[0];
    const said =
      worst !== undefined && clients.length === 1
        ? `${clientName(worst.client)} connected ${count(worst.hello, 'time')} this week and was given the tool list ${count(worst.listed, 'time')}.`
        : `Agents connected ${count(hello, 'time')} this week and were given the tool list ${count(listed, 'time')}.`;
    return reading('red', listed, said, facts);
  }
  return reading('green', listed, `Agents connected ${count(hello, 'time')} this week and were given the tool list ${givenSaid(Math.min(listed, hello), hello)}.`, facts);
}

/* ── filing ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Read both signs and file each for today through the kernel's `signRead`. The record's tick calls it once a night
 * beside `lintTick`; a later filing the same day replaces the earlier one. Answers what each came to, and a refusal the
 * kernel gave is said in `refused`, never dropped.
 */
export async function fileRecordSigns(
  kernel: RecordSignsKernel,
  deps: RecordSignsDeps,
  nowMs: number,
): Promise<{ briefing: SignReading; tools: SignReading; refused: string[] }> {
  const briefing = await readBriefingSign(deps, nowMs);
  const tools = readToolsSign(kernel, deps.sql, nowMs);
  const refused: string[] = [];
  for (const [id, r] of [['briefing-true', briefing], ['tools-listed', tools]] as const) {
    const filed = kernel.signRead(id, r);
    if (!filed.ok) refused.push(`${id}: ${'refusal' in filed ? filed.refusal.fix : 'the record changed under it'}`);
  }
  return { briefing, tools, refused };
}
