/**
 * Imported automations as filing rules, offered on Home (`ImportedRules.svelte`). REC-B10, job 7: an automation an
 * import made that files a Ledger entry by its description keeps firing beside the filing rules, and one press turns
 * every such automation into a filing rule and switches the automation off, with one Undo.
 *
 * WHICH ARE PICKED, AND NOTHING ELSE. An automation that is on, starts when a Ledger entry is written, tests the
 * description alone ("holds" or "starts with" a text) and does one thing, set the category. One that tests anything
 * else, does anything more, runs as steps, belongs to an add-on or a project, or names a category the record does not
 * hold is left as it is. Two that say the same text under one category are one rule, and both are switched off; two
 * that say it under two categories are left on, since two rules of one text tie and file nothing. One whose text a
 * filing rule already holds is only switched off, and only where that rule files it the same way.
 *
 * AN OFFER HE PRESSES AND NEVER A QUESTION. Nothing here asks, files or switches anything until the press.
 *
 * ONE PRESS, ONE UNDO. The rules go in through `capture`, which keeps at most eight entries a call (`CAPTURE_MOST` in
 * the record), so more than eight go in as several batches, all or none: a refusal takes back every batch before it.
 * The switch-offs follow, and one refused puts everything back. Undo takes back every batch and switches each one on.
 * Each new rule also starts the record's own file-back (`rule-files-back`, money-core), which files the old entries
 * with no category it fits as a change of its own, run by run, and this Undo does not take those back.
 *
 * IT NEVER FAILS THE SCREEN. A read the host refuses, or one that throws, is `null`, and `null` draws nothing.
 *
 * A ROUTE-ONLY MODULE, like `learned.ts`: imported lazily from Home and never from anything every screen loads.
 */

import { createClient } from '@braindog/client';

import type { Fetch } from '../record/boot-live.ts';
import { undoChange } from '../record/undo-write.ts';

/**
 * THE LEDGER IS FOUND BY WHAT IT DECLARES, never by its id: the list that keeps which filing rule filed each entry (a
 * link to the filing-rules list) and holds its description in `what`, the field a rule that reads the description reads.
 */
const DESCRIPTION = 'what';

/** The list a rule goes into, and the list its category points at. */
export const FILING_RULES = 'filing_rules';
const CATEGORIES = 'categories';

/** The most entries one capture keeps (`CAPTURE_MOST` in `packages/record/src/methods/capture.ts`). */
export const CAPTURE_MOST = 8;

/** One filing rule an automation becomes, in the filing-rules list's own field ids, and the automations it stands for. */
export type ImportedRule = {
  /** The automation it was, by its handle. Never drawn. */
  rule: string;
  /** What the automation was called, kept on the rule's note. */
  name: string;
  match: string;
  match_by: 'contains' | 'starts';
  reads: 'description';
  direction: 'either';
  /** The category, as a row id or a spoken id the record resolves. */
  category: string;
  state: 'on';
  /** Other automations that said the very same, switched off with this one. Handles, never drawn. */
  also: string[];
  /**
   * A filing rule that is on already files this text under this category, so the press writes no second one (two rules
   * of one text tie, and a tie files nothing) and only switches the automation off.
   */
  there: boolean;
};

/** A filing rule the record holds that is on and reads the description: its text and its category's row id. */
export type HeldRule = { match: string; category: string };

/** What the offer holds: every rule the press would make. */
export type ImportedFound = { rules: ImportedRule[] };

/** A category as the record holds it: its row id and its name. */
export type CategoryRow = { id: string; name: string };

/** What the press did: how many rules it made, the batches that hold them, and the automations it switched off. */
export type Accepted = { made: number; batches: string[]; off: string[] };

/** A press's answer: what it did, or the record's sentence for why not, with the field it was about named. */
export type Pressed = { ok: true; value: Accepted } | { ok: false; fix: string };

/** A raw id as the record mints one, and a spoken one (`categories#4`): a category the record resolves as it is. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/iu;
const SPOKEN = new RegExp(`^${CATEGORIES}#\\d+$`, 'u');

const plainObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
/** A name folded for comparing: case, and the runs of spaces in it. */
const fold = (s: string): string => s.trim().replace(/\s+/gu, ' ').toLowerCase();

/** The quote pairs a sentence's text may be in: straight, and the curly pair a phone types. */
const QUOTES: readonly [string, string][] = [
  ['"', '"'],
  ['“', '”'],
  ["'", "'"],
];
/**
 * The text inside one quoted value, the value as it is when unquoted, or `null` for two quoted texts: a closing mark
 * followed by a space is where a quote closed, so `"uber" or "lyft"` is two texts, as the record reads it, never one.
 */
const unquote = (s: string): string | null => {
  const pair = QUOTES.find(([o, c]) => s.length >= 2 && s.startsWith(o) && s.endsWith(c));
  if (!pair) return s;
  const inner = s.slice(1, -1);
  return new RegExp(`${pair[1]}\\s`, 'u').test(inner) ? null : inner;
};

/** A test on the description as a sentence: "what contains talabat", "description starts with UBER". */
const SAID = /^(?:what|description)\s+(contains|holds|starts\s+with|starts)\s+(.+)$/iu;

/** The one test an automation makes on the description, or `null` for any other `when`. */
function testOf(when: unknown): { match: string; match_by: 'contains' | 'starts' } | null {
  if (typeof when === 'string') {
    const m = SAID.exec(when.trim());
    if (!m) return null;
    /* ONE CLAUSE: a comma outside quotes is a second test, and this is about one. */
    const value = unquote(m[2]!.trim());
    if (value === null || (value === m[2]!.trim() && /,/u.test(value))) return null;
    const match = value.trim();
    return match === '' ? null : { match, match_by: /^starts/iu.test(m[1]!) ? 'starts' : 'contains' };
  }
  if (!plainObj(when)) return null;
  if (Array.isArray(when.all)) return when.all.length === 1 ? testOf(when.all[0]) : null;
  const keys = Object.keys(when);
  if (when.field !== DESCRIPTION || keys.length !== 2) return null;
  for (const op of ['contains', 'starts'] as const) {
    const match = text(when[op]);
    if (keys.includes(op) && match !== '') return { match, match_by: op };
  }
  return null;
}

/** The category the one action sets, as written: a set on `category`, or a link to a category by a name typed out. */
function categoryOf(then: unknown): string | null {
  if (!Array.isArray(then) || then.length !== 1 || !plainObj(then[0])) return null;
  const act = then[0];
  if (plainObj(act.set) && act.set.field === 'category') return text(act.set.to) || null;
  if (plainObj(act.link) && act.link.field === 'category' && plainObj(act.link.to)) {
    const to = act.link.to;
    const value = text(to.value);
    /* A NAME TYPED OUT, never a template: `{{what}}` is the category's own Matches, which is Money's rule, not his. */
    if (to.register !== CATEGORIES || to.by !== 'name' || to.where !== undefined || to.take !== undefined) return null;
    return value === '' || value.includes('{{') ? null : value;
  }
  return null;
}

/** Whether the body starts on a Ledger write that makes or changes an entry. */
function onLedger(body: Record<string, unknown>, ledger: string): boolean {
  if (body.steps !== undefined) return false;
  const on = body.on;
  if (on === undefined) return body.register === ledger;
  if (!plainObj(on) || !plainObj(on.written) || on.written.register !== ledger) return false;
  if (body.register !== undefined && body.register !== ledger) return false;
  const op = on.written.op;
  return op === undefined || (Array.isArray(op) && (op.includes('create') || op.includes('update')));
}

/**
 * The category's row id or spoken id, as the record resolves one, or `null` for a name the record does not hold. With
 * `whole` (the categories are every one the record holds), a row id none of them has is `null` too: a category since
 * deleted would have the record refuse the whole press, every time it was pressed.
 */
function resolved(said: string, categories: readonly CategoryRow[], whole: boolean): string | null {
  if (ULID.test(said)) return !whole || categories.some((c) => c.id === said) ? said : null;
  if (SPOKEN.test(said)) return said;
  const named = categories.filter((c) => fold(c.name) === fold(said));
  return named.length === 1 ? named[0]!.id : null;
}

/**
 * Which automations become filing rules, from each automation with its body (`automation(rule)`) and the record's
 * categories. One that is off, belongs to an add-on (`pack`) or a project, starts on anything but a Ledger write, tests
 * more than the description, does more than set the category, or names a category the record does not hold is not
 * picked. Nought is an answer: `{ rules: [] }`.
 *
 * ONE TEXT, ONE RULE, whatever way it matches: the record's ladder takes a whole text first and the longest text next,
 * and two rules of one text tie and file nothing. So two automations of one text under one category are one rule, under
 * two categories neither; and one whose text a filing rule already holds (`held`) is only switched off where that rule
 * files it under the same category, and is left on where it does not.
 */
export function importedOf(
  rows: readonly unknown[],
  {
    categories = [],
    ledgers = [],
    held = [],
    whole = false,
  }: { categories?: readonly CategoryRow[]; ledgers?: readonly string[]; held?: readonly HeldRule[]; whole?: boolean } = {},
): ImportedFound {
  const picked: ImportedRule[] = [];
  const torn = new Set<string>();
  for (const row of rows) {
    if (!plainObj(row) || row.enabled !== true || !plainObj(row.body)) continue;
    if (text(row.pack) !== '' || text(row.project) !== '' || row.body.project !== undefined) continue;
    const rule = text(row.rule);
    const ledger = text(row.register);
    if (rule === '' || !ledgers.includes(ledger) || !onLedger(row.body, ledger)) continue;
    const test = testOf(row.body.when);
    const said = categoryOf(row.body.then);
    const category = said === null ? null : resolved(said, categories, whole);
    if (test === null || category === null) continue;
    const key = fold(test.match);
    const same = picked.find((r) => fold(r.match) === key);
    if (same && same.category !== category) torn.add(key);
    if (same) {
      same.also.push(rule);
      continue;
    }
    const there = held.filter((h) => fold(h.match) === key);
    if (there.some((h) => h.category !== category)) torn.add(key);
    const name = text(row.name) || test.match;
    picked.push({ rule, name, ...test, reads: 'description', direction: 'either', category, state: 'on', also: [], there: there.length > 0 });
  }
  return { rules: picked.filter((r) => !torn.has(fold(r.match))) };
}

/** What a rule is written as: its fields in the filing-rules list's own ids, and a note naming the automation it was. */
export function captureRowOf(r: ImportedRule): { register: string; fields: Record<string, unknown> } {
  const fields = { match: r.match, match_by: r.match_by, reads: r.reads, direction: r.direction, category: r.category, state: r.state };
  return { register: FILING_RULES, fields: { ...fields, note: `Made from the automation ${r.name}.` } };
}

/** The fields an automation is switched by, named as its page names them. A filing rule's are read off its list. */
const SWITCH: Readonly<Record<string, string>> = { rule: 'Automation', enabled: 'On or off' };

/** Each field's name as a list declares it (`schema`): its label, or its id said as words. */
export function labelsOf(decl: unknown): Record<string, string> {
  const fields = plainObj(decl) && Array.isArray(decl.fields) ? decl.fields : [];
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (!plainObj(f) || text(f.id) === '') continue;
    const said = text(f.label) || text(f.id).replaceAll('_', ' ');
    out[text(f.id)] = said[0]!.toUpperCase() + said.slice(1);
  }
  return out;
}

/**
 * What a refusal is said as: the record's sentence, and the field it was about by the field's own name (`labels`), or
 * the sentence alone where the field has none. Never the path the record answers it at (`rows[3].fields.match`).
 */
export function refusalSaid(answer: unknown, fallback: string, labels: Readonly<Record<string, string>> = {}): string {
  const r = plainObj(answer) && plainObj(answer.refusal) ? answer.refusal : plainObj(answer) && plainObj(answer.conflict) ? answer.conflict : null;
  const fix = (r ? text(r.fix) : '').replaceAll(/\s*\u2014\s*/gu, ', ') || fallback;
  const at = r ? (text(r.at).split('.').pop() ?? '') : '';
  const label = labels[at] ?? SWITCH[at];
  return label ? `${fix} (${label})` : fix;
}

/** The calls the offer makes, shaped like a client's, so a test hands in its own. */
export type Port = {
  automations: () => Promise<unknown>;
  automation: (rule: string) => Promise<unknown>;
  categories: () => Promise<unknown>;
  /** The filing rules the record holds, as `list` answers a page of them. */
  filingRules: () => Promise<unknown>;
  /** One list's declaration, as `schema(register)` answers it. */
  schema: (register: string) => Promise<unknown>;
  capture: (rows: { register: string; fields: Record<string, unknown> }[]) => Promise<unknown>;
  setAutomation: (rule: string, enabled: boolean) => Promise<unknown>;
  /** Put back one batch: `ok` when the record did, else its sentence. */
  undo: (batch: string) => Promise<{ ok: boolean; fix?: string }>;
};

/** The port over the record at `base`. */
export function portAt(base: string, io?: Fetch): Port {
  const client = createClient({ base, ...(io ? { fetch: io } : {}) });
  return {
    automations: () => client.automations(),
    automation: (rule) => client.automation(rule),
    categories: () => client.list({ register: CATEGORIES, limit: 500 }),
    filingRules: () => client.list({ register: FILING_RULES, limit: 500 }),
    schema: (register) => client.schema(register),
    capture: (rows) => client.capture({ rows }),
    setAutomation: (rule, enabled) => client.setAutomation({ rule, enabled }),
    undo: async (batch) => {
      const out = await undoChange(base, batch, io);
      return out.from === 'undone' ? { ok: true } : { ok: false, fix: out.fix };
    },
  };
}

const valueOf = (answer: unknown): unknown => (plainObj(answer) && answer.ok === true ? answer.value : undefined);

/** Whether a declaration is the Ledger's: a link to the filing-rules list, and its description in `what`. */
export function isLedger(decl: unknown): boolean {
  const fields = plainObj(decl) && Array.isArray(decl.fields) ? decl.fields.filter(plainObj) : [];
  return fields.some((f) => f.type === 'ref' && f.to === FILING_RULES) && fields.some((f) => f.id === DESCRIPTION);
}

/** How many automations are read at once: enough to be quick on a record with sixty, few enough to be kind to it. */
const AT_ONCE = 6;

/** The candidates' bodies, a few at a time. One the host refuses, or that throws, is left out. */
async function bodiesOf(port: Port, rules: readonly string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < rules.length; i += AT_ONCE) {
    const read = await Promise.all(rules.slice(i, i + AT_ONCE).map((r) => port.automation(r).catch(() => undefined)));
    out.push(...read.map(valueOf).filter((v) => v !== undefined));
  }
  return out;
}

/**
 * What the offer holds, read through `port`, or `null` for nought, a refusal or a throw. The list of automations is
 * read first and only the ones on and on a Ledger write are opened, so a record with none reads one thing.
 */
export async function readImported(port: Port): Promise<ImportedFound | null> {
  try {
    const listed = valueOf(await port.automations());
    if (!Array.isArray(listed)) return null;
    const written = listed.filter((a): a is Record<string, unknown> => plainObj(a) && a.enabled === true && a.trigger === 'written');
    const ledgers: string[] = [];
    for (const register of new Set(written.map((a) => text(a.register)).filter((r) => r !== ''))) {
      if (isLedger(valueOf(await port.schema(register).catch(() => undefined)))) ledgers.push(register);
    }
    const rules = written
      .filter((a) => ledgers.includes(text(a.register)))
      .map((a) => text(a.rule))
      .filter((r) => r !== '');
    if (rules.length === 0) return null;
    const bodies = await bodiesOf(port, rules);
    const page = valueOf(await port.categories());
    const rows = plainObj(page) && Array.isArray(page.rows) ? page.rows : [];
    const categories = rows.flatMap((c): CategoryRow[] =>
      plainObj(c) && typeof c.id === 'string' && plainObj(c.fields) && text(c.fields.name) !== '' ? [{ id: c.id, name: text(c.fields.name) }] : [],
    );
    /* THE FILING RULES HE HAS, so the press never writes a second rule of one text. Unread is nothing offered, since
       a rule written beside one already there would tie with it and file neither. */
    const kept = valueOf(await port.filingRules());
    if (!plainObj(kept) || !Array.isArray(kept.rows)) return null;
    const held = kept.rows.flatMap((r): HeldRule[] =>
      plainObj(r) && plainObj(r.fields) && r.fields.state === 'on' && r.fields.reads === 'description' && text(r.fields.match) !== ''
        ? [{ match: text(r.fields.match), category: text(r.fields.category) }]
        : [],
    );
    const whole = plainObj(page) && page.cursor === null;
    const found = importedOf(bodies, { categories, ledgers, held, whole });
    return found.rules.length > 0 ? found : null;
  } catch {
    return null;
  }
}

/** What the record at `base` would turn into filing rules. `null` for none, which draws nothing. Never throws. */
export async function loadImported(base: string, io?: Fetch): Promise<ImportedFound | null> {
  try {
    return await readImported(portAt(base, io));
  } catch {
    return null;
  }
}

/** Each handle the press switches off: every rule's automation and the ones that said the same. */
const handlesOf = (found: ImportedFound): string[] => found.rules.flatMap((r) => [r.rule, ...r.also]);

/** Put back what a press did, newest first: switch each automation on again, then take back each batch. */
async function putBack(port: Port, batches: readonly string[], off: readonly string[]): Promise<{ ok: true } | { ok: false; fix: string }> {
  let fix: string | null = null;
  for (const rule of [...off].reverse()) {
    const out = await port.setAutomation(rule, true).catch(() => null);
    if (!plainObj(out) || out.ok !== true) fix ??= refusalSaid(out, WORDS.unsent);
  }
  for (const batch of [...batches].reverse()) {
    const out = await port.undo(batch).catch(() => ({ ok: false, fix: WORDS.unsent }));
    if (!out.ok) fix ??= out.fix ?? WORDS.unsent;
  }
  return fix === null ? { ok: true } : { ok: false, fix };
}

/**
 * The press, through `port`: every rule written, eight to a capture, then every automation switched off. ALL OR NONE:
 * a capture or a switch-off the record refuses puts back what went before it, and the answer is the record's sentence
 * with the field it was about named.
 */
export async function acceptWith(port: Port, found: ImportedFound): Promise<Pressed> {
  const batches: string[] = [];
  const off: string[] = [];
  const undone = async (answer: unknown): Promise<Pressed> => {
    await putBack(port, batches, off);
    const labels = labelsOf(valueOf(await port.schema(FILING_RULES).catch(() => undefined)));
    return { ok: false, fix: refusalSaid(answer, WORDS.unsent, labels) };
  };
  if (found.rules.length === 0) return { ok: false, fix: WORDS.none };
  /* A RULE ALREADY THERE IS NOT WRITTEN AGAIN: its automation is only switched off. */
  const rows = found.rules.filter((r) => !r.there).map(captureRowOf);
  for (let i = 0; i < rows.length; i += CAPTURE_MOST) {
    const out = await port.capture(rows.slice(i, i + CAPTURE_MOST)).catch(() => null);
    const kept = valueOf(out);
    if (!plainObj(kept) || typeof kept.batch !== 'string') return undone(out);
    batches.push(kept.batch);
  }
  for (const rule of handlesOf(found)) {
    const out = await port.setAutomation(rule, false).catch(() => null);
    if (!plainObj(out) || out.ok !== true) return undone(out);
    off.push(rule);
  }
  return { ok: true, value: { made: rows.length, batches, off } };
}

/** The press on the record at `base`. Never throws. */
export async function acceptImported(base: string, found: ImportedFound, io?: Fetch): Promise<Pressed> {
  try {
    return await acceptWith(portAt(base, io), found);
  } catch {
    return { ok: false, fix: WORDS.unsent };
  }
}

/** The one Undo, through `port`: each automation switched on again and each batch of rules taken back. */
export const undoWith = (port: Port, done: Accepted): Promise<{ ok: true } | { ok: false; fix: string }> =>
  putBack(port, done.batches, done.off);

/** The one Undo on the record at `base`. Never throws. */
export async function undoImported(base: string, done: Accepted, io?: Fetch): Promise<{ ok: true } | { ok: false; fix: string }> {
  try {
    return await undoWith(portAt(base, io), done);
  } catch {
    return { ok: false, fix: WORDS.unsent };
  }
}

/** A count in words up to ten, as the rest of Home says one. */
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const counted = (n: number, one: string, many: string): string => `${COUNT[n] ?? String(n)} ${n === 1 ? one : many}`;

/** The offer's words, said here so the test reads what a person reads. */
export const WORDS = {
  ask: (n: number) =>
    n === 1 ? 'Turn one imported automation into a filing rule?' : `Turn ${counted(n, '', 'imported automations')} into filing rules?`,
  why: 'They file Ledger entries by their description. As filing rules they sit with the rest, and the automations are switched off.',
  press: (n: number) => (n === 1 ? 'Turn it into a filing rule' : `Turn all ${counted(n, '', '').trim()} into filing rules`),
  made: (made: number, off: number) =>
    `Made ${counted(made, 'filing rule', 'filing rules')} and switched off ${counted(off, 'automation', 'automations')}.`,
  undo: 'Undo',
  undone: 'Put back. The automations are on again.',
  unsent: 'That did not reach your BrainDog, so nothing was changed.',
  none: 'There is nothing to turn into a filing rule.',
} as const;
