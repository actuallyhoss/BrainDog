/**
 * WHY A RUN FAILED, IN A PERSON'S WORDS (L46, 1 Nov). The kernel writes a run's reason for the record and for an agent
 * reading it: "rule.entry-takes-book starts script.book_from_account at step 1, and rules have started
 * script.book_from_account 100 times today, the most a day. Nothing was queued, …". A person reading Automations wants
 * "Its script, Book from account, hit its 100 runs a day. It starts again tomorrow."
 *
 * ONLY THE SHAPES THE KERNEL WRITES (`packages/kernel/src/flow.ts`, the rule steps) are said again; anything else is
 * kept in its own words with the machine names (`rule.x`, `script.y`) read as names. The raw words stay one press away
 * where this is drawn, so nothing the record said is lost. PURE, so it loads in plain Node.
 */

import { humanize } from '../record/names.ts';

/* THE SCRIPTS' DECLARED TITLES, as `learnScripts` (flow.ts) hears them, so a reason names a script as its step does. */
const TITLES = new Map<string, string>();

/** Learn scripts' titles by id; `learnScripts` in flow.ts hands every list it hears on. */
export function learnTitles(rows: readonly { script: string; title: string }[]): void {
  for (const r of rows) if (r.title.trim() !== '') TITLES.set(r.script, r.title);
}

/** A script's or rule's id as a person reads it: its declared title, else "book_from_account" → "Book from account". */
const named = (id: string): string => {
  const bare = id.replace(/^(?:rule|script)\./u, '');
  return TITLES.get(bare) ?? humanize(bare);
};

type Shape = { re: RegExp; say: (m: RegExpMatchArray, its: (id: string) => string) => string };

/* ORDER MATTERS ONLY WHERE TWO COULD MATCH: the more particular shape first. */
const SHAPES: readonly Shape[] = [
  {
    re: /starts script\.([\w-]+) at step \d+, and rules have started script\.[\w-]+ (\d+) times today, the most a day/u,
    say: (m, its) => `${its(m[1]!)} hit its ${m[2]} runs a day. It starts again tomorrow.`,
  },
  {
    re: /starts script\.([\w-]+) at step \d+, and script\.[\w-]+ is paused/u,
    say: (m, its) => `${its(m[1]!)} is paused. Resume it and new rows are reached again.`,
  },
  {
    re: /starts a script at step \d+, and there is no script called (.+?) here\./u,
    say: (m) => `The script it starts, ${m[1] === '(no name)' ? 'with no name' : named(m[1]!)}, is not here any more.`,
  },
  {
    re: /starts script\.([\w-]+) at step \d+, and script\.[\w-]+ does not say runs: \{ rule: true \}/u,
    say: (m, its) => `${its(m[1]!)} is not one a rule may start.`,
  },
  {
    re: /step acts on .+?, which was deleted, and a step does not write to a deleted row/u,
    say: () => 'The row it acts on was deleted first.',
  },
  {
    re: /step acts on a row, and this run has none to act on/u,
    say: () => 'It had no row to act on.',
  },
  {
    re: /which holds what a secret or file field holds/u,
    say: () => 'It would have handed on a secret, so it stopped there.',
  },
  {
    re: /reached a meet step, and this host wired no way to meet a person/u,
    say: () => 'This BrainDog cannot meet people from a rule.',
  },
  {
    re: /reached a run_job step, and this host wired no way to queue a job/u,
    say: () => 'This BrainDog cannot start jobs from a rule.',
  },
  {
    re: /'s meet at step \d+ met nobody: (.+)$/u,
    say: (m) => `It met nobody: ${tidy(m[1]!)}`,
  },
  {
    re: /could not start (.+?) at step \d+: (.+?)(?: Nothing was queued.*)?$/u,
    say: (m) => `It could not start ${named(m[1]!)}: ${tidy(m[2]!)}`,
  },
  {
    re: /could not ask its question at step \d+: (.+)$/u,
    say: (m) => `It could not ask its question: ${tidy(m[1]!)}`,
  },
  {
    re: /puts its question at step \d+ to one member, and nobody .+ is a member now/u,
    say: () => 'The person it asks is not a member any more.',
  },
];

/** Machine names inside any other sentence, read as names: "rule.x's" → "Its", "script.book_from_account" → "Book from account". */
function tidy(say: string): string {
  return say
    .replace(/^rule\.[\w-]+'s /u, 'Its ')
    .replace(/^rule\.[\w-]+ /u, 'It ')
    .replace(/\brule\.[\w-]+'s /gu, 'its ')
    .replace(/\bscript\.([\w-]+)/gu, (_, id: string) => named(id))
    .replace(/\brule\.([\w-]+)/gu, (_, id: string) => named(id))
    .replace(/\s*\((?:NOT_IN_THIS_BUILD|[A-Z_]{6,})\)/gu, '')
    .trim();
}

/**
 * The reason a run failed, said plainly; `null` when there was none. `plain` differs from `raw` only when it was
 * re-said, so a caller draws "As written" only then.
 */
export function plainFail(say: string | null | undefined, own = ''): { plain: string; raw: string } | null {
  const raw = say?.trim() ?? '';
  if (raw === '') return null;
  /* "ITS SCRIPT", NOT ITS NAME AGAIN, when the script is called what the automation is ("Find what a payment paid"). */
  const its = (id: string): string => {
    const name = named(id);
    return name.trim().toLowerCase() === own.trim().toLowerCase() ? 'Its script' : `Its script, ${name},`;
  };
  for (const s of SHAPES) {
    const m = raw.match(s.re);
    if (m) return { plain: s.say(m, its), raw };
  }
  return { plain: tidy(raw), raw };
}

/** Just the words, for a sentence that carries the reason inline. */
export function plainSay(say: string | null | undefined, own = ''): string {
  return plainFail(say, own)?.plain ?? '';
}
