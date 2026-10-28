/**
 * KEYCHAIN ACCESS ON THE KEYCHAIN SCREEN, with no runes and no DOM: which asks are waiting, how an ask is said, and how a
 * key's rules map to the choices its access sheet draws. The server's rules are `always`, `ask` and `deny`, per machine
 * handle or `*` for every machine; no rule at all means always.
 */

export type Rule = 'always' | 'ask' | 'deny';

/** The machine the key's default is kept under. */
export const EVERY_MACHINE = '*';

export type KeyAsk = {
  id: string;
  credential: string;
  label: string | null;
  machine: string;
  machine_name: string | null;
  run: string | null;
  status: string;
  asked_at: string;
  expires: string;
};

export type KeyRule = { credential: string; machine: string; machine_name: string | null; rule: Rule };

export const accessWords = {
  askTitle: 'Keychain access',
  allowOnce: 'Allow once',
  allowAlways: 'Always allow',
  deny: 'Deny',
  always: 'Always',
  ask: 'Ask each time',
  denied: 'Deny',
  alwaysDefault: 'Always (default)',
  sheetTitle: (label: string) => `Keychain access: ${label}`,
  sheetHint: 'Which machines may open this key. A machine with no rule follows the key’s default.',
  everyMachine: 'Every machine (default)',
  noMachines: 'No machine has keychain access yet.',
  access: 'Keychain access',
  lockAfter: 'Lock after',
  minutes: (n: number) => `${n} min`,
  answered: 'That ask was already answered.',
  answerRefused: 'The record did not take that answer. Try again.',
  accessRefused: 'Keychain access could not be changed. Try again.',
  close: 'Done',
  followDefault: (rule: Rule) => `Key default: ${ruleName(rule)}`,
  unnamed: 'A machine',
} as const;

export const ruleName = (r: Rule): string => (r === 'always' ? accessWords.always : r === 'ask' ? accessWords.ask : accessWords.denied);

/** The asks still waiting at `now`, soonest to run out first. An ask past its time is not offered: the server would refuse it. */
export function waitingAsks(asks: readonly KeyAsk[], now: number): KeyAsk[] {
  return asks
    .filter((a) => a.status === 'pending' && Date.parse(a.expires) > now)
    .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires));
}

/** "<agent or machine> wants to use <key>": the machine's name, else its run, else "A machine". */
export function askLine(a: Pick<KeyAsk, 'label' | 'credential' | 'machine_name' | 'run'>): string {
  const who = a.machine_name ?? a.run ?? accessWords.unnamed;
  return `${who} wants to use ${a.label ?? a.credential}`;
}

/** The run an ask came from, said beside the line when the machine is what named it. */
export const askRun = (a: Pick<KeyAsk, 'machine_name' | 'run'>): string | null => (a.machine_name && a.run ? a.run : null);

/** What `?ask=` points at: the ask itself, and whether it is still waiting. `null` when the list holds no such ask. */
export function focusOf(asks: readonly KeyAsk[], id: string | null, now: number): { ask: KeyAsk; waiting: boolean } | null {
  if (!id) return null;
  const ask = asks.find((a) => a.id === id);
  return ask ? { ask, waiting: waitingAsks([ask], now).length === 1 } : null;
}

/** The value a choice in the sheet carries: a rule, or `default` for a machine with none. */
export type Choice = Rule | 'default';

export const choiceOf = (rule: Rule | null): Choice => rule ?? 'default';
/** The rule to send for a choice: `null` takes the machine's rule away. */
export const ruleOfChoice = (c: Choice): Rule | null => (c === 'default' ? null : c);

export type AccessLine = { machine: string; name: string; choice: Choice; effective: Rule };
export type AccessSheetModel = { fallback: Rule | null; fallbackChoice: Choice; lines: AccessLine[] };

/**
 * The sheet's rows: the key's default (machine `*`) and one line per machine that holds keychain access, each with its own
 * rule or none. A machine with no rule follows the default, and with no default it is always.
 */
export function sheetOf(machines: readonly { handle: string; label: string | null }[], rules: readonly KeyRule[]): AccessSheetModel {
  const by = new Map(rules.map((r) => [r.machine, r.rule]));
  const fallback = by.get(EVERY_MACHINE) ?? null;
  const known = new Set(machines.map((m) => m.handle));
  const lines: AccessLine[] = machines.map((m) => {
    const own = by.get(m.handle) ?? null;
    return { machine: m.handle, name: m.label ?? accessWords.unnamed, choice: choiceOf(own), effective: own ?? fallback ?? 'always' };
  });
  /* A rule for a machine signed out since is still a rule: it is drawn, so it can be taken away. */
  for (const r of rules) {
    if (r.machine === EVERY_MACHINE || known.has(r.machine)) continue;
    lines.push({ machine: r.machine, name: r.machine_name ?? accessWords.unnamed, choice: r.rule, effective: r.rule });
  }
  return { fallback, fallbackChoice: choiceOf(fallback), lines };
}

/** What a machine's "default" choice is called: the rule it would follow. */
export const defaultName = (fallback: Rule | null): string => (fallback ? accessWords.followDefault(fallback) : accessWords.alwaysDefault);
