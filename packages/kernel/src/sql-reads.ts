/**
 * What one SQL statement reads, as a held reading needs it: the tables it reads, and the lists each read of the rows is
 * held to by the list column (`readsOf`). A figure is held while the lists it read stand (`held-readings.ts`), and a vital
 * sign until something it read is written (`held-signs.ts`); both are told what a statement read by this.
 *
 * A LIST IS NAMED ONLY WHERE THE LIST COLUMN IS BOUND TO IT (`register = ?`, `e.register IN (?, 'tasks')`), never by a
 * value elsewhere in the statement that happens to be a list's id: `actor = 'system'` on a record with a list called
 * `system` read every list's rows and was held on that one list alone (review 3, P3).
 *
 * AND A BINDING HOLDS A READ OF THE ROWS TO ITS LISTS ONLY WHERE IT NARROWS THAT READ: in the `WHERE` or `ON` of the
 * select that reads it, joined to the rest of that clause by `AND` alone at every bracket on the way out, and naming the
 * read by its alias where it names one. A binding under `OR`, `NOT`, `CASE`, inside a function or in what a select
 * answers narrows nothing, and a read of the rows that no binding narrows reads the rows of any list (`loose`). What this
 * cannot be sure of is loose, and never held to a list.
 *
 * PURE, and Node loads it.
 */

import type { Param } from '@braindog/ports';

import { pastSplitView } from './split-view.ts';

/** A table's name as SQL may write it: bare, or in double quotes, backticks or brackets. */
const NAME = /^\s*(?:"((?:[^"]|"")+)"|`((?:[^`]|``)+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_$]*))/u;

/** The name at the head of `text`, its quotes taken off, and what follows it. */
function nameAt(text: string): { name: string; rest: string } | null {
  const m = NAME.exec(text);
  if (m === null) return null;
  const name = m[1]?.replace(/""/gu, '"') ?? m[2]?.replace(/``/gu, '`') ?? m[3] ?? m[4]!;
  return { name, rest: text.slice(m[0].length) };
}

/**
 * The table named at the head of `text`, and the schema before it if there is one: `entry`, `main.entry`,
 * `"main"."entry"`, `[main].[entry]`. `null` where no name can be read, or a dot is followed by none.
 */
export function tableAt(text: string): { schema: string | null; name: string } | null {
  const first = nameAt(text);
  if (first === null) return null;
  const dot = /^\s*\.(?!\.)/u.exec(first.rest);
  if (dot === null) return { schema: null, name: first.name };
  const second = nameAt(first.rest.slice(dot[0].length));
  return second === null ? null : { schema: first.name, name: second.name };
}

/**
 * `text` with its comments blanked, each string as `'n'` (its place in `strings`) and each parameter as `?n` (its number
 * as SQLite counts them, from 1), so a word is read only where it stands in the SQL and a bound value is found by its
 * place. A quoted name is kept as it is.
 */
export function marked(text: string): { text: string; strings: string[] } {
  const strings: string[] = [];
  const named = new Map<string, number>();
  let most = 0;
  let out = '';
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    if (c === "'") {
      let j = i + 1;
      let value = '';
      for (; j < text.length; j++) {
        if (text[j] !== "'") value += text[j];
        else if (text[j + 1] === "'") (value += "'"), j++;
        else break;
      }
      out += `'${strings.length}'`;
      strings.push(value);
      i = j + 1;
    } else if (c === '-' && text[i + 1] === '-') {
      const end = text.indexOf('\n', i);
      out += ' ';
      i = end < 0 ? text.length : end;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      out += ' ';
      i = end < 0 ? text.length : end + 2;
    } else if (c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c;
      let j = i + 1;
      for (; j < text.length; j++) {
        if (text[j] !== close) continue;
        /* A QUOTE DOUBLED inside a quoted name is the quote itself. */
        if (close !== ']' && text[j + 1] === close) {
          j++;
          continue;
        }
        break;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '?') {
      const digits = /^\d*/u.exec(text.slice(i + 1))![0];
      const n = digits === '' ? most + 1 : Number(digits);
      most = Math.max(most, n);
      out += `?${n}`;
      i += 1 + digits.length;
    } else if ((c === ':' || c === '@' || c === '$') && /[A-Za-z_]/u.test(text[i + 1] ?? '') && !/[A-Za-z0-9_]/u.test(text[i - 1] ?? ' ')) {
      const word = /^[A-Za-z0-9_]+/u.exec(text.slice(i + 1))![0];
      let n = named.get(word);
      if (n === undefined) named.set(word, (n = ++most));
      out += `?${n}`;
      i += 1 + word.length;
    } else {
      out += c;
      i++;
    }
  }
  return { text: out, strings };
}

/**
 * One piece of a marked statement: a word (a keyword or a bare name), a quoted name, a parameter (`v` its number), a
 * string (`v` its place in `strings`), a number, or a mark. `group` is the index of the bracket it stands inside, `-1` at
 * the top; a bracket itself stands in the group around it.
 */
type Token = { k: 'word' | 'name' | 'param' | 'string' | 'num' | 'mark'; v: string; group: number };

const DIGITS = /\d+/uy;
const WORD = /[A-Za-z_][A-Za-z0-9_$]*/uy;
const NUMBER = /0[xX][0-9A-Fa-f]+|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?/uy;
const OPERATOR = /->>|->|==|!=|<>|<=|>=|\|\||<<|>>/uy;

/** The pieces of a marked statement (`marked`), and where each bracket closes. `null` where its brackets do not pair. */
function tokens(text: string): { ts: Token[]; close: Map<number, number> } | null {
  const ts: Token[] = [];
  const close = new Map<number, number>();
  const open: number[] = [];
  const group = (): number => (open.length === 0 ? -1 : open[open.length - 1]!);
  const at = (re: RegExp, i: number): string | null => {
    re.lastIndex = i;
    return re.exec(text)?.[0] ?? null;
  };
  for (let i = 0; i < text.length; ) {
    const c = text[i]!;
    let m: string | null;
    if (/\s/u.test(c)) i++;
    else if (c === "'") {
      const j = text.indexOf("'", i + 1);
      if (j < 0) return null;
      ts.push({ k: 'string', v: text.slice(i + 1, j), group: group() });
      i = j + 1;
    } else if (c === '?') {
      const digits = at(DIGITS, i + 1) ?? '';
      ts.push({ k: 'param', v: digits, group: group() });
      i += 1 + digits.length;
    } else if (c === '"' || c === '`' || c === '[') {
      const shut = c === '[' ? ']' : c;
      let j = i + 1;
      let v = '';
      for (; j < text.length; j++) {
        if (text[j] !== shut) v += text[j];
        else if (shut !== ']' && text[j + 1] === shut) (v += shut), j++;
        else break;
      }
      if (j >= text.length) return null;
      ts.push({ k: 'name', v, group: group() });
      i = j + 1;
    } else if ((m = at(WORD, i)) !== null) {
      ts.push({ k: 'word', v: m, group: group() });
      i += m.length;
    } else if ((m = at(NUMBER, i)) !== null) {
      ts.push({ k: 'num', v: m, group: group() });
      i += m.length;
    } else if (c === '(') {
      ts.push({ k: 'mark', v: '(', group: group() });
      open.push(ts.length - 1);
      i++;
    } else if (c === ')') {
      const opened = open.pop();
      if (opened === undefined) return null;
      ts.push({ k: 'mark', v: ')', group: group() });
      close.set(opened, ts.length - 1);
      i++;
    } else {
      const op = at(OPERATOR, i) ?? c;
      ts.push({ k: 'mark', v: op, group: group() });
      i += op.length;
    }
  }
  return open.length === 0 ? { ts, close } : null;
}

/** Whether `t` is one of the keywords `words` (upper case). */
const is = (t: Token | undefined, words: ReadonlySet<string>): boolean => t !== undefined && t.k === 'word' && words.has(t.v.toUpperCase());
const set = (...words: string[]): ReadonlySet<string> => new Set(words);

const WHERE_ON = set('WHERE', 'ON');
const ON = set('ON');
const JOIN = set('JOIN');
const OUTER = set('OUTER');
/** A join that keeps every row of the table it joins, whatever its `ON` says. */
const KEEPS = set('RIGHT', 'FULL');
const AND = set('AND');
const OR = set('OR');
const BETWEEN = set('BETWEEN');
const CASE = set('CASE');
const END = set('END');
const IN = set('IN');
const AS = set('AS');
const READ_AT = set('FROM', 'JOIN');
/** The words of a join, which go on a `FROM`'s list. */
const JOINS = set('JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER');
const SELECT = set('SELECT');
const WITH = set('WITH');
/** What a statement is, by its first word, or the first past a `WITH`'s tables: a read is a select or values. */
const READS = set('SELECT', 'VALUES');
const STATEMENTS = set('SELECT', 'VALUES', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE');
/** What ends a `WHERE`, an `ON` or a `FROM`'s list at its own bracket. */
const CLAUSE_END = set('WHERE', 'GROUP', 'ORDER', 'LIMIT', 'HAVING', 'WINDOW', 'UNION', 'INTERSECT', 'EXCEPT', 'RETURNING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'SET', 'DO');
/** What, between a binding and its `WHERE` or `ON`, says the binding is not one of the clause's `AND`s. */
const NOT_A_CLAUSE = set('OR', 'WHEN', 'THEN', 'ELSE', 'CASE', 'SELECT', 'FROM', 'JOIN', 'USING', 'GROUP', 'BY', 'HAVING', 'ORDER', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'VALUES', 'SET', 'RETURNING', 'WINDOW', 'OVER', 'FILTER');
/** Words that follow a table's name and are not its alias. */
const NO_ALIAS = set(
  'WHERE', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'OUTER', 'ON', 'USING', 'GROUP', 'ORDER', 'LIMIT', 'OFFSET', 'HAVING',
  'WINDOW', 'UNION', 'INTERSECT', 'EXCEPT', 'INDEXED', 'NOT', 'SET', 'VALUES', 'RETURNING', 'DEFAULT', 'SELECT', 'AND', 'OR', 'WHEN', 'THEN',
  'ELSE', 'END', 'DO', 'FROM', 'IS', 'IN',
);

const isEnd = (t: Token): boolean => is(t, CLAUSE_END) || t.v === ',' || t.v === ';';
const named = (t: Token | undefined): boolean => t !== undefined && (t.k === 'word' || t.k === 'name');

/** What a statement's shape says, apart from what it binds: kept by its text, which is read again and again. */
type Shape = {
  tables: string[];
  /** It reads a table this cannot name, or its brackets or quotes do not pair. */
  unsure: boolean;
  /** It is no read: a write, or a statement this does not know. */
  writes: boolean;
  /** How many times it reads the rows. */
  reads: number;
  /** Each binding of the list column: its values (a parameter's number or a string's place), and the read it narrows. */
  bindings: { values: { param?: number; string?: number }[]; narrows: number | null }[];
  strings: string[];
};

/** The `CASE` an `END` at `j` closes, at its own bracket, or -1. */
function caseOf(ts: Token[], j: number): number {
  let depth = 0;
  for (let i = j; i >= 0; i--) {
    if (ts[i]!.group !== ts[j]!.group) continue;
    if (is(ts[i], END)) depth++;
    else if (is(ts[i], CASE) && --depth === 0) return i;
  }
  return -1;
}

/** The `END` closing a `CASE` at `j`, at its own bracket, or -1. */
function endOf(ts: Token[], j: number): number {
  let depth = 0;
  for (let i = j; i < ts.length; i++) {
    if (ts[i]!.group !== ts[j]!.group) continue;
    if (is(ts[i], CASE)) depth++;
    else if (is(ts[i], END) && --depth === 0) return i;
  }
  return -1;
}

/**
 * The `WHERE` or `ON` a binding from `start` to `end` narrows, or -1 where it narrows nothing: it is joined to that clause
 * by `AND` alone, at its own bracket and at every bracket around it, each entered from a `WHERE`, an `ON`, an `AND` or
 * another bracket.
 */
function clauseOf(ts: Token[], close: Map<number, number>, start: number, end: number): number {
  const before = ts[start - 1];
  if (!(is(before, WHERE_ON) || is(before, AND) || before?.v === '(')) return -1;
  let g = ts[start]!.group;
  let from = start - 1;
  let after = end + 1;
  for (;;) {
    /* BACK TO THE CLAUSE at this bracket: no `OR`, no `CASE` it stands in, no `BETWEEN` whose `AND` is this one's. */
    let clause = -1;
    let ands = 0;
    for (let j = from; j > g; j--) {
      const t = ts[j]!;
      if (t.group !== g) continue;
      if (is(t, END)) {
        j = caseOf(ts, j);
        if (j < 0) return -1;
        continue;
      }
      if (is(t, WHERE_ON)) {
        clause = j;
        break;
      }
      if (is(t, NOT_A_CLAUSE)) return -1;
      if (is(t, AND)) ands++;
      else if (is(t, BETWEEN)) {
        if (ands <= 1) return -1;
        ands--;
      }
    }
    /* AND ON TO THE END OF THIS BRACKET, or of the clause: what comes next is an `AND` or the end, and no `OR` after. */
    const last = g < 0 ? ts.length : close.get(g)!;
    let first = true;
    for (let j = after; j < last; j++) {
      const t = ts[j]!;
      if (t.group !== g) continue;
      if (clause >= 0 && isEnd(t)) break;
      if (first && !is(t, AND)) return -1;
      first = false;
      if (is(t, CASE)) {
        j = endOf(ts, j);
        if (j < 0) return -1;
      } else if (is(t, OR)) return -1;
    }
    if (clause >= 0) return clause;
    if (g < 0) return -1;
    /* OUT OF THIS BRACKET, which a `WHERE`, an `ON`, an `AND` or another bracket opened. */
    const opener = ts[g - 1];
    if (!(is(opener, WHERE_ON) || is(opener, AND) || opener?.v === '(')) return -1;
    from = g - 1;
    after = last + 1;
    g = ts[g]!.group;
  }
}

/** The shape of a statement's text (`Shape`). */
function shapeOf(text: string): Shape {
  /* A READ OVER THE PARTS VIEW (`split-view.ts`) reads the rows as the statement under it reads the view: each row of
     the view keeps its row's list. */
  const past = pastSplitView(text);
  if (past !== null) {
    const under = shapeOf(past);
    return { ...under, tables: [...new Set([...under.tables, 'entry', 'json_each'])] };
  }
  const sql = marked(text);
  const read = tokens(sql.text);
  const unsure: Shape = { tables: [], unsure: true, writes: false, reads: 0, bindings: [], strings: sql.strings };
  if (read === null) return unsure;
  const { ts, close } = read;
  /* A WRITE, OR NO STATEMENT THIS KNOWS. Past a `WITH`, the first statement's word at the top, and not a function of
     that name (`replace(...)` in what a select answers). */
  const main = is(ts[0], WITH) ? ts.find((t, i) => t.group === -1 && is(t, STATEMENTS) && ts[i + 1]?.v !== '(') : ts[0];
  const writes = !is(main, READS);
  const tables = new Set<string>();
  let lost = false;
  /* THE TABLE AT `j`: a name, after its schema if it has one; a bracket opens a select or a join of its own, read by its own `FROM`. */
  const tableAtToken = (j: number): void => {
    const t = ts[j];
    if (t?.v === '(') return;
    if (!named(t) || (t!.k === 'word' && NO_ALIAS.has(t!.v.toUpperCase()))) return void (lost = true);
    if (ts[j + 1]?.v === '.') {
      if (!named(ts[j + 2])) return void (lost = true);
      tables.add(ts[j + 2]!.v.toLowerCase());
    } else tables.add(t!.v.toLowerCase());
  };
  for (let i = 0; i < ts.length; i++) {
    if (!is(ts[i], READ_AT)) continue;
    tableAtToken(i + 1);
    if (ts[i]!.v.toUpperCase() !== 'FROM') continue;
    /* A COMMA'S JOIN, in the `FROM`'s own list: `FROM event, entry` reads both. */
    const g = ts[i]!.group;
    const last = g < 0 ? ts.length : close.get(g)!;
    for (let j = i + 1; j < last; j++) {
      const t = ts[j]!;
      if (t.group !== g) continue;
      if (t.v === ',') tableAtToken(j + 1);
      else if (isEnd(t) && !is(t, JOINS)) break;
    }
  }

  /* EACH READ OF THE ROWS: `entry` not followed by a dot (`entry.register` is a column), and the name it is read by. */
  const reads: { at: number; by: string }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i]!;
    if (!named(t) || t.v.toLowerCase() !== 'entry' || ts[i + 1]?.v === '.') continue;
    const next = ts[i + 1];
    const alias = is(next, AS) && named(ts[i + 2]) ? ts[i + 2]! : next?.k === 'name' || (next?.k === 'word' && !NO_ALIAS.has(next.v.toUpperCase())) ? next : undefined;
    reads.push({ at: i, by: (alias?.v ?? 'entry').toLowerCase() });
  }

  /* EACH BINDING OF THE LIST COLUMN, the read it narrows if it narrows one. */
  const bindings: Shape['bindings'] = [];
  for (let b = 0; b < ts.length; b++) {
    const t = ts[b]!;
    if (!named(t) || t.v.toLowerCase() !== 'register') continue;
    let start = b;
    let by: string | null = null;
    if (ts[b - 1]?.v === '.' && named(ts[b - 2])) {
      by = ts[b - 2]!.v.toLowerCase();
      start = ts[b - 3]?.v === '.' && named(ts[b - 4]) ? b - 4 : b - 2;
    }
    const value = (u: Token | undefined): { param?: number; string?: number } | null =>
      u?.k === 'param' && u.v !== '' ? { param: Number(u.v) } : u?.k === 'string' ? { string: Number(u.v) } : null;
    const values: { param?: number; string?: number }[] = [];
    let end = -1;
    if (ts[b + 1]?.v === '=' || ts[b + 1]?.v === '==') {
      const v = value(ts[b + 2]);
      if (v === null) continue;
      values.push(v);
      end = b + 2;
    } else if (is(ts[b + 1], IN) && ts[b + 2]?.v === '(') {
      const shut = close.get(b + 2)!;
      let ok = shut > b + 3;
      for (let j = b + 3; ok && j < shut; j += 2) {
        const v = value(ts[j]);
        if (v === null || (j + 1 < shut && ts[j + 1]!.v !== ',')) ok = false;
        else values.push(v);
      }
      if (!ok) continue;
      end = shut;
    } else continue;
    /* THE READ IT NARROWS: one read of the rows in the select whose `WHERE` or `ON` holds it, by the name it is read by. */
    const clause = clauseOf(ts, close, start, end);
    let narrows: number | null = null;
    if (clause >= 0 && is(ts[clause], ON)) {
      /* AN `ON` NARROWS THE TABLE IT JOINS AND NO OTHER: `LEFT JOIN x ON a.register = ?` keeps every row of `a`, and a
         right or full join keeps every row of the table it joins too. */
      const g = ts[clause]!.group;
      let join = clause - 1;
      while (join > g && !(ts[join]!.group === g && is(ts[join], JOIN))) join--;
      const keeps = is(ts[join - 1], KEEPS) || (is(ts[join - 1], OUTER) && is(ts[join - 2], KEEPS));
      const joined = ts[join + 2]?.v === '.' ? join + 3 : join + 1;
      const read = join > g && !keeps ? reads.find((r) => r.at === joined) : undefined;
      if (read !== undefined && (by === null || read.by === by)) narrows = read.at;
    } else if (clause >= 0) {
      /* A `WHERE` NARROWS EVERY READ IN ITS SELECT'S `FROM`: the one it names, or the only one there. */
      const g = ts[clause]!.group;
      let from = clause - 1;
      while (from > g && !(ts[from]!.group === g && is(ts[from], SELECT))) from--;
      const here = reads.filter((r) => ts[r.at]!.group === g && r.at > from && r.at < clause && (by === null || r.by === by));
      if (here.length === 1) narrows = here[0]!.at;
    }
    bindings.push({ values, narrows });
  }
  return { tables: [...tables], unsure: lost, writes, reads: reads.length, bindings, strings: sql.strings };
}

/** The shapes read, by their text, the oldest first. */
const shapes = new Map<string, Shape>();
const SHAPES_MOST = 2_000;

/** What one statement read (`readsOf`). */
export type Reads = {
  /** Each table it reads from, lower case: after `FROM`, `JOIN` or a comma in a `FROM`'s list. */
  tables: string[];
  /** It reads a table this cannot name, or this could not read it at all. */
  unsure: boolean;
  /** It is no read: a write, or a statement this does not know. */
  writes: boolean;
  /** The lists it binds the list column to, each one `known`. */
  lists: string[];
  /** How many of its reads of the rows no binding narrows to its lists: each reads the rows of any list. */
  loose: number;
};

/**
 * What a statement read with `params` reads: its tables, the lists it binds the list column to (each value one `known`
 * says is a list), and how many of its reads of the rows no such binding narrows (`loose`).
 */
export function readsOf(text: string, params: readonly Param[], known: (word: string) => boolean): Reads {
  let shape = shapes.get(text);
  if (shape === undefined) {
    shape = shapeOf(text);
    shapes.set(text, shape);
    if (shapes.size > SHAPES_MOST) shapes.delete(shapes.keys().next().value as string);
  }
  const lists = new Set<string>();
  const narrowed = new Set<number>();
  for (const b of shape.bindings) {
    const values = b.values.map((v) => (v.param !== undefined ? params[v.param - 1] : shape.strings[v.string!]));
    if (!values.every((v): v is string => typeof v === 'string' && known(v))) continue;
    for (const v of values) lists.add(v);
    if (b.narrows !== null) narrowed.add(b.narrows);
  }
  return { tables: shape.tables, unsure: shape.unsure, writes: shape.writes, lists: [...lists], loose: shape.reads - narrowed.size };
}
