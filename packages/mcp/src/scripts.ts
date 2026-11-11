/**
 * SCRIPTS AND AUTOMATIONS BY NAME, IN SHORT LINES (2 Nov). An agent asked `get {spoken:"bake-numbers"}` for a script it
 * had been told about and was refused, and `list {register:"runs"}` for its runs and was refused again: neither is a
 * list of rows, so neither tool knew them, and the one way in was `act scripts`, which answered every script as
 * nineteen kilobytes of JSON. Now `get` answers a script or an automation by its id or its title, `list` answers
 * `scripts` and `automations` as one line each, and `act scripts` and `act automations` say the same lines. `format:
 * "full"` still hands back the record's JSON.
 *
 * THE RECORD'S OWN READS, NOTHING NEW ASKED OF IT: `scripts` (`scriptRows` in the kernel) and `automations`, each with
 * the caller's own grant, so a name reaches only what the app would show the caller.
 */

import { counted, when } from './words.ts';

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x : null);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const words = (xs: unknown): string[] => (Array.isArray(xs) ? xs.filter((v): v is string => typeof v === 'string') : []);

/**
 * A name as a script's or a rule's id is spelt: lower case, with its `script.` or `rule.` taken off, and a dash or a
 * space read as the underscore ids use, so "bake-numbers", "Bake numbers" and `script.bake_numbers` are one.
 */
export const idKey = (said: string): string =>
  said
    .trim()
    .toLowerCase()
    .replace(/^(?:script|rule)\./u, '')
    .replace(/[\s-]+/gu, '_');

/** A title as a person types it: case and spacing aside. */
const titleKey = (said: string): string => said.toLowerCase().replace(/\s+/gu, ' ').trim();

/** A name with its id beside it, once: a rule with no name of its own is said by its id alone. */
const withId = (name: unknown, id: unknown): string => (typeof name === 'string' && name !== '' && name !== id ? `${name} (${String(id)})` : String(id));

/** Whether `said` names this script or rule, by its id or its whole title. */
export function names(row: Record<string, unknown>, said: string): boolean {
  const id = str(row.script) ?? str(row.rule) ?? str(row.id);
  const title = str(row.title) ?? str(row.name);
  return (id !== null && idKey(id) === idKey(said)) || (title !== null && titleKey(title) === titleKey(said));
}

/** How a script is started, in words: its clock, a door, a rule. */
function startedBy(runs: unknown): string {
  if (!isObject(runs)) return 'started by nothing';
  const how = [
    str(runs.every) ? `every ${String(runs.every)}${str(runs.at) ? ` at ${String(runs.at)}` : ''}` : null,
    str(runs.door) ? `by ${String(runs.door)}` : null,
    runs.rule === true ? 'by a rule' : null,
  ].filter((s): s is string => s !== null);
  return how.length === 0 ? 'started by nothing' : `runs ${how.join(', ')}`;
}

/** One script on one line: its title and id, whether it is on, how it starts, and this month's runs. */
export function scriptLine(s: Record<string, unknown>): string {
  const month = isObject(s.month) ? s.month : {};
  const refused = num(month.refused);
  return [
    withId(s.title, s.script),
    s.status === 'paused' ? 'paused' : 'on',
    startedBy(s.runs),
    `${counted(num(month.runs), 'run')} this month${refused > 0 ? `, ${String(refused)} refused` : ''}`,
  ].join(' · ');
}

/** One script whole: its line, what it reads, writes and fetches, its last run, and the rules that start it. */
export function scriptBrief(s: Record<string, unknown>, rules: readonly Record<string, unknown>[], now: number): string {
  const lines = [scriptLine(s)];
  if (str(s.pack)) lines.push(`From: ${String(s.pack)}, version ${String(s.version ?? 1)}`);
  const reads = words(s.reads);
  const writes = words(s.writes);
  if (reads.length > 0) lines.push(`Reads: ${reads.join(', ')}`);
  if (writes.length > 0) lines.push(`Writes: ${writes.join(', ')}`);
  const egress = words(s.egress);
  if (egress.length > 0) lines.push(`Fetches: ${egress.join(', ')}`);
  const keys = words(s.keys);
  if (keys.length > 0) lines.push(`Keys: ${keys.join(', ')}`);
  if (str(s.next)) lines.push(`Next: ${when(String(s.next), now)}`);
  const last = isObject(s.last) ? s.last : null;
  lines.push(last === null ? 'Last run: none yet' : `Last run: ${when(String(last.at), now)}, ${String(last.outcome)}${str(last.say) ? `: ${String(last.say)}` : ''}`);
  const refused = isObject(s.refused) ? s.refused : {};
  if (num(refused.in_a_row) > 0) lines.push(`Refused ${String(num(refused.in_a_row))} in a row; ${String(num(refused.pauses_at))} pauses it.`);
  if (s.status === 'paused') lines.push(`Paused. act {"call":"resumeScript","args":{"id":"${String(s.script)}"}} starts it again.`);
  if (rules.length > 0) lines.push(`Started by: ${rules.map((r) => withId(r.name, r.rule)).join(', ')}`);
  if (rules.length > 0) lines.push(`A rule's runs: get {"spoken":"${String(rules[0]!.rule)}"}`);
  return lines.join('\n');
}

/** One automation on one line: its name and id, on or off, what starts it, and this month's runs. */
export function ruleLine(r: Record<string, unknown>): string {
  const month = isObject(r.month) ? r.month : {};
  const failed = num(month.failed);
  const on = str(r.trigger) ? `on ${String(r.trigger)}${str(r.register) ? ` in ${String(r.register)}` : ''}` : null;
  /* AN INLINE RULE OPENS NO RUN, so its month is the firings counted for it, or it reads 0 however often it filed. */
  const runs = r.path === 'inline' ? Math.max(num(r.month_fired), num(month.runs)) : num(month.runs);
  return [
    withId(r.name, r.rule),
    r.enabled === false ? 'off' : 'on',
    on,
    `${counted(runs, 'run')} this month${failed > 0 ? `, ${String(failed)} failed` : ''}`,
  ]
    .filter((s): s is string => s !== null)
    .join(' · ');
}

/** One automation whole, as `automations {rule}` answers it: its line, why it is idle, and its last runs. */
export function ruleBrief(r: Record<string, unknown>, now: number): string {
  const lines = [ruleLine(r)];
  const script = isObject(r.script) ? r.script : null;
  if (script !== null && str(script.id)) lines.push(`Runs the script: ${withId(script.title, script.id)}`);
  if (str(r.last_at)) lines.push(`Last fired: ${when(String(r.last_at), now)}`);
  if (str(r.why_idle)) lines.push(`Idle: ${String(r.why_idle)}`);
  const runs = Array.isArray(r.runs) ? r.runs.filter(isObject) : [];
  for (const run of runs.slice(0, 5)) {
    const at = str(run.started_at) ?? str(run.at) ?? str(run.created_at);
    const state = str(run.state) ?? str(run.outcome) ?? 'run';
    const why = str(run.error) ?? str(run.say) ?? str(run.why);
    lines.push(`Run ${at === null ? '' : `${when(at, now)} `}${state}${why === null ? '' : `: ${why}`}`.replace(/\s+/gu, ' '));
  }
  if (runs.length === 0 && !(r.path === 'inline' && num(r.fired) > 0)) lines.push('No runs yet.');
  else if (runs.length > 5) lines.push(`${counted(runs.length - 5, 'older run')} in format full.`);
  return lines.join('\n');
}

/** Every script, a line each, with the call that opens one. */
export function scriptsBrief(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return 'No scripts are installed.';
  return [`Scripts · ${String(rows.length)}`, ...rows.map(scriptLine), 'One whole, with its last run: get {"spoken":"<its id>"}'].join('\n');
}

/** Every automation, a line each, with the call that opens one. */
export function rulesBrief(rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return 'No automations are installed.';
  return [`Automations · ${String(rows.length)}`, ...rows.map(ruleLine), 'One whole, with its runs: get {"spoken":"<its id>"}'].join('\n');
}
