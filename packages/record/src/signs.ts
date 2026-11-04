/**
 * Three of the record's vital signs, filed by the record layer through the kernel's `signRead`:
 * whether the briefing a new session is handed is true (`briefing-true`), whether
 * agents that connect are given the tool list (`tools-listed`), and whether what shipped is what runs (`arrived`,
 * PRF-A20: add-ons, the command and the model). The route that reads every sign is `methods/signs.ts`.
 *
 * WHY. The card a session on his record started with handed a next step from a run ten hours and 53 commits old, and
 * for a week no client was given the tools; nothing in the record could say either ("whether the tools list").
 *
 * EACH IS COUNTED APART FROM THE CODE IT WATCHES. The briefing is the record's own `context` value, taken as a set of
 * claims (this handoff, these questions, these runs live) and checked against reads of the tables written here, never
 * through the code that built it, so a fault in `briefing` cannot also turn this green. The tools sign reads the
 * kernel's `doorMarks` for the counts, and the marks table itself for which client and which session.
 *
 * NONE IS NOT GREEN: no run in any repository, or no session that connected this week, reads `none`.
 * A READING NAMES THINGS: a repository by its name, a run by what it was doing, a client by its name. Never an id.
 */

import { apartJson, NOT_APART, openHandoffs, quietSign, type SignReading, type VitalSign } from '@braindog/kernel';
import type { Result, Sql } from '@braindog/ports';

import type { Build, Context, RecordDeps } from './index.ts';
import { isHandle, spokenOf } from './question-handles.ts';
import { scrubbed } from './scrub.ts';
import type { CatalogueOffer } from './slash.ts';

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
} & Partial<ArrivedKernel>;

/** What the record hands: its database, and what a new session standing in a repository would be handed. */
export type RecordSignsDeps = {
  sql: Sql;
  briefing: (repo: string) => Context | null | Promise<Context | null>;
  /** The host's build and its catalogue's newer versions, for `arrived`. Absent, that part of it reads nothing to judge by. */
  build?: ArrivedDeps['build'];
  offers?: ArrivedDeps['offers'];
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
 * (`openHandoffs`), the one the briefing hands, so a step a done run left, or one older than the kernel hands
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
/* AGENTS' SUGGESTIONS ON THEIR SHELF ARE LEFT OUT, as the briefing's Waiting leaves them (`apartOf`). */
const openQuestions = (sql: Sql, nowMs: number): number =>
  Number(
    sql.one<{ n: number }>(
      `SELECT count(*) AS n FROM suggestion WHERE status = 'open' AND (defer_until IS NULL OR defer_until <= ?) AND ${NOT_APART}`,
      new Date(nowMs).toISOString(),
      apartJson({ sql, nowMs }),
    )?.n ?? 0,
  );

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
  if (got !== null && (gotRow === null || gotRow.deleted_at !== null)) wrong.push(`The briefing for ${name} hands a step no run in this BrainDog left.`);
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
    if (row === null || row.deleted_at !== null) wrong.push(`The briefing for ${name} names a run as live that is not in this BrainDog.`);
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
/**
 * A KEY'S LABEL AS A PERSON SAYS IT (Q12 of 29 October): "SAM-LAPTOP · braindog-cli" is the machine and the command it
 * signed in with, and was said as it is: "SAM-LAPTOP · braindog-cli has made 10 changes". The command is how agents on
 * that machine reach the record, so it is said as "Your agents on SAM-LAPTOP"; another app as "Claude Code on SAM-LAPTOP".
 * A label typed by hand is said as typed.
 */
export function agentSaid(label: string | null): string {
  const said = (label ?? '').trim();
  if (said === '') return 'Your agent';
  const parts = said.split(' · ').map((p) => p.trim()).filter((p) => p !== '');
  if (parts.length < 2) return said;
  const [machine, app] = parts as [string, string];
  return app.toLowerCase() === 'braindog-cli' ? `Your agents on ${machine}` : `${clientName(app)} on ${machine}`;
}

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

/**
 * How long a client may keep the tool list it was given without asking again: the `ttlMs` the door's own `tools/list`
 * answer grants, private to the caller (`packages/mcp/src/rpc.ts`).
 */
export const TOOLS_KEPT_MS = HOUR;

/**
 * Each client's sessions in the window, read from the marks themselves: said hello, had the tool list, and the newest.
 *
 * A SESSION HAD THE LIST when the door gave it one; when it called a tool, which it can only name from a list; or when
 * the same app was given the list in the hour before it said hello, the hour the door's answer says a list may be kept.
 * An app that keeps its list as the door allows asks once an hour, not once a session, and each session in between read
 * as one the door had failed.
 */
type ClientSessions = { client: string | null; hello: number; listed: number; waiting: number; newestAt: string; newestListed: boolean };
function byClient(sql: Sql, since: string, nowMs: number): ClientSessions[] {
  if (!hasTable(sql, 'door_mark')) return [];
  const client = (h: string) => `coalesce(${h}.client, (SELECT d.client FROM door_mark d WHERE d.run = ${h}.run AND d.client IS NOT NULL LIMIT 1))`;
  const hellos = sql.all<{ run: string; at: string; client: string | null; listed: number }>(
    `SELECT h.run, h.at, ${client('h')} AS client,
       (EXISTS (SELECT 1 FROM door_mark l WHERE l.run = h.run AND l.kind IN ('listed', 'called'))
        OR EXISTS (SELECT 1 FROM door_mark l JOIN door_mark o ON o.run = l.run AND o.kind = 'hello'
                   WHERE l.kind = 'listed' AND l.run <> h.run AND l.at <= h.at AND julianday(h.at) - julianday(l.at) <= ?
                     AND ${client('o')} = ${client('h')})) AS listed
     FROM door_mark h WHERE h.kind = 'hello' AND h.at >= ? ORDER BY h.at DESC`,
    TOOLS_KEPT_MS / DAY,
    since,
  );
  const out = new Map<string, ClientSessions>();
  for (const h of hellos) {
    const key = clientName(h.client);
    const had = Number(h.listed) === 1;
    const c = out.get(key) ?? { client: h.client, hello: 0, listed: 0, waiting: 0, newestAt: h.at, newestListed: had };
    c.hello += 1;
    /* A SESSION STILL INSIDE ITS TEN MINUTES WITH NO LIST IS NOT JUDGED YET, either way. */
    if (had) c.listed += 1;
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
  const { hello } = counts;
  /* A LIST SENT WITH NO HELLO HEARD is nothing to judge by either: the count it would be held against is not kept. */
  if (hello === 0) return reading('none', null, 'No agent connected this week.');
  const clients = byClient(sql, new Date(sinceMs).toISOString(), nowMs);
  /* THE SESSIONS THAT HAD THE LIST as `byClient` reads them, a call or a kept list included; the kernel's count without it. */
  const listed = Math.min(hello, clients.length === 0 ? counts.listed : clients.reduce((n, c) => n + c.listed, 0));
  const judged = Math.max(0, hello - clients.reduce((n, c) => n + c.waiting, 0));
  /* EVERY SESSION STILL INSIDE ITS TEN MINUTES is not judged yet, so it is not green. */
  if (judged === 0)
    return reading('none', null, `${hello === 1 ? 'The one agent that connected' : `All ${hello} agents that connected`} this week did so in the last ten minutes, so it is too soon to tell.`);
  const facts = clients.map((c) => `${clientName(c.client)} connected ${count(c.hello, 'time')} and was given the tool list ${givenSaid(c.listed, c.hello)}.`);

  /* THE NEWEST SESSION OF EACH CLIENT, given ten minutes to be sent the list. */
  for (const c of clients) {
    const waited = nowMs - Date.parse(c.newestAt);
    if (!c.newestListed && waited > TOOLS_LIST_WITHIN_MS)
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

/* ── arrived ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** An add-on behind its catalogue, an update waiting on its question, or a command behind the host: red past this many nights. */
export const ARRIVED_NIGHTS = 2;

/** Where the first night each add-on was seen behind is kept, under a name no person holds, as `lintTick` keeps its day. */
export const ARRIVED_HOLDER = 'braindog:signs';
export const ARRIVED_BEHIND = 'arrived.behind';

/** What `arrived` needs of the record's kernel: its prefs, where the first night behind is kept. */
export type ArrivedKernel = {
  prefsOf: (person: string) => Record<string, unknown>;
  setPref: (person: string, key: string, value: unknown) => void;
};

/** What the record hands `arrived`: the host's build (`Build`), and the catalogue's newer versions (`RecordDeps.catalogueOffers`). */
export type ArrivedDeps = {
  sql: Sql;
  build?: Pick<Build, 'app' | 'slash' | 'host'> | undefined;
  offers?: RecordDeps['catalogueOffers'];
};

/** A night as the record's tick counts it: the UTC day, as `lintTick` keeps its own. */
const nightOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Whole nights from one UTC day to another. */
const nightsBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** `3 October`, from a UTC day or an instant. */
const daySaid = (at: string | number): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(typeof at === 'number' ? at : Date.parse(at.length === 10 ? `${at}T12:00:00Z` : at));

/** The day a build was made (`2026.10.09+1a2b3c4`), as a UTC day, or `null` for a checkout's (`dev+`) or no build at all. */
export function buildDayOf(build: string | null | undefined): string | null {
  const m = /^(\d{4})\.(\d{2})\.(\d{2})(?:\+|$)/u.exec(build ?? '');
  return m === null ? null : `${m[1]}-${m[2]}-${m[3]}`;
}

/** An add-on as a person names it: its manifest's title, else its name with dashes as spaces. Never its version or a key. */
const addOnName = (id: string, title: unknown): string => {
  const t = typeof title === 'string' ? title.replace(/\s+/gu, ' ').trim().slice(0, 60) : '';
  if (t !== '') return t;
  const said = id.replace(/[-_]+/gu, ' ');
  return said.charAt(0).toUpperCase() + said.slice(1);
};

type Installed = { id: string; version: string; title: unknown; on: boolean };

function installedAddOns(sql: Sql): Installed[] {
  if (!hasTable(sql, 'pack')) return [];
  return sql
    .all<{ id: string; version: string; title: unknown; off: string | null }>(
      "SELECT id, version, json_extract(manifest, '$.title') AS title, disabled_at AS off FROM pack ORDER BY id",
    )
    .map((p) => ({ id: p.id, version: p.version, title: p.title, on: p.off === null }));
}

/** Open questions that would update an installed add-on, with when each was opened. */
function updatesAsked(sql: Sql, installed: ReadonlySet<string>): { id: string; opened: number }[] {
  if (!hasTable(sql, 'suggestion')) return [];
  const out: { id: string; opened: number }[] = [];
  for (const r of sql.all<{ body: string; opened_at: string }>("SELECT body, opened_at FROM suggestion WHERE body_kind = 'pack' AND status = 'open' ORDER BY opened_at")) {
    let install: unknown;
    try {
      install = (JSON.parse(r.body) as Record<string, unknown>).install;
    } catch {
      continue;
    }
    const opened = Date.parse(r.opened_at);
    if (typeof install === 'string' && installed.has(install) && !Number.isNaN(opened)) out.push({ id: install, opened });
  }
  return out;
}

/** How far back a computer's command is judged: a key that called in this week. */
export const COMMAND_WINDOW_DAYS = 7;

/** One computer's command as its keys last said it: its build, that build's day, the kind of machine, when known, and when it last called. */
type CommandHeard = { build: string; day: string; machine: string | null; heard: string };

/**
 * The kind of machine a run's host name says, never the name itself, which often carries its owner's: `MacBook`,
 * `Windows PC`. `null` for a name that says no kind. (`deviceOf` in the agent door reads the same names.)
 */
function machineOf(host: unknown, cwd?: unknown): string | null {
  /* A FOLDER ON A DRIVE LETTER IS WINDOWS, whatever the computer was named: his is called by his own name, which says nothing. */
  const windows = typeof cwd === 'string' && /^[A-Za-z]:[\\/]/u.test(cwd);
  if (typeof host !== 'string' || host === '') return windows ? 'Windows PC' : null;
  const h = host.toLowerCase();
  if (h.includes('macbook')) return 'MacBook';
  if (h.includes('imac')) return 'iMac';
  if (/mac-?mini/u.test(h)) return 'Mac mini';
  if (/mac-?studio/u.test(h)) return 'Mac Studio';
  if (/^laptop-/u.test(h)) return 'Windows laptop';
  if (/^(desktop|win)-/u.test(h)) return 'Windows PC';
  return windows ? 'Windows PC' : null;
}

/**
 * THE COMMAND ON EACH COMPUTER, read from the keys and not the door's marks. Every request the command sends says its
 * build (`x-braindog-cli`), which its key keeps (`last_build`); a door mark's build is the host's own on a `hello` and the
 * command's only on its hook's mark, so "the newest mark" was this host's build after one session and the command's after
 * the next. A key that called this week, with a build of a day (never a checkout's), and the machine its newest run named.
 *
 * ONE COMPUTER IS ONE ANSWER, ITS NEWEST. A computer holds a key for each kind of agent, and a key only says its build when
 * it calls, so after `braindog update` a key not used yet went on saying the old build for a week and held this sign red
 * on a computer that had already updated. Keys are grouped by the host name their newest run gave, and the newest build
 * among them is what that computer runs. A key whose runs name no host stands alone.
 */
function commandsHeard(sql: Sql, nowMs: number): CommandHeard[] {
  if (!hasTable(sql, 'token')) return [];
  const since = new Date(nowMs - COMMAND_WINDOW_DAYS * DAY).toISOString();
  const keys = sql.all<{ id: string; build: string; heard: string }>(
    'SELECT id, last_build AS build, last_used_at AS heard FROM token WHERE revoked_at IS NULL AND last_build IS NOT NULL AND last_used_at >= ? ORDER BY last_used_at DESC',
    since,
  );
  const computers = new Map<string, CommandHeard>();
  for (const k of keys) {
    const day = buildDayOf(k.build);
    if (day === null) continue;
    const run = hasTable(sql, 'entry')
      ? sql.one<{ host: string | null; cwd: string | null }>(
          "SELECT json_extract(fields, '$.host') AS host, json_extract(fields, '$.cwd') AS cwd FROM entry WHERE register = 'session' AND deleted_at IS NULL AND json_extract(fields, '$.token_id') = ? ORDER BY created_at DESC LIMIT 1",
          k.id,
        )
      : undefined;
    const at = typeof run?.host === 'string' && run.host !== '' ? `host:${run.host}` : `key:${k.id}`;
    const was = computers.get(at);
    if (was === undefined || day > was.day) computers.set(at, { build: k.build, day, machine: machineOf(run?.host, run?.cwd) ?? was?.machine ?? null, heard: was === undefined || k.heard > was.heard ? k.heard : was.heard });
    else if (k.heard > was.heard) was.heard = k.heard;
  }
  return [...computers.values()];
}

/**
 * The computers a line names, `the MacBook`, `one computer`, `the MacBook and 1 more computer`, and whether that is
 * one computer. Two keys on one MacBook (one for each agent) are one MacBook.
 */
function machinesSaid(behind: readonly CommandHeard[]): { where: string; one: boolean } {
  const named = [...new Set(behind.flatMap((m) => (m.machine === null ? [] : [m.machine])))];
  const unnamed = behind.filter((m) => m.machine === null).length;
  if (named.length === 0) return unnamed === 1 ? { where: 'one computer', one: true } : { where: `${unnamed} computers`, one: false };
  const head = joined(named.map((n) => `the ${n}`));
  return unnamed === 0 ? { where: head, one: named.length === 1 } : { where: `${head} and ${count(unnamed, 'more computer')}`, one: false };
}

/** `one`, `one and two`, `one, two and three`. */
const joined = (parts: readonly string[]): string => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/**
 * `arrived`: whether what shipped is what runs. RED when an add-on switched on has had a newer version in this
 * host's catalogue for more than two nights; when an update to one has waited on its question past two nights; when the
 * newest session the command opened carries a build more than two days older than the one this host serves; or when
 * this is the cloud and no model is set up behind Slash, which no ask would ever show. Each line names the add-on or the
 * machine and says what turns the new thing on. A checkout's build (`dev+`, or none) says nothing about the command or
 * the model; nor does a self-host about a model, since its plan may hold none. NONE when nothing here could be judged.
 * Writes one pref: the first night each add-on was seen behind, rewritten each night with only the ones still behind,
 * so the night after it updates is green.
 */
export async function readArrivedSign(kernel: Partial<ArrivedKernel>, deps: ArrivedDeps, nowMs: number): Promise<SignReading> {
  const tonight = nightOf(nowMs);
  const addOns = installedAddOns(deps.sql);
  const names = new Map(addOns.map((p) => [p.id, addOnName(p.id, p.title)]));
  /* THE MANIFEST'S OWN TITLE, where it has one. An add-on without one is named by the catalogue's title, as Add-ons
     names it, and never by its id said as words ("Bank hsbc eg" beside "HSBC Egypt alerts"). */
  const titled = new Map(addOns.flatMap((p) => (typeof p.title === 'string' && p.title.trim() !== '' ? [[p.id, addOnName(p.id, p.title)] as const] : [])));
  /* Each red thing: its line, and what it is called in the sentence that counts them. */
  const red = new Map<string, { line: string; who: string; how?: string }>();
  const notes: string[] = [];
  const fine: string[] = [];

  /* AN UPDATE WAITING ON ITS QUESTION, first: answering it is what turns that add-on's new version on. */
  if (addOns.length > 0) {
    for (const q of updatesAsked(deps.sql, new Set(names.keys())))
      if (nowMs - q.opened > ARRIVED_NIGHTS * DAY && !red.has(q.id))
        red.set(q.id, { line: `The update to ${names.get(q.id)} has waited on its question since ${daySaid(q.opened)}. Answering it on Decide turns it on.`, who: names.get(q.id)! });
  }

  /* AN ADD-ON BEHIND ITS CATALOGUE, counted from the first night it was seen behind. */
  const on = addOns.filter((p) => p.on);
  if (deps.offers && on.length > 0) {
    let offers: readonly CatalogueOffer[] | null = null;
    try {
      offers = await deps.offers(on.map(({ id, version }) => ({ id, version, on: true })));
    } catch {
      notes.push('The catalogue could not be read tonight, so whether a plugin is behind is not known.');
    }
    if (offers !== null && (kernel.prefsOf === undefined || kernel.setPref === undefined))
      notes.push('This BrainDog keeps no prefs, so how long a plugin has been behind is not known.');
    else if (offers !== null) {
      const was = kernel.prefsOf!(ARRIVED_HOLDER)[ARRIVED_BEHIND];
      const kept = was !== null && typeof was === 'object' && !Array.isArray(was) ? (was as Record<string, { since?: unknown }>) : {};
      const behind: Record<string, { to: string; since: string }> = {};
      let young = 0;
      for (const o of offers) {
        const before = kept[o.id]?.since;
        const since = typeof before === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(before) && before <= tonight ? before : tonight;
        behind[o.id] = { to: o.to, since };
        const name = titled.get(o.id) ?? addOnName(o.id, o.title);
        if (nightsBetween(since, tonight) >= ARRIVED_NIGHTS) {
          if (!red.has(o.id)) red.set(o.id, { line: `${name} has had version ${o.to} waiting since ${daySaid(since)}. Updating it on Plugins turns it on.`, who: name });
        } else {
          young++;
          notes.push(`${name} has had version ${o.to} waiting since ${daySaid(since)}.`);
        }
      }
      if (JSON.stringify(behind) !== JSON.stringify(kept)) kernel.setPref!(ARRIVED_HOLDER, ARRIVED_BEHIND, behind);
      fine.push(young === 0 ? `${on.length === 1 ? 'the one plugin runs its' : `all ${on.length} plugins run their`} newest version` : `${count(young, 'plugin')} ${young === 1 ? 'has' : 'have'} had a newer version waiting for under ${ARRIVED_NIGHTS} nights`);
    }
  }

  /* THE COMMAND ON EACH COMPUTER IT RAN ON THIS WEEK, by the build its key last said, against the build this host serves. */
  const appDay = buildDayOf(deps.build?.app);
  const machines = appDay === null ? [] : commandsHeard(deps.sql, nowMs);
  if (appDay !== null && machines.length > 0) {
    const behind = machines.filter((m) => m.build !== deps.build!.app && nightsBetween(m.day, appDay) > ARRIVED_NIGHTS);
    if (behind.length > 0) {
      const oldest = behind.reduce((a, b) => (a.day <= b.day ? a : b));
      const { where, one } = machinesSaid(behind);
      const same = behind.every((m) => m.day === oldest.day);
      red.set(' command', {
        line: `The BrainDog command on ${where} runs ${same ? 'the build' : 'a build as old as that'} of ${daySaid(oldest.day)}, and this host serves the build of ${daySaid(appDay)}. Running braindog update on ${one ? where : 'each'} turns it on.${behind.length === 1 ? ` It last called on ${daySaid(behind[0]!.heard)}, and a computer quiet for ${COMMAND_WINDOW_DAYS} days stops counting.` : ''}`,
        who: 'the BrainDog command',
        how: `Running braindog update on ${one ? where : 'each computer'} turns the command on.`,
      });
    } else fine.push(machines.every((m) => m.build === deps.build!.app) ? "the command runs this host's build" : `the command is within ${ARRIVED_NIGHTS} days of this host's build`);
  }
  /* A HOST WITH NO KEY THAT SAID ITS BUILD: the newest mark that named one, as before. */
  const newest = appDay !== null && machines.length === 0 && hasTable(deps.sql, 'door_mark') ? deps.sql.one<{ build: string }>('SELECT build FROM door_mark WHERE build IS NOT NULL ORDER BY at DESC LIMIT 1') : undefined;
  const cliDay = newest === undefined ? null : buildDayOf(newest.build);
  if (appDay !== null && newest !== undefined && (newest.build === deps.build!.app || cliDay !== null)) {
    if (newest.build === deps.build!.app) fine.push("the command runs this host's build");
    else if (nightsBetween(cliDay!, appDay) > ARRIVED_NIGHTS)
      red.set(' command', {
        line: `The BrainDog command last heard from runs the build of ${daySaid(cliDay!)}, and this host serves the build of ${daySaid(appDay)}. Running braindog update on that computer turns it on.`,
        who: 'the BrainDog command',
        how: 'Running braindog update on that computer turns the command on.',
      });
    else fine.push(`the command is within ${ARRIVED_NIGHTS} days of this host's build`);
  }

  /* A MODEL, on the cloud only: without one Slash never asks, so no other sign could see it missing. On a checkout's
     build too it says nothing, since a cloud run from a checkout binds no model by design. */
  if (deps.build?.host === 'cloud' && appDay !== null) {
    if (!deps.build.slash) red.set(' model', { line: "No model is set up on this host, so Slash cannot answer. It turns on once the host's operator binds one.", who: 'a model for Slash' });
    else fine.push('a model is set up');
  }

  const lines = [...red.values()].map((r) => r.line);
  if (lines.length > 0) {
    /* THE ONE COMMAND TO RUN rides in the sentence too, so a line that counts several things still says it. */
    const how = red.get(' command')?.how;
    const said =
      lines.length === 1
        ? lines[0]!
        : `${count(lines.length, 'thing that shipped has', 'things that shipped have')} not arrived: ${joined([...red.values()].map((r) => r.who))}.${how === undefined ? '' : ` ${how}`}`;
    return reading('red', lines.length, said, [...lines, ...notes]);
  }
  if (fine.length === 0)
    return reading(
      'none',
      null,
      addOns.length === 0 && deps.build === undefined
        ? 'No plugin is installed and this host does not say which build it serves.'
        : deps.build?.app && appDay === null
          ? 'This host runs a build from a checkout, so what shipped cannot be told from what runs.'
          : 'Nothing here says which build this host serves or what its catalogue offers.',
      notes,
    );
  const first = joined(fine);
  return reading('green', 0, `${first.charAt(0).toUpperCase()}${first.slice(1)}.`, notes);
}

/* ── filing ────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Read the three signs and file each for today through the kernel's `signRead`. The record's tick calls it once a night
 * beside `lintTick`; a later filing the same day replaces the earlier one. Answers what each came to, and a refusal the
 * kernel gave is said in `refused`, never dropped.
 */
export async function fileRecordSigns(
  kernel: RecordSignsKernel,
  deps: RecordSignsDeps,
  nowMs: number,
): Promise<{ briefing: SignReading; tools: SignReading; arrived: SignReading; refused: string[] }> {
  const briefing = await readBriefingSign(deps, nowMs);
  const tools = readToolsSign(kernel, deps.sql, nowMs);
  const arrived = await readArrivedSign(kernel, { sql: deps.sql, build: deps.build, offers: deps.offers }, nowMs);
  const refused: string[] = [];
  for (const [id, r] of [['briefing-true', briefing], ['tools-listed', tools], ['arrived', arrived]] as const) {
    const filed = kernel.signRead(id, r);
    if (!filed.ok) refused.push(`${id}: ${'refusal' in filed ? filed.refusal.fix : 'the record changed under it'}`);
  }
  return { briefing, tools, arrived, refused };
}

/* ── the briefing's red signs, kept ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * THE RED SIGNS A BRIEFING CARRIES, READ BY THE ALARM AND KEPT (W1-D). Reading every sign now scans the week's runs, the
 * series' points and the open questions, about a fifth of what `context` cost on a record his size, and a sign is a
 * reading of the day: so the record's tick reads them and keeps the red ones under this pref, and `context` reads the
 * pref. Each is kept in both forms, its own words and the inbox's held back (`quietSign`), so the reader is chosen when
 * it is read.
 */
export const SIGNS_KEPT = 'briefing.signs';
/** How long a kept reading stands before a briefing reads the signs itself again. */
export const SIGNS_KEPT_MS = 15 * MIN;
/** How long the alarm leaves a kept reading as it is while nothing a sign reads moved: inside `SIGNS_KEPT_MS`, so a briefing still reads the pref. */
export const SIGNS_REKEEP_MS = 10 * MIN;
/**
 * And the least time between two keeps when something did move (F35): agents write all day, and every alarm, seconds
 * apart while a look or a lint goes in slices, read every sign again. A kept reading is trusted for `SIGNS_KEPT_MS`, so a
 * minute's lag on a sign is well inside what a briefing already reads.
 */
export const SIGNS_MOVED_MS = MIN;

/**
 * One red sign as a briefing names it: its name and its sentence, and both as a reader without the inbox is told them.
 * THE NAME TOO (RF2): a failure is titled by its question's own words (AG7), "The backup on 3 Sep did not run", so the
 * name a read token for the lists is briefed is the sign's own (`quietSign`), as the sentence is.
 */
export type KeptSign = { name: string; said: string; quiet: string; quietName: string };
/** What is kept: when it was read, and the red signs then. */
export type KeptSigns = { at: number; red: KeptSign[] };

/** The red signs of a reading, kept as `KeptSigns`. */
export function keptSigns(signs: readonly VitalSign[], nowMs: number): KeptSigns {
  return {
    at: nowMs,
    red: signs
      .filter((s) => s.state === 'red')
      .map((s) => {
        const quiet = quietSign(s);
        return { name: s.name, said: s.said, quiet: quiet.said, quietName: quiet.name };
      }),
  };
}

/**
 * The red signs kept, when `value` is a reading in shape and no older than `SIGNS_KEPT_MS`; else `null`, to read them again.
 * A reading kept before the quiet name was (RF2) is not in shape, so it is read again once rather than briefing a name
 * the inbox's words may be in.
 */
export function keptNow(value: unknown, nowMs: number): KeptSign[] | null {
  if (value === null || typeof value !== 'object') return null;
  const { at, red } = value as { at?: unknown; red?: unknown };
  if (typeof at !== 'number' || !(at <= nowMs && nowMs - at <= SIGNS_KEPT_MS) || !Array.isArray(red)) return null;
  const fine = red.every((s: unknown) => s !== null && typeof s === 'object' && ['name', 'said', 'quiet', 'quietName'].every((k) => typeof (s as Record<string, unknown>)[k] === 'string'));
  return fine ? (red as KeptSign[]) : null;
}
