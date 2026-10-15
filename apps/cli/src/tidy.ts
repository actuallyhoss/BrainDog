/**
 * `braindog tidy [--ask] [--json]`: what went stale on the record, read now, and the call that clears each (AGT-D03, over
 * AGT-C18's registry). Steps left earlier that nobody took, questions that waited, and a line for each finder that
 * found something, each as the record says it. Under them, how many things with no place look like they belong to a
 * project (`scopeProposals`, AGT-D04 job 6) and how many lessons two projects learned twice (`learningsTwice`, AGT-D15).
 *
 * WITHOUT `--ask` IT READS AND NOTHING ELSE: `stale`, `scopeProposals` and `learningsTwice`, three GETs, and no session
 * headers, so it names no run, opens none and fires no hook. It files nothing and answers nothing: the line under each
 * kind says the call that clears it, and making that call is the reader's.
 *
 * WITH `--ask` IT FILES, AND ONLY THEN: `proposeScopes` and `promoteLearnings`, each a person's write, put each clean-up
 * on Decide as one question, and a line a question says where to answer it. And the fold of what is held twice
 * (AGT-D03): for each list whose declaration says what makes two of its things the same (`same:`), `heldTwice` reads
 * which may be here twice, and when it names any, `askFoldTwice` files one question for that list to keep one of each.
 * Nothing is moved, kept once or folded until he answers there. Only a person typing the flag asks: no hook and no
 * schedule passes it, so nothing asks by itself.
 * Under `--json` every answer goes out untouched, each under the name of the call that gave it.
 *
 * THE ANSWER IS READ AS THE RECORD GIVES IT, a part it leaves out read as nothing, so a kind a finder adds later is
 * printed by its own sentence without a change here. The kind itself is the record's handle for a line and is never
 * printed. Every line is scrubbed for the terminal first (`printable`).
 */

import { parseArgs } from 'node:util';

import { fixOf, refused, type Result } from '@braindog/ports';

import { printable } from './clip.ts';
import { budgetOf, clientFor, hostsPath, target, type Target } from './http.ts';
import { refuse } from './json.ts';
import { isObject, type AgentIo } from './skills.ts';

const USAGE =
  'braindog tidy takes [--ask], [--json] and [--host <host>], as in braindog tidy --ask. Without --ask it reads only; with it, each clean-up goes on Decide as one question for you to answer.';

/** What a record with no such read is told, which is not a failure of the command. */
const OLDER = 'This BrainDog is older than this command and cannot say what is stale yet. It will once it is updated.';

/** The same for the two newer reads, one sentence for whichever of them the record does not answer yet. */
const OLDER_SCOPES = 'This BrainDog cannot say yet what looks like it belongs to a project. It will once it is updated.';
const OLDER_TWICE = 'This BrainDog cannot say yet which lessons were learned twice. It will once it is updated.';
const OLDER_BOTH = 'This BrainDog cannot say yet what looks like it belongs to a project, or which lessons were learned twice. It will once it is updated.';
const OLDER_ASK = 'This BrainDog cannot put these on Decide yet. It will once it is updated.';

/** One kind of stale thing as this command reads it: its sentence, how many, and the call that clears it ('' when none). */
export type StaleLine = { said: string; count: number; clear: string };

/** The record's answer as this command reads it: a line a kind, and how many things in all. */
export type StaleRead = { lines: StaleLine[]; count: number };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const whole = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/**
 * The record's answer (`stale` in `packages/record/src/methods/stale.ts`), read as `unknown`: `{ lines, count }`, each
 * line `{ kind, said, count, clear }`. A line with no sentence, or that counts nothing, is not a line. The whole is the
 * record's own number when it gives one, and the lines' counts added up when it does not.
 */
export function readStale(value: unknown): StaleRead {
  const list = isObject(value) && Array.isArray(value.lines) ? value.lines : [];
  const lines = list.flatMap((one): StaleLine[] => {
    if (!isObject(one)) return [];
    const said = text(one.said);
    const count = whole(one.count);
    return said === '' || count === 0 ? [] : [{ said, count, clear: text(one.clear) }];
  });
  const own = isObject(value) && typeof value.count === 'number' ? whole(value.count) : null;
  return { lines, count: own ?? lines.reduce((sum, l) => sum + l.count, 0) };
}

/** A sentence closed with a full stop only when it has none of its own. */
const closed = (s: string): string => (/[.!?]$/.test(s) ? s : `${s}.`);

/**
 * What is stale, a person's way: a line a kind with its count first, the call that clears it under it, and the whole
 * last. The counts are set to one width, so every sentence starts in the same column.
 */
export function tidyLines(read: StaleRead): string[] {
  if (read.lines.length === 0 && read.count === 0) return ['Nothing is stale.'];
  const width = Math.max(0, ...read.lines.map((l) => String(l.count).length));
  const out: string[] = [];
  for (const l of read.lines) {
    out.push(`${String(l.count).padStart(width)}  ${closed(l.said)}`);
    if (l.clear !== '') out.push(`${' '.repeat(width + 2)}Clear it: ${closed(l.clear)}`);
  }
  if (out.length > 0) out.push('');
  out.push(read.count === 1 ? '1 thing is stale.' : `${String(read.count)} things are stale.`);
  return out;
}

/** One list's things with no place that look like they belong to a project: its handle, its name, how many, the question's words. */
export type ScopeLine = { list: string; name: string; count: number; line: string };

/** The record's `scopeProposals` as this command reads it: a line a list, and how many in all. */
export type ScopeRead = { lists: ScopeLine[]; count: number };

/** The record's `learningsTwice` as this command reads it: how many, and the two projects of each pair when it names them. */
export type TwiceRead = { count: number; pairs: (readonly [string, string] | null)[] };

/** A list's name mid-sentence: 'Keys' becomes 'keys', and a name that starts with a capitalised word ('CRM notes') stays. */
const noun = (name: string): string => (/^[A-Z][a-z]/u.test(name) ? `${name[0]!.toLowerCase()}${name.slice(1)}` : name);

/**
 * The record's `scopeProposals` (the task of scope-ask, beside `stale`), read as `unknown`: `{ lists }` or the list
 * itself, each `{ list, name, count, line, rows, truncated }`. The count is the record's own, or the rows it sent when it
 * gives none. A list with no name, or that proposes nothing, is not a line.
 */
export function readScopes(value: unknown): ScopeRead {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.lists) ? value.lists : [];
  const lists = list.flatMap((one): ScopeLine[] => {
    if (!isObject(one)) return [];
    const name = text(one.name);
    const count = typeof one.count === 'number' ? whole(one.count) : Array.isArray(one.rows) ? one.rows.length : 0;
    return name === '' || count === 0 ? [] : [{ list: text(one.list), name, count, line: text(one.line) }];
  });
  return { lists, count: lists.reduce((sum, l) => sum + l.count, 0) };
}

/** The two projects a pair names: its `projects`, or the `project` of each of its two sides, in the record's order. */
function projectsOf(pair: unknown): readonly [string, string] | null {
  if (!isObject(pair)) return null;
  const named = Array.isArray(pair.projects) ? pair.projects.map(text) : Object.values(pair).map((side) => (isObject(side) ? text(side.project) : ''));
  const two = [...new Set(named.filter((n) => n !== ''))];
  return two.length >= 2 ? [two[0]!, two[1]!] : null;
}

/** The record's `learningsTwice` (the task of learning-promote), read as `unknown`: `{ pairs, count? }` or the pairs themselves. */
export function readTwice(value: unknown): TwiceRead {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.pairs) ? value.pairs : [];
  const own = isObject(value) && typeof value.count === 'number' ? whole(value.count) : null;
  return { count: own ?? list.length, pairs: list.map(projectsOf) };
}

/** What looks out of place, a line a list and a line for the lessons, and nothing at all when there is nothing. */
export function sortLines(scopes: ScopeRead | null, twice: TwiceRead | null): string[] {
  const out: string[] = [];
  for (const l of scopes?.lists ?? [])
    out.push(l.count === 1 ? `1 of your ${noun(l.name)} looks like it belongs to a project.` : `${String(l.count)} ${noun(l.name)} look like they belong to a project.`);
  const n = twice?.count ?? 0;
  if (n > 0) out.push(n === 1 ? '1 lesson was learned twice, in two projects.' : `${String(n)} lessons were learned twice, in two projects.`);
  return out;
}

/** One question a write filed: its words, and whether it was already waiting on Decide rather than put there now. */
export type Asked = { said: string; again: boolean };

/** The first sentence one of these fields holds, or ''. */
const wordsOf = (x: unknown): string => {
  if (!isObject(x)) return '';
  for (const k of ['line', 'title', 'said', 'ask', 'text']) if (text(x[k]) !== '') return text(x[k]);
  return '';
};

/**
 * A write's answer (`{ asked: [...] }`, or the list itself), read as `unknown`: a question a line. Its words are the
 * record's own when it sends them, and `words(entry, i)` when it sends only the question's handle, which is never printed.
 */
export function readAsked(value: unknown, words: (entry: Record<string, unknown>, i: number) => string): Asked[] {
  const list = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.asked) ? value.asked : isObject(value) && Array.isArray(value.questions) ? value.questions : [];
  return list.flatMap((one, i): Asked[] => {
    if (!isObject(one)) return [];
    const said = wordsOf(one) || wordsOf(one.question) || words(one, i);
    const again = one.opened === false || one.again === true || (isObject(one.question) && one.question.opened === false);
    return said === '' ? [] : [{ said, again }];
  });
}

/** Where to answer each question filed. */
export const askedLines = (asked: Asked[]): string[] => asked.map((a) => `${a.again ? 'Already on Decide' : 'Asked on Decide'}: ${closed(a.said)}`);

/** The words of a scope question the record sent only the handle of: the read's own question for that list, said once. */
function scopeWords(read: ScopeRead | null): (entry: Record<string, unknown>) => string {
  const used = new Set<string>();
  return (entry) => {
    const list = read?.lists.find((l) => l.list !== '' && l.list === text(entry.list));
    const name = list ? noun(list.name) : '';
    if (list && !used.has(list.list)) {
      used.add(list.list);
      return list.line || `Move ${String(list.count)} ${name} to the projects they belong to?`;
    }
    return name === '' ? 'One more question about where things belong.' : `One more question about your ${name}.`;
  };
}

/** The words of a lesson question the record sent only the handle of, from the two projects of its pair. */
function twiceWords(read: TwiceRead | null): (entry: Record<string, unknown>, i: number) => string {
  return (entry, i) => {
    const two = projectsOf(entry) ?? read?.pairs[i] ?? null;
    return two ? `${two[0]} and ${two[1]} learned the same thing. Keep it once, for everywhere?` : 'A lesson was learned twice. Keep it once, for everywhere?';
  };
}

/** One list that says what makes two of its things the same: its handle, never printed, and its name. */
export type SameList = { register: string; name: string };

/** The lists of `boot`'s index whose declaration (`schema`) says `same:`, each read as `unknown`, in the index's order. */
export function sameLists(boot: unknown, decls: readonly unknown[]): SameList[] {
  const index = isObject(boot) && Array.isArray(boot.registers) ? boot.registers : [];
  return index.flatMap((r, i): SameList[] => {
    const decl = decls[i];
    if (!isObject(r) || text(r.id) === '' || !isObject(decl) || !isObject(decl.same) || !Array.isArray(decl.same.fields)) return [];
    return [{ register: text(r.id), name: text(decl.name) || text(r.name) }];
  });
}

/** How many things `heldTwice` names as maybe here twice: its `seqs`, and nothing for a list it did not look in. */
export const twiceCount = (value: unknown): number => (isObject(value) && Array.isArray(value.seqs) ? value.seqs.length : 0);

/** The words of a fold the record sent only the handle of: "4 tools may be here twice. Keep one of each?" A list with no name is said as one. */
export const foldWords = (list: SameList, n: number): string =>
  list.name === '' ? `${String(n)} things in one of your lists may be here twice. Keep one of each?` : `${String(n)} ${noun(list.name)} may be here twice. Keep one of each?`;

/** Whether the record refused because it has no such read: an older build, or a host that knows no such route. */
const older = (r: Result<unknown>): boolean => refused(r) && (r.refusal.code === 'NOT_IN_THIS_BUILD' || r.refusal.code === 'ROUTE_UNKNOWN');

/** The one call this command makes of a client, so a test can hand it a stand-in. */
export type Caller = { call: (name: string, args?: Record<string, unknown>) => Promise<Result<unknown>> };

/**
 * `braindog tidy [--ask] [--json] [--host <host>]`, and the exit code: 0 read, 1 refused, 3 unreachable.
 *
 * STALE THINGS STILL EXIT 0, as a red sign does in `braindog signs`: the command read them, and that is the answer. A
 * RECORD OLDER THAN THE COMMAND EXITS 0 TOO, with one sentence: nothing is wrong with what the person typed, and a
 * script that runs this on every machine should not stop on the one not updated yet. The two newer reads, and the
 * writes behind them, are held to the same rule one at a time: a record that has `stale` and not them says so in one
 * line. A refusal of any other kind is said by its fix, after everything that was read, and earns its own exit code.
 */
export async function tidyCommand(args: string[], io: AgentIo, make: (to: Target, headers: () => Promise<Record<string, string>>, signal: AbortSignal) => Caller = clientFor): Promise<number> {
  let values: { host?: string | undefined; ask?: boolean | undefined };
  try {
    ({ values } = parseArgs({ args, strict: true, allowPositionals: false, options: { host: { type: 'string' }, ask: { type: 'boolean' } } }));
  } catch {
    io.say(USAGE);
    return 1;
  }
  let to: Target;
  try {
    to = target(values.host, io.env, hostsPath(io.env));
  } catch (e) {
    io.say(e instanceof Error ? e.message : 'No BrainDog host could be read.');
    return 1;
  }
  /* NO SESSION HEADERS, so the read names no run and the record has no run to open or move. A question `--ask` files is
     signed by the person whose key this is, the one at the terminal, and by no run. */
  const client = make(to, async () => ({}), AbortSignal.timeout(budgetOf(io.env)));
  const fix = (r: Result<unknown>): string => (refused(r) && r.refusal.code === 'UNREACHABLE' ? `${to.key} did not answer.` : printable(fixOf(r)));
  const answer: Result<unknown> = await client.call('stale');
  if (!answer.ok) {
    if (older(answer)) {
      io.out(OLDER);
      return 0;
    }
    return refuse(io, answer, fix(answer));
  }
  /* EVERY ANSWER UNTOUCHED, under the name of the call that gave it; one the record does not give is left out. */
  const value: Record<string, unknown> = { stale: answer.value };
  const failed: Result<unknown>[] = [];
  const [scopesAnswer, twiceAnswer] = await Promise.all([client.call('scopeProposals'), client.call('learningsTwice')]);
  const scopes = scopesAnswer.ok ? printable(readScopes((value.scopeProposals = scopesAnswer.value))) : null;
  const twice = twiceAnswer.ok ? printable(readTwice((value.learningsTwice = twiceAnswer.value))) : null;
  const scopesOlder = older(scopesAnswer);
  const twiceOlder = older(twiceAnswer);
  for (const r of [scopesAnswer, twiceAnswer]) if (!r.ok && !older(r)) failed.push(r);

  const sort = sortLines(scopes, twice);
  const tail: string[] = [];
  let askOlder = false;
  if (values.ask === true) {
    /* A WRITE IS SENT ONLY BEHIND A READ THAT ANSWERED: a record that cannot say what is out of place cannot ask about it. */
    const asked: Asked[] = [];
    let wrote = false;
    const ask = async (name: 'proposeScopes' | 'promoteLearnings', words: (entry: Record<string, unknown>, i: number) => string): Promise<void> => {
      const r = await client.call(name);
      if (r.ok) {
        wrote = true;
        asked.push(...printable(readAsked((value[name] = r.value), words)));
      } else if (older(r)) askOlder = true;
      else failed.push(r);
    };
    if (scopes) await ask('proposeScopes', scopeWords(scopes));
    if (twice) await ask('promoteLearnings', twiceWords(twice));
    /* THE FOLD, A LIST AT A TIME, each behind its own read: a list `heldTwice` names nothing in is asked nothing. A
       record too old to say which lists fold, or which things are here twice, is asked nothing and says nothing. */
    const boot = await client.call('boot');
    if (!boot.ok && !older(boot)) failed.push(boot);
    const index = boot.ok && isObject(boot.value) && Array.isArray(boot.value.registers) ? boot.value.registers : [];
    const decls = await Promise.all(
      index.map(async (r) => (isObject(r) && text(r.id) !== '' ? await client.call('schema', { register: text(r.id) }) : null)),
    );
    const heldBy: Record<string, unknown> = {};
    const foldedBy: Record<string, unknown> = {};
    for (const list of sameLists(boot.ok ? boot.value : null, decls.map((d) => (d?.ok ? d.value : null)))) {
      const held = await client.call('heldTwice', { register: list.register });
      if (!held.ok) {
        if (!older(held)) failed.push(held);
        continue;
      }
      heldBy[list.register] = held.value;
      const n = twiceCount(held.value);
      if (n === 0) continue;
      const r = await client.call('askFoldTwice', { register: list.register });
      if (r.ok) {
        wrote = true;
        foldedBy[list.register] = r.value;
        asked.push(...printable(readAsked([r.value], () => foldWords(list, n))));
      } else if (older(r)) askOlder = true;
      /* NOTHING HERE TWICE BY THE TIME IT WAS PRESSED is nothing to ask, and no failure. */
      else if (!(refused(r) && r.refusal.code === 'ALREADY_KNOWN')) failed.push(r);
    }
    if (Object.keys(heldBy).length > 0) value.heldTwice = heldBy;
    if (Object.keys(foldedBy).length > 0) value.askFoldTwice = foldedBy;
    tail.push(...askedLines(asked));
    if (wrote && asked.length === 0) tail.push(sort.length > 0 ? 'Nothing new was asked on Decide.' : 'Nothing to ask about.');
  } else if (sort.length > 0) tail.push('Ask about them with braindog tidy --ask.');
  if (scopesOlder || twiceOlder) tail.push(scopesOlder && twiceOlder ? OLDER_BOTH : scopesOlder ? OLDER_SCOPES : OLDER_TWICE);
  if (askOlder) tail.push(OLDER_ASK);

  io.answer?.({ value });
  const lines = tidyLines(printable(readStale(answer.value)));
  const more = [...sort, ...tail];
  for (const line of more.length > 0 ? [...lines, '', ...more] : lines) io.out(line);
  /* WHAT WAS READ IS PRINTED FIRST, and then each refusal by its fix, the first one's code the command's. */
  let code = 0;
  for (const r of failed) {
    const c = refuse(io, r, fix(r));
    code ||= c;
  }
  return code;
}
