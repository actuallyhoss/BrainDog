/**
 * The one plan sheet's reading of a plan: the record's `Diff` for an add-on or a
 * module, a use case's pack-by-pack plan (`routes/packs/sharing.ts` `SharedPlan`), or several of either for "Update
 * all", turned into the rows `PlanSheet.svelte` draws.
 *
 * THE WHOLE DIFF, NOT A SUMMARY OF IT. The Packs screen drew four of its keys (`keychain.ts` `planOf`), so an update that
 * retired a list, reset a setting or carried the owner's own edits over said none of it before the press. Every key a
 * person could want to know before approving is a section here, and a section with nothing in it is left out, because a
 * heading over nothing teaches people to skip headings.
 *
 * WHAT STOPS THE INSTALL COMES FIRST AND BLOCKS IT: a conflict, a requirement this record does not meet, a pack that
 * would stop meeting its own, and rows a retired list would strand. The record refuses each of these at install; the
 * sheet says them before anyone presses.
 *
 * PURE AND NODE-LOADABLE, so a test can read a plan without a browser: relative `.ts` imports only.
 */

import { doesOf } from '@braindog/kernel';

import { callLine, callsOutOf, type CallOut } from '../record/actions.ts';
import { keyHint, keyName } from './key-names.ts';

type Body = Record<string, unknown>;

const isMap = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): Body[] => (Array.isArray(v) ? v.filter(isMap) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The sheet's own words. The buttons' verbs are the verb and its object. */
export const words = {
  install: (name: string) => `Install ${name}`,
  /* NO VERSION NUMBERS ON THE BUTTONS OR THE PARTS: a person updates an add-on, and "1.2.0 to 1.3.0" is the add-on's
     bookkeeping, not theirs. */
  update: (name: string) => `Update ${name}`,
  reinstall: (name: string) => `Install ${name} again`,
  downgrade: (name: string) => `Go back to the earlier ${name}`,
  updateAll: (n: number) => (n === 1 ? 'Update 1 add-on' : `Update all ${n}`),
  updateAllTitle: (n: number) => (n === 1 ? 'One update' : `${n} updates`),
  updateAvailable: 'Update available',
  notNow: 'Not now',
  stops: "What stops this install",
  /* A KEY IT SENDS THAT IS NOT IN THE KEYS YET (`planPack`'s `keys`): the one step that puts it in, a command in a
     terminal that reads the key from standard input, and never a field on this sheet. */
  keyMissing: (label: string) => `The key "${label}" is not in your keys yet. Pipe it into this in a terminal:`,
  keyLooking: 'Looking again every few seconds. You can go on once the key is in.',
  /* AND THE BROWSER MAY TAKE IT (audit 31 Oct f, AF3, his call taken 31 Oct): where the sheet can put a key in, the key
     is added here, as the Keychain takes one, and the terminal is the second way. */
  keyHere: (label: string) => `The key "${label}" is not in your keys yet. Add it here, and it is kept in your Keychain.`,
  keyField: (label: string) => label,
  keyAdd: 'Add it here',
  keyAdding: 'Adding…',
  keyPass: 'Keychain password',
  keyTerminal: 'Or from a terminal:',
  keyAdded: (label: string) => `"${label}" is in your keys.`,
  /* A SIGN-IN TOO OLD TO OPEN THE KEYCHAIN, where no passkey could prove it on the sheet (RF3): the sign-in page, and back. */
  keySignIn: 'Sign in again',
  keyAgain: 'Then open this again.',
  adds: 'Adds',
  /* THE NUMBERS A PLAN ADDS, AS ONE ROW: seventeen of them named one under another buried its lists. */
  withPage: (detail: string | null) => (detail ? `${detail}, and its own page` : 'With its own page'),
  addsNumbers: (n: number) => (n === 1 ? 'and 1 number' : `and ${n.toLocaleString('en-GB')} numbers`),
  handed: 'already here, under another add-on',
  /** What an add-on's patterns read, by how each arrives (AH11). */
  readsBy: (ways: readonly string[]): string =>
    `Reads ${new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(ways)} you forward, and files each as it comes in`,
  readsSentIn: 'Reads what you forward, and files each as it comes in',
  changes: 'Changes',
  /* AN UPDATE THAT MOVES ENTRIES (`Diff.migrates`, phase 8): the author's line, and what happens when it fails. */
  migrates: 'Moves your entries',
  migratesLine: (from: string, to: string) => `from ${from} to ${to}, tried first. If any entry will not move, nothing changes and you keep ${from}.`,
  retires: 'Takes away',
  keepsRows: (n: number) => (n === 0 ? 'holds nothing' : n === 1 ? 'the 1 item in it stays in your BrainDog' : `the ${n.toLocaleString('en-GB')} items in it stay in your BrainDog`),
  moves: 'Hands on',
  movesTo: (to: string) => `stays, now under ${to}`,
  kept: 'Your edits it carries over',
  keptAdds: (fields: readonly string[]) => `keeps the ${fields.length === 1 ? 'field' : 'fields'} you added: ${fields.join(', ')}`,
  keptRebased: 'keeps your changes on top of the new version',
  keptOwn: 'keeps your version',
  stays: 'Values it keeps because something still holds them',
  staysLine: (values: readonly string[], rows: number) => `${values.join(', ')}, held by ${rows.toLocaleString('en-GB')} ${rows === 1 ? 'item' : 'items'}`,
  extends: 'Adds to your lists',
  extendsLine: (fields: readonly string[]) => `adds ${fields.join(', ')}`,
  pageAdds: 'Adds to your pages',
  /* A PAGE IT ADDS TO, BY ITS NAME, AND WHAT GOES ON IT BY THE TILES' OWN HEADINGS: "Money", "Cash counts, Last count".
     The record's own sentence ("adds a block to Money from count-cash") named a block and the add-on's id. */
  pageAddsLine: (headings: readonly string[], n: number) =>
    headings.length > 0 ? new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(headings) : n === 1 ? 'a tile' : `${n.toLocaleString('en-GB')} tiles`,
  pageMissing: (page: string) => `It adds to your ${page} page, which is not here yet. Add the add-on that brings ${page} first.`,
  settings: 'Settings',
  settingKept: (value: string) => `kept at ${value}`,
  settingDefault: (value: string) => `set to ${value}`,
  settingNone: 'left empty',
  examples: 'Examples',
  examplesLine: (n: number) => (n === 1 ? '1 example, marked as one and cleared in one step' : `${n.toLocaleString('en-GB')} examples, marked as examples and cleared in one step`),
  examplesIn: (n: number) => (n === 1 ? '1 item' : `${n.toLocaleString('en-GB')} items`),
  /* A SKILL IS TEXT YOUR AGENTS WILL FOLLOW, so installing says each one first: its name, and the moment it is for. One
     the record already has by that name is left as it is. */
  skills: 'Skills it gives your agents',
  skillLine: (trigger: string, what: string) => [what, trigger === '' ? '' : `For: ${trigger}`].filter((x) => x !== '').join(' ') || 'A skill your agents can use',
  tools: 'Tools it gives your agents',
  toolLine: (says: string, writes: boolean) => `${says || 'A tool your agents can call'}${writes ? ' It may change rows, as whoever calls it.' : ''}`,
  commandsAdded: 'In the command bar',
  rowActions: 'Actions on rows',
  rowActionOn: (list: string) => `On ${list} rows`,
  spawns: 'Rules that add things',
  spawnLine: (register: string, bound: number, when: string) => `adds to ${register}, at most ${bound.toLocaleString('en-GB')} ${when}`.trim(),
  interrupts: 'Rules that interrupt you',
  worth: 'Worth knowing',
  retype: (field: string, from: string, to: string, rows: number) => `${field} changes from ${from} to ${to} on ${rows.toLocaleString('en-GB')} ${rows === 1 ? 'item' : 'items'}`,
  required: (field: string, rows: number) => `${field} becomes required, and ${rows.toLocaleString('en-GB')} ${rows === 1 ? 'item leaves' : 'items leave'} it empty`,
  renamed: (from: string, to: string) => `${from} is renamed ${to}`,
  misread: (reader: string, where: string) => `${reader} reads "${where}" differently after this`,
  turnsOn: 'Turns on',
  calls: 'Calls other services',
  callNew: 'new',
  callChanged: 'changed',
  callsNote: 'Approving this approves these once, and none of them runs until you do.',
  touches: 'Installing it reads and changes nothing you have written.',
  uses: 'Once it is in, it may use',
  may: 'It may also',
  mayNote: 'Approving this approves these too. Each one is checked every time it runs.',
  usesNote: 'Only these. An add-on cannot reach a list it does not name.',
  needs: (name: string, range: string, has: string | null) => (has ? `Needs ${name} ${range}, and you have ${has}` : `Needs ${name} ${range}, which you do not have`),
  breaks: (name: string, version: string, range: string) => `${name} ${version} needs ${range} of this, which this version is not`,
  format: 'This file is written for a newer BrainDog than yours',
  orphans: (n: number) => `${n.toLocaleString('en-GB')} ${n === 1 ? 'item' : 'items'} would be left under a list it takes away`,
  conflict: (name: string, pack: string) => `${name} is already here, from ${pack}`,
  /* A CONFLICT ANOTHER UPDATE CLEARS (`update-order.ts`): the holder's update hands the thing over, so it is a step
     to take and not a dead end. */
  conflictFirst: (name: string, pack: string) => `Update ${pack} first, which hands ${name} on to this`,
  conflictAfter: (pack: string) => `goes in after ${pack}, which hands it on`,
  conflictOwn: (name: string) => `${name} is one you changed, and this version changes it too`,
  conflictReads: (name: string, reads: string) => `${name}, which you changed, reads ${reads}, which this version takes away`,
  conflictField: (name: string, field: string) => `${name} reads ${field}, which this version takes away or changes`,
} as const;

/** One line of a section: what it names, and what it says about it. */
export type Row = { text: string; detail: string | null };

export type SectionKey =
  | 'turns-on'
  | 'adds'
  | 'changes'
  | 'retires'
  | 'migrates'
  | 'moves'
  | 'kept'
  | 'stays'
  | 'extends'
  | 'page-adds'
  | 'settings'
  | 'examples'
  | 'teaches'
  | 'tools'
  | 'commands'
  | 'row-actions'
  | 'spawns'
  | 'interrupts'
  | 'worth';

/** `n` is how many things the section holds when that is more than its rows, as Adds is with its numbers folded. */
export type Section = { key: SectionKey; title: string; rows: Row[]; n?: number };

/**
 * One call out and whether it is new to this record. `line` is the kernel's own sentence for it, the one Decide says
 * (`doesOf`, kind `install`): "Sends your key 'stripe' to api.stripe.com every hour." A call the record already runs
 * unchanged is said the same way, with no mark beside it.
 *
 * WHAT THE SENTENCE IS MADE OF STAYS ON THE CALL (`host`, `every`, `trigger`, `per_day`, `grant`, as the plan names
 * them), so whoever draws it can say it again or group by host without reading the plan a second time.
 */
export type Call = {
  line: string;
  note: string | null;
  change: 'new' | 'changed' | 'same';
  host: string | null;
  every: string | null;
  trigger: 'schedule' | 'rule' | 'both';
  per_day: number | null;
  /** The key by its label, never the key. */
  grant: string | null;
  /** The fields that leave with a call a rule runs, each `<list>.<field>`, as the plan names them. */
  sends: string[];
};

/** One call of a plan as a `Call`. `fallback` is said only when the kernel has no sentence for it. */
function callOf(c: Record<string, unknown>, change: Call['change'], note: string | null, fallback: () => string, names: Parameters<typeof doesOf>[2] = {}): Call {
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
  const made = {
    host: str(c.host),
    every: str(c.every),
    trigger: (c.trigger === 'rule' || c.trigger === 'both' ? c.trigger : 'schedule') as Call['trigger'],
    per_day: typeof c.per_day === 'number' && c.per_day > 0 ? c.per_day : null,
    grant: str(c.grant) ?? str(c.key),
    /* WHAT LEAVES WITH IT. Dropped here, the sheet could not say the fields a rule's call sends, and Decide could. */
    sends: Array.isArray(c.sends) ? c.sends.filter((s): s is string => typeof s === 'string') : [],
  };
  /* THE KERNEL LEAVES OUT A CALL MARKED `same`, since on Decide it is nothing new. Here it is still drawn, so it is
     asked without the mark and reads as the same sentence. */
  return { line: doesOf('install', { calls_out: [made] }, names) || fallback(), note, change, ...made };
}

/**
 * A key the install would send that the keychain cannot give it yet. `command` is the line that puts it in, for a key
 * that is missing; a key that is there but cannot be opened by a run says the record's own sentence and no command.
 */
export type KeyStep = { label: string; name: string; hint: string | null; line: string; command: string | null };

/** A label as one shell word: bare when it is only letters, digits and `._-`, else in double quotes with `"$\`` escaped. */
export const shellWord = (label: string): string => (/^[A-Za-z0-9._-]+$/u.test(label) ? label : `"${label.replace(/["$`\\]/gu, (c) => `\\${c}`)}"`);

/** The command that puts a key in, as the CLI takes it: the value on standard input, never an argument. */
export const keyCommand = (label: string): string => `braindog keys put ${shellWord(label)}`;

/** The keys a plan says are not ready (`keys_missing`, put beside the diff from `planPack`'s `keys`), each label once. */
function keysOf(d: Body): KeyStep[] {
  return list(d.keys_missing).flatMap((k): KeyStep[] => {
    const label = text(k.label);
    if (label === '') return [];
    /* THE KEY BY THE NAME IT IS SHOWN BY ("Stripe (read only)"), and the command by the label it is kept under. */
    const name = keyName(label);
    const hint = keyHint(label);
    return k.code === 'REQUIRED_MISSING' ? [{ label, name, hint, line: words.keyMissing(name), command: keyCommand(label) }] : [{ label, name, hint, line: text(k.fix) || words.keyMissing(name), command: null }];
  });
}

/** One pack's part of the plan. A single add-on is one part; a use case is one part per pack, in the order they go in. */
export type Part = { key: string; title: string; move: string; sections: Section[]; calls: Call[] };

export type Sheet = {
  title: string;
  summary: string | null;
  /** What stops the install, from every part, drawn first and in the danger colour. Any at all disables approve. */
  stops: string[];
  /** The keys it sends that are not ready, drawn with the stops and stopping it the same way. */
  keys: KeyStep[];
  parts: Part[];
  /** Every call from every part, for the runs-a-month estimate. */
  callOuts: CallOut[];
  approve: string;
};

/** A declaration id or a pack id as a person reads it, with the id in words when `nameOf` knows nothing better. */
function namer(nameOf: (id: string) => string): (id: string) => string {
  return (id) => {
    const said = nameOf(id);
    /* AN ID WITH A CAPITAL IS STILL AN ID: a namer that knew nothing better answered `rule.subscriptions_price` as
       "Rule.subscriptions_price", and the sheet drew it. */
    /* A NAME STILL HOLDING ITS PLACEHOLDER IS NO NAME: Property's page is titled "{{name}}, property" until a property
       fills it, and the sheet's button read "Install {{name}}, property". */
    if (said !== '' && said.toLowerCase() !== id.toLowerCase() && !said.includes('{{')) return said;
    const bare = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
    return (bare.charAt(0).toUpperCase() + bare.slice(1)).replace(/[_-]/gu, ' ');
  };
}

/** A page an add-on adds to, by its name: `money` and `page.money` are both "Money". */
const pageName = (page: string, name: (id: string) => string): string => name(`page.${page.replace(/^(?:page\.)+/u, '')}`);

/** What a plan adds to other pages, a row a page: its name, and the headings of the tiles it puts there. */
function pageAddRows(adds: readonly Body[], name: (id: string) => string): Row[] {
  const by = new Map<string, { headings: string[]; n: number }>();
  for (const p of adds) {
    const page = pageName(text(p.page), name);
    const one = by.get(page) ?? { headings: [], n: 0 };
    one.n += 1;
    const heading = text(p.heading).trim();
    if (heading !== '' && !heading.includes('{{') && !one.headings.includes(heading)) one.headings.push(heading);
    by.set(page, one);
  }
  return [...by].map(([page, { headings, n }]) => row(page, words.pageAddsLine(headings.length === n ? headings : [], n)));
}

/** An id as words when nothing names it: `trial_ends` is "trial ends". */
const spacedId = (id: string): string => id.replace(/[_-]/gu, ' ');

/**
 * What a line under Adds says beside its name. A list says its fields; a page, a rule and a script say nothing more,
 * since "13 blocks", "0 actions" and "script" are the record's counting and not his.
 */
const addDetail = (id: string, summary: string): string | null => (/^(?:page|rule|script)\./u.test(id) ? null : summary || null);

const section = (key: SectionKey, title: string, rows: Row[]): Section[] => (rows.length === 0 ? [] : [{ key, title, rows }]);

/** What a plan adds: each list, page and rule by name, then its numbers as one row, and the count of every one. */
function addsSection(named: Row[], figures: number, folded = 0): Section[] {
  const rows = figures === 0 ? named : [...named, row(words.addsNumbers(figures))];
  return rows.length === 0 ? [] : [{ key: 'adds', title: words.adds, rows, n: named.length + figures + folded }];
}
const row = (t: string, detail: string | null = null): Row => ({ text: t, detail });

/** The ways a pattern's messages arrive that a person names, the words `adds.ts` `channelWord` gives. */
const WAYS: ReadonlySet<string> = new Set(['mail', 'texts', 'messages']);

/** Every pattern a plan adds, as one line: the ways they arrive when each is named by one, else "Messages sent in". */
function readsRow(named: readonly string[]): Row[] {
  if (named.length === 0) return [];
  const ways = [...new Set(named.map((n) => n.trim().toLowerCase()))];
  return [row(ways.every((w) => WAYS.has(w)) ? words.readsBy(ways) : words.readsSentIn)];
}

/**
 * WHAT A PLAN ADDS, EACH THING ONCE (audit 31 Oct f, AF23): Subscriptions' sheet listed "Keep a subscription's old price
 * when its amount changes" and "Keep a subscription's old price", the rule and the script it runs, and counted 13 where
 * its page counts 12; Calendar's listed "Events" twice, the list and its page. A script a rule of the same name runs is
 * the rule's, and a page named as a list it comes with is that list's: the first stands for both, as the page counts.
 */
function onceEach(adds: readonly Body[], name: (id: string) => string): Body[] {
  const ids = new Set(adds.map((a) => text(a.id)));
  const lists = new Set(adds.map((a) => text(a.id)).filter((id) => id.startsWith('register.')).map((id) => name(id).trim().toLowerCase()));
  return adds.filter((a) => {
    const id = text(a.id);
    if (id.startsWith('script.') && ids.has(`rule.${id.slice('script.'.length)}`)) return false;
    return !(id.startsWith('page.') && lists.has(name(id).trim().toLowerCase()));
  });
}

/**
 * The pages folded into the list of their name by `onceEach`, by that name. THEY ARE STILL COUNTED AND SAID (AL10): the
 * store's listing counted Certificates' page among the 11 things it adds and the sheet said "Adds 10", so the list's line
 * says it comes with its page, and the count keeps it.
 */
function foldedPages(adds: readonly Body[], name: (id: string) => string): Set<string> {
  const lists = new Set(adds.map((a) => text(a.id)).filter((id) => id.startsWith('register.')).map((id) => name(id).trim().toLowerCase()));
  return new Set(adds.map((a) => text(a.id)).filter((id) => id.startsWith('page.') && lists.has(name(id).trim().toLowerCase())).map((id) => name(id).trim().toLowerCase()));
}

/* THE PREDICATE NAMES ITS OWN SHAPE, AND NOT PLAIN `Body`: two guards that both narrow to the same wide type leave the
   `if (isDiff(plan)) {} else {}` below with nothing to exclude in its `else`, which TypeScript then reads as `never`
   rather than "the other shape". */
const isDiff = (v: unknown): v is Body & { pack: Record<string, unknown>; planHash: string } =>
  isMap(v) && isMap(v.pack) && typeof v.planHash === 'string';
const isShared = (v: unknown): v is Body & { usecase: Record<string, unknown>; packs: unknown[] } =>
  isMap(v) && isMap(v.usecase) && Array.isArray(v.packs);

/**
 * A field of a list by the label the record shows for it (`fieldOf('invoices', 'amount')` is "Total due"), or `null`
 * when it holds none. The plan carries no labels of its own, so whoever draws the sheet hands them in.
 */
export type FieldName = (list: string, field: string) => string | null;

/** The record's `Diff` for one pack, as one part and the lines that stop it. */
function diffPart(d: Body, name: (id: string) => string, fieldOf?: FieldName): { part: Part; stops: string[]; title: string; summary: string; direction: string; version: string; installed: string | null } {
  const pack = isMap(d.pack) ? d.pack : {};
  const id = text(pack.id);
  const version = text(pack.version);
  const installed = typeof d.installed_version === 'string' ? d.installed_version : null;
  const direction = text(d.direction) || 'install';
  const title = name(id);

  const stops: string[] = [];
  const after: Row[] = [];
  const requires = isMap(d.requires) ? d.requires : {};
  if ((isMap(requires.format) && requires.format.ok === false) || (isMap(requires.primitives) && requires.primitives.ok === false)) stops.push(words.format);
  for (const p of list(requires.packs)) if (p.ok === false) stops.push(words.needs(name(text(p.id)), text(p.range), typeof p.installed === 'string' ? p.installed : null));
  for (const p of list(d.dependents)) if (p.ok === false && p.was !== false) stops.push(words.breaks(name(text(p.id)), text(p.version), text(p.range)));
  for (const c of list(d.conflicts)) {
    const what = name(text(c.id));
    if (typeof c.reads === 'string') stops.push(words.conflictReads(what, name(c.reads)));
    else if (typeof c.field === 'string') stops.push(words.conflictField(what, c.field));
    else if (c.changed === true || text(c.pack) === '(this record)') stops.push(words.conflictOwn(what));
    /* THE HOLDER'S OWN UPDATE HANDS IT OVER (`update-order.ts` `marked`). In the same run it lands before this one is
       planned again, so it is said under Worth knowing and stops nothing; outside the run it is the step to take. */
    else if (c.waits === 'after') after.push(row(what, words.conflictAfter(name(text(c.pack)))));
    else if (c.waits === 'first') stops.push(words.conflictFirst(what, name(text(c.pack))));
    else stops.push(words.conflict(what, name(text(c.pack))));
  }
  /* A LIST TAKEN AWAY WHILE IT HOLDS ROWS IS A STEP SHOWN, NOT A STOP (`Diff.removals`, "Your 41 items stay"): Install
     on this plan presses `retireWithRows`, so the orphans it counts no longer stop it. */
  const removals = list(d.removals);
  if (count(d.orphans) > 0 && removals.length === 0) stops.push(words.orphans(count(d.orphans)));
  /* AN UNRESOLVED PAGE ADD IS THE PAGE THAT IS MISSING: `page_adds` carries `unresolved` only beside a
     `refusal`, whose sentence already names the page and the pack, so it is shown as a stop rather than dropped
     silently the way the resolved ones below are drawn. */
  for (const p of list(d.page_adds)) if (p.unresolved === true && isMap(p.refusal)) stops.push(words.pageMissing(pageName(text(p.page), name)));

  const retires = list(d.retires);
  const seeds = isMap(d.seeds) ? d.seeds : {};
  const seedRows = list(seeds.registers).filter((r) => count(r.rows) > 0);
  const worth = [
    ...after,
    ...list(d.retypes).map((r) => row(name(text(r.id)), words.retype(text(r.field), text(r.from), text(r.to), count(r.rows)))),
    ...list(d.newly_required).map((r) => row(name(text(r.id)), words.required(text(r.field), count(r.rows)))),
    ...list(d.renames).map((r) => row(words.renamed(name(text(r.from)), name(text(r.to))))),
    ...list(d.misreads).map((r) => row(name(text(r.id)), words.misread(name(text(r.reader)), text(r.where)))),
    /* A LIST THIS PLAN ADDS ARRIVES EMPTY, AS EVERY NEW LIST DOES, so that warning is said only of a list already here. */
    ...list(d.warnings)
      .filter((w) => !(/arrives empty/u.test(text(w.say)) && list(d.adds).some((a) => text(a.id) === text(w.at))))
      .map((w) => row(text(w.say))),
    ...removals.map((r) => row(name(`register.${text(r.retire)}`), text(r.line))),
  ];

  const folded = foldedPages(list(d.adds), name);
  const part: Part = {
    key: id,
    title,
    move: installed && installed !== version ? words.updateAvailable : '',
    sections: [
      ...addsSection(
        [
          ...onceEach(list(d.adds).filter((a) => !text(a.id).startsWith('metric.') && !text(a.id).startsWith('ingest.')), name).map((a) => {
            const detail = a.handed === true ? words.handed : addDetail(text(a.id), text(a.summary));
            const paged = text(a.id).startsWith('register.') && folded.has(name(text(a.id)).trim().toLowerCase());
            return row(name(text(a.id)), paged ? words.withPage(detail) : detail);
          }),
          /* WHAT IT READS, ONE LINE FOR EVERY PATTERN (audit 31 Oct h, AH11): Card alerts' four were "Ingest.bank card out,
             ingest" each. A pattern the namer knows by how it arrives ("mail", "texts") says that way. */
          ...readsRow(list(d.adds).filter((a) => text(a.id).startsWith('ingest.')).map((a) => name(text(a.id)))),
        ],
        list(d.adds).filter((a) => text(a.id).startsWith('metric.')).length,
        folded.size,
      ),
      ...section('changes', words.changes, list(d.changes).map((c) => row(name(text(c.id)), text(c.summary) || null))),
      ...section('migrates', words.migrates, isMap(d.migrates) ? [row(text(d.migrates.says), words.migratesLine(text(d.migrates.from), text(d.migrates.to)))] : []),
      ...section('retires', words.retires, retires.filter((r) => typeof r.to !== 'string').map((r) => row(name(text(r.id)), words.keepsRows(count(r.rows))))),
      ...section('moves', words.moves, retires.filter((r) => typeof r.to === 'string').map((r) => row(name(text(r.id)), words.movesTo(name(text(r.to)))))),
      ...section('kept', words.kept, list(d.kept).map((k) => {
        const adds = strings(k.adds);
        return row(name(text(k.id)), adds.length > 0 ? words.keptAdds(adds) : typeof k.rebased === 'string' ? words.keptRebased : words.keptOwn);
      })),
      ...section('stays', words.stays, list(d.stays).map((s) => row(name(text(s.id)), words.staysLine(strings(s.values), count(s.rows))))),
      ...section('extends', words.extends, list(d.extends).filter((e) => !isMap(e.refusal)).map((e) => {
        const listId = text(e.id).replace(/^register\./u, '');
        /* EACH FIELD BY ITS LABEL, "Free trial ends", never `trial_ends`. */
        return row(name(text(e.id)), words.extendsLine(strings(e.adds).map((f) => fieldOf?.(listId, f)?.trim() || spacedId(f))));
      })),
      ...section('page-adds', words.pageAdds, pageAddRows(list(d.page_adds).filter((p) => !isMap(p.refusal)), name)),
      ...section('settings', words.settings, list(d.config).map((c) => {
        const raw = typeof c.value === 'string' || typeof c.value === 'number' || typeof c.value === 'boolean' ? String(c.value) : JSON.stringify(c.value ?? null);
        const value = text(c.key) === 'grant' ? keyName(raw) : raw;
        return row(name(`config.${text(c.key)}`), c.from === 'kept' || c.from === 'given' ? words.settingKept(value) : c.from === 'default' ? words.settingDefault(value) : words.settingNone);
      })),
      ...section('examples', words.examples, count(seeds.count) === 0 ? [] : [row(words.examplesLine(count(seeds.count)), seedRows.map((r) => `${name(`register.${text(r.register)}`)} ${words.examplesIn(count(r.rows))}`).join(', ') || null)]),
      ...section('teaches', words.skills, list(d.skills).map((s) => row(text(s.name).replace(/-/gu, ' '), words.skillLine(text(s.trigger), text(s.what))))),
      ...section('tools', words.tools, list(d.tools).map((t) => row(text(t.name).replace(/[-_]/gu, ' '), words.toolLine(text(t.says), t.writes === true)))),
      ...section('commands', words.commandsAdded, list(d.commands).map((c) => row(text(c.title)))),
      ...section('row-actions', words.rowActions, list(d.row_actions).map((a) => row(text(a.title), words.rowActionOn(name(text(a.list)))))),
      ...section('spawns', words.spawns, list(d.spawns).map((s) => row(name(`rule.${text(s.rule)}`), words.spawnLine(name(`register.${text(s.register)}`), count(s.bound), text(s.when))))),
      ...section('interrupts', words.interrupts, strings(d.interrupts).map((r) => row(name(`rule.${r}`)))),
      ...section('worth', words.worth, worth),
    ],
    calls: list(d.calls_out).map((c) =>
      callOf(c, c.change === 'changed' ? 'changed' : c.change === 'same' ? 'same' : 'new', typeof c.key_line === 'string' && c.key_line !== '' ? c.key_line : null, () => callsOutOf([c]).map(callLine)[0] || text(c.line) || text(c.ingest), {
        list: (id) => name(`register.${id}`),
        /* A FIELD BY ITS LABEL, as Decide says it. An empty label is no label, and the kernel then reads the id as words. */
        field: (id, field) => fieldOf?.(id, field)?.trim() || null,
      }),
    ),
  };
  return { part, stops, title, summary: text(pack.summary), direction, version, installed };
}

/** A use case's pack-by-pack plan (`SharedPlan`), a part per pack, the modules first as the record plans them. */
function sharedParts(plan: Body, name: (id: string) => string): { parts: Part[]; stops: string[] } {
  const enable = strings(plan.enable);
  const turnsOn: Part[] =
    enable.length === 0 ? [] : [{ key: 'turns-on', title: words.turnsOn, move: '', sections: section('turns-on', words.turnsOn, enable.map((id) => row(name(id)))), calls: [] }];
  const stops: string[] = [];
  const parts = list(plan.packs).map((p): Part => {
    stops.push(...strings(p.conflicts));
    const version = text(p.version);
    const installed = typeof p.installedVersion === 'string' ? p.installedVersion : null;
    const named = (items: unknown): Row[] => list(items).filter((a) => a.kind !== 'figure').map((a) => row(text(a.name)));
    const examples = count(p.examples);
    return {
      key: text(p.id),
      title: text(p.title) || name(text(p.id)),
      move: installed && installed !== version ? words.updateAvailable : '',
      sections: [
        ...addsSection(named(p.adds), list(p.adds).filter((a) => a.kind === 'figure').length),
        ...section('changes', words.changes, strings(p.changes).map((c) => row(c))),
        ...section('retires', words.retires, strings(p.retires).map((c) => row(c))),
        ...section('moves', words.moves, list(p.hands).map((h) => row(text(h.name), words.movesTo(text(h.to))))),
        ...section('examples', words.examples, examples === 0 ? [] : [row(words.examplesLine(examples))]),
      ],
      calls: (Array.isArray(p.calls) ? (p.calls as CallOut[]) : []).map((c) =>
        callOf({ host: c.host, every: c.every, grant: c.key, trigger: c.trigger ?? 'schedule', per_day: c.perDay ?? null }, 'new', c.note ?? null, () => callLine(c)),
      ),
    };
  });
  return { parts: [...turnsOn, ...parts], stops };
}

/** The calls a plan carries, as `CallOut`s, for the estimate under the lines. */
function callOutsOf(one: Body): CallOut[] {
  if (isDiff(one)) return callsOutOf(one.calls_out);
  return list(one.packs).flatMap((p) => (Array.isArray(p.calls) ? (p.calls as CallOut[]) : []));
}

/**
 * The sheet for a plan, several plans, or `null` for an answer this build does not recognise. `nameOf` names a
 * declaration id (`register.money`, `page.home`) or a pack id as the reader knows it. `fieldOf` names a field of a list
 * by its label, for the sentence that says what leaves with a call; without it a field is its id read as words.
 */
export function sheetOf(diff: unknown, nameOf: (id: string) => string, fieldOf?: FieldName): Sheet | null {
  const name = namer(nameOf);
  const plans = (Array.isArray(diff) ? diff : [diff]).filter((d): d is Body => isDiff(d) || isShared(d));
  if (plans.length === 0 || (Array.isArray(diff) && plans.length !== diff.length)) return null;

  const stops: string[] = [];
  const keys: KeyStep[] = [];
  const parts: Part[] = [];
  const heads: { title: string; summary: string; direction: string; version: string }[] = [];
  for (const plan of plans) {
    for (const k of keysOf(plan)) if (!keys.some((h) => h.label === k.label)) keys.push(k);
    if (isDiff(plan)) {
      const one = diffPart(plan, name, fieldOf);
      stops.push(...one.stops);
      parts.push(one.part);
      heads.push({ title: one.title, summary: one.summary, direction: one.direction, version: one.version });
    } else {
      const shared = sharedParts(plan, name);
      stops.push(...shared.stops);
      parts.push(...shared.parts);
      const u = isMap(plan.usecase) ? plan.usecase : {};
      const own = list(plan.packs).find((p) => p.role === 'usecase');
      const updating = own !== undefined && typeof own.installedVersion === 'string';
      heads.push({ title: text(u.title), summary: text(u.summary), direction: updating ? 'upgrade' : 'install', version: text(u.version) });
    }
  }

  const head = heads[0];
  if (plans.length > 1 || !head) {
    return { title: words.updateAllTitle(plans.length), summary: null, stops, keys, parts, callOuts: plans.flatMap(callOutsOf), approve: words.updateAll(plans.length) };
  }
  const approve =
    head.direction === 'upgrade'
      ? words.update(head.title)
      : head.direction === 'downgrade'
        ? words.downgrade(head.title)
        : head.direction === 'reinstall'
          ? words.reinstall(head.title)
          : words.install(head.title);
  return { title: head.title || approve, summary: head.summary || null, stops, keys, parts, callOuts: plans.flatMap(callOutsOf), approve };
}
