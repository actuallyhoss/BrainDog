/**
 * THE FIRST RUN'S OWN WORDS, and the one rule of the old first-row form that `RowForm` still reads.
 *
 * IT IS SPLIT OUT OF `copy.ts` FOR THE ENTRY CHUNK'S SAKE. `copy.ts` is imported by the shell, so everything in it lands
 * in the chunk every screen waits for, and these sentences are read by one screen a person sees once. The `dead-copy`
 * gate reads this object as it reads `copy`: every key here is read, as `firstRun.<key>`, by a file the app ships.
 *
 * ONE PROMPT AND ONE ACCEPT. The two turns, the use-case card worded as a manifest
 * ("Builds on", "Lists:", "Pages:", "In a voice that is"), the five one-row tiles and screen two's panel went with the
 * screen they belonged to. What is left says what was heard and what the BrainDog will be, in words a person says.
 *
 * AND TWO RULES OF THE SIGN-UP'S "WHAT I HEARD" (use case 6, step 2), which hold no sentence: where the words heard sit
 * in what was typed (`litIn`), and a reading with the person's own changes laid over it (`amend`).
 */

/** "A, B and C": a list said as a person says it. */
const andOf = (items: readonly string[]): string =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/**
 * THE FIVE STARTING POINTS OF USE CASE 6: a shop, a freelancer, a student, a founder of a few
 * companies and a team, as a person would say each. No screen draws them any more (the chips under the prompt were a
 * chip cloud); the reading is still held to understand each one, so they are the
 * reading's fixtures and not the screen's words.
 */
export const STARTING_POINTS = ['I run a small shop', 'I freelance', "I'm a student", 'I run a few companies', "I'm part of a team"] as const;

export const firstRun = {
  /* THE PROMPT. A question and one field, with one example of an answer in it (first F6). */
  whoQuestion: 'Who are you?',
  whoPlaceholder: "I'm Mariam. I run a candle shop and want to keep track of orders, stock and what I owe suppliers.",
  /* WHERE SIMPLE RULES READ IT BECAUSE THE MONTH'S ASKS ARE SPENT, said once, quietly, so a thin reading is explained. */
  readByRules: "Slash's questions are used for this month, so simple rules read this. Check what was heard, and tell it more.",
  /* WHERE SIMPLE RULES READ IT FOR ANY OTHER CAUSE: no model on this host, no press yet, a refusal or a silence. Said on
     the build beside the words, so a thin reading is never taken for the most this can do. */
  readByRulesAny: 'Simple rules read this. Check what was heard, and tell it more.',
  /* BEFORE THE PRESS, UNDER THE FIELD: what the press does with the words, and never who reads them. It said "a model
     reads what you wrote" on a host where no model does, above "Simple rules read this":
     which reads them is said after, by what read them. That nothing is kept yet is said once, in the promises under it. */
  readOnPress: "Pressing That's me sets this up from what you wrote.",

  /* POINT AT AN EXPORT: a file from another app, read on this device and shown before anything is saved. */
  exportPoint: 'Or bring in a file',
  exportHint: 'A CSV, JSON or zip export from your bank, Notion, Trello, Todoist or a spreadsheet.',
  exportDrop: 'Drop it here',
  exportReading: 'Reading your file',
  exportInto: (n: number, name: string) => `${n === 1 ? 'One goes' : `${n} go`} into ${name}.`,
  exportOwn: (name: string) => `It becomes ${name}, with a page to read it on.`,
  exportColumns: 'Where each column goes',
  exportRest: (more: number, unused: number) =>
    [more > 0 ? `${more} more ${more === 1 ? 'column goes' : 'columns go'} in too` : '', unused > 0 ? `${unused} ${unused === 1 ? 'column is' : 'columns are'} left in the file` : '']
      .filter((x) => x !== '')
      .join(', and ') + '.',
  exportHeld: (n: number) => `${n === 1 ? 'One waits' : `${n} wait`} on the currency, or do not fit.`,
  exportMore: (kept: number, more: number) => `The first ${kept} come in; ${more} more stay in the file.`,
  exportLeave: 'Leave it out',
  exportNoEntries: 'Nothing in that file reads as a table. Try its CSV or JSON export.',
  exportNotJson: 'That file is not JSON this can read.',
  exportTooBig: 'That file is over 10 MB. Export a shorter stretch of it.',
  /* THE ONE PRESS: the question a list of the file's own is filed under, and what could not come in. */
  importAsk: (name: string) => `Keep ${name}, brought in from a file?`,
  importNotMade: (name: string) => `${name} could not be brought in.`,
  importMissed: (n: number, total: number, name: string) => `${n} of ${total} from your file did not go into ${name}.`,

  /* THE SENTENCE ONCE IT IS READ, drawn as one line a press opens again for editing. */
  whoEdit: 'Edit what you said',
  heardName: (name: string) => `You are ${name}.`,
  /* An amount typed with no currency is said back, so the person sees why it is not in the entry (`shape.ts`). */
  shapeNoCurrency: 'no currency, so not kept',
  /* A thing a shop does on a day, such as kiln firings, said as the orders it keeps by the day each is due. */
  heardByDay: (orders: string) => `${orders}, by the day each is due`,
  /* A SHOP'S OWN NAME IS THE BRAINDOG'S, never a project in it (PK3). */
  heardBusiness: "Your BrainDog's name",
  /* A title the record keeps, built only from what was typed: the cadence and the client's name (`shape.ts`). */
  shapeInvoice: (cadence: string | null, client: string | null) =>
    `${cadence ? `${cadence.charAt(0).toUpperCase()}${cadence.slice(1)} invoice` : 'Invoice'}${client ? ` to ${client}` : ''}`,
  and: andOf,

  /* WHAT THE BRAINDOG WILL BE, before anything is written: its pages, its Home, what it keeps and the first entries. */
  mineTitle: 'Your BrainDog',
  mineFor: 'Make it for',
  minePages: 'Its pages',
  mineHome: 'Its Today',
  mineEntries: 'From what you said',
  keepSwitch: (name: string) => `Keep ${name}`,
  /* A MODULE THE USE CASE STANDS ON stays on while that use case is chosen, and says why. */
  keepNeeded: (title: string) => `${title} needs it.`,

  /* THE CURRENCY, asked only when Money is kept and the sentence typed none. */
  currencyQuestion: 'Which currency do you use?',
  currencyFind: 'Find a currency',
  currencyNone: 'No currency matches that.',
  currencyFirst: 'Choose the currency your money is in, and Money is made in it.',

  /* THE REMINDER, offered where what it keeps has due dates and the host can ring this device (Web Push): a laptop as much as a phone. */
  remindOn: 'Remind me on this device',
  remindWhy: 'What falls due can ring here, once you say yes.',
  remindIsOn: 'This device will be reminded.',

  /* THE ONE ACCEPT. Everything is written in this press, and nothing before it. */
  makeIt: 'Make it mine',
  makingIt: 'Making it',
  makeSomething: 'Turn on one thing to keep first.',
  /* WHAT COULD NOT BE MADE, in the person's words; the record's own sentence stays under Details. */
  /* A TITLE, SO NO FULL STOP: it heads the list of what was refused. */
  notAllMade: 'Some of it could not be made',
  notAdded: (name: string) => `${name} was not added.`,
  notMade: (title: string) => `${title} was not made.`,
  notMet: (name: string) => `${name} was not added to People.`,
  notSet: 'The currency was not set.',
  whyDetails: 'Details',
  openHome: 'Open my BrainDog',

  /**
   * The agent: Claude Code, by its maker's mark, with the one command that connects it. What it sees is the record's
   * own lists by their own names (`made.ts` `agentThings`): "It sees your orders and clients" on a shop, as the vision
   * says it (use case 6, step 6), and the house words below only where a list is named by its id alone.
   */
  /* CLAUDE, THE APP, AND NOT CLAUDE CODE (first-hour audit E22): a bakery was offered a terminal tool "that sees your
     projects". The connect sheet still holds every other way in, Claude Code among them. */
  agentName: 'Claude',
  agentFinds: (things: readonly string[]) =>
    things.length === 0
      ? 'Ask it about what you keep here, from the Claude app.'
      : `Ask it about your ${andOf(things)}, from the Claude app.`,
  agentProjects: 'projects',
  /* THE HOUSE WORDS SAY WHAT A LIST HOLDS, never a list's id, so a list named by its id alone reads in words. */
  agentPeople: 'the people you work with',
  agentTasks: 'what is on your plate',
  /** The source: the one that fits what this BrainDog keeps. */
  /* THE BANK'S TEXTS, as the vision names them and Today's next steps say them (`WantMore`): forwarded, they fill Money. */
  sourceBank: "Your bank's texts",
  sourceBankFinds: 'Forward them here, and Money fills itself with what you spent and what falls due.',
  sourceMail: 'Your mail',
  sourceMailFinds: 'Forward a mail here, and it would find who wrote and what they are waiting on.',
  sourceFile: 'A file from another app',
  sourceFileFinds: 'A CSV or JSON export, and it would find where each of its entries goes.',
  sourceGo: 'Set it up',
  sourceFileGo: 'Bring in a file',

  /**
   * SIGNED IN AND ON NO RECORD: the way in is to say who you are on `/signup`, and a paid name is the quieter way
   * beside it, never the lead ("Free leads").
   */
  noRecordWhy: 'Say who you are and it builds one, free.',
  noRecordDescribe: 'Tell it who you are',
  noRecordPaid: 'Or name one on a paid plan',

  /**
   * AND `/start` OPENED AGAIN ON A RECORD THAT IS ALREADY MADE SAYS SO, AND OFFERS THE WAY BACK.
   *
   * The root layout sends a record with no lists here and spares `/start` from that redirect, which is what makes this
   * the one screen somebody can reach with the record already behind it. Answering again installs; it deletes nothing
   * and changes no entry, so saying so is what lets somebody who came here on purpose carry on.
   */
  againMade: 'This BrainDog is set up.',
  againMore: 'Answering again only adds to it.',
  againBack: 'Open it',
} as const;

/**
 * Which fields a first-row form asks for: the title, and every field the list requires that the caller has not already
 * answered. `RowForm`'s `first` mode reads it; it sits here beside the words it was written for, holding no sentence.
 */
export function firstAsks<F extends { id: string; required?: boolean }>(fields: readonly F[], title: string | undefined, given: Readonly<Record<string, string>> = {}): F[] {
  return fields.filter((f) => f.id === title || (f.required === true && given[f.id] === undefined));
}

/* ── what was heard, lit and changed by hand ───────────────────────────── */

/** Start and end of a phrase in the sentence as typed (`who.ts` `Span`), said here so this file imports nothing. */
type At = readonly [number, number];
/** A line heard, as much of it as these two read (`HeardLine`, `lib/start/propose.ts`). */
type Line = { phrase: string; became: string; at?: At; you?: true; loose?: true; more?: readonly At[] };

/** A run of the sentence as typed: plain, or words that were heard, with what they became. */
export type Lit = { text: string; became: string | null };

/**
 * THE SENTENCE CUT AT THE VERY WORDS HEARD, by where each line says it sits (`at`), never by looking for the phrase
 * again, so "orders" lights the "orders" she typed and not the first one in a word before it. Runs cover the whole
 * sentence in order; a line with no place, one past the end, one over a run already lit, or one whose words are no
 * longer there (the reading is a beat behind the typing) is left plain. A phrase folded into a line and said apart
 * (`more`) lights as what the line became, while the line's own words are still where it says.
 */
export function litIn(sentence: string, heard: readonly Line[]): Lit[] {
  const out: Lit[] = [];
  let from = 0;
  const one = (s: string): string => s.replace(/\s+/gu, ' ').toLowerCase();
  const held = (h: Line): boolean => h.at !== undefined && h.at[1] <= sentence.length && one(sentence.slice(h.at[0], h.at[1])) === one(h.phrase);
  const spans = heard
    .flatMap((h) => [
      ...(h.at === undefined ? [] : [{ at: h.at, phrase: h.phrase, became: h.became }]),
      ...(held(h) ? (h.more ?? []).map((at) => ({ at, phrase: sentence.slice(at[0], at[1]), became: h.became })) : []),
    ])
    .sort((a, b) => a.at[0] - b.at[0]);
  for (const { at, phrase, became } of spans) {
    const [start, end] = at;
    if (start < from || end <= start || end > sentence.length || one(sentence.slice(start, end)) !== one(phrase)) continue;
    if (start > from) out.push({ text: sentence.slice(from, start), became: null });
    out.push({ text: sentence.slice(start, end), became });
    from = end;
  }
  if (from < sentence.length) out.push({ text: sentence.slice(from), became: null });
  return out;
}

/**
 * WHAT THE PERSON CHANGED IN "WHAT I HEARD", by the phrase they tapped: `out` are the phrases taken out, `to` turns a
 * phrase into another part (by pack id), and `name` is the name changed (`null`, taken out). Kept beside the sentence
 * and laid over every reading of it, so the build makes what the screen showed.
 */
/**
 * `on` and `off` ARE PARTS TURNED ON OR TAKEN OUT IN THE CONVERSATION (1 Nov): an answer about money keeps Money, and a
 * part taken out on the build is off whatever the words said. Absent on what was kept before there was a conversation.
 */
export type Amend = { out: readonly string[]; to: Readonly<Record<string, string>>; name?: string | null; on?: readonly string[]; off?: readonly string[] };
export const NO_AMEND: Amend = { out: [], to: {} };

/** The parts a line became: "People and Money" is People and Money. */
const partsOf = (became: string): string[] => became.split(/,\s*|\s+and\s+/u).map((w) => w.trim());

/**
 * A READING WITH THE PERSON'S CHANGES LAID OVER IT. A phrase taken out takes the parts it alone turned on with it, and
 * the use case (`caseTitle`, or one of its lists) where no line left says it; a phrase turned into another part says that part and brings
 * it. The caller closes the parts over what they stand on and says the places again (`closeOver`, `placesOf`): this
 * file imports nothing, because the reader imports it.
 */
export function amend<P extends { name: string | null; usecase: string | null; modules: string[]; heard: Line[]; title: string | null; places: readonly { kind: string; id: string; name: string; phrase: string | null }[] }>(
  p: P,
  a: Amend,
  ctx: { nameOf: (pack: string) => string; caseTitle: string | null },
): P {
  const touched = (h: Line): boolean => h.you !== true && (a.out.includes(h.phrase) || a.to[h.phrase] !== undefined);
  const was = p.heard.filter(touched);
  const kept = p.heard.filter((h) => !touched(h) && !(h.you === true && a.name === null));
  const says = (h: Line, id: string, name: string): boolean => partsOf(h.became).some((w) => w === name || w === ctx.nameOf(id));
  const dropped = new Set(
    p.places
      .filter((x) => x.kind === 'module' && was.some((h) => says(h, x.id, x.name)) && !kept.some((h) => says(h, x.id, x.name) || h.phrase === x.phrase))
      .map((x) => x.id),
  );
  const moved = was.flatMap((h) => {
    const to = a.out.includes(h.phrase) ? undefined : a.to[h.phrase];
    return to === undefined ? [] : [{ line: { ...h, became: ctx.nameOf(to) }, to }];
  });
  /* THE USE CASE IS SAID BY ITS TITLE, OR BY ITS OWN LISTS: a phrase given to a shop reads "Orders and Products"
     (`propose.ts` `caseBecame`), so a line still naming one of them keeps the shop, and none left drops it. */
  const caseWords = new Set([...(ctx.caseTitle !== null ? [ctx.caseTitle] : []), ...p.places.filter((x) => x.kind === 'list').map((x) => x.name)]);
  const saysCase = (h: Line): boolean => p.usecase !== null && partsOf(h.became).some((w) => caseWords.has(w));
  const caseGone = was.some(saysCase) && !kept.some(saysCase);
  const heard = [...kept, ...moved.map((m) => m.line)].sort((x, y) => (x.at?.[0] ?? 0) - (y.at?.[0] ?? 0));
  const name = a.name === undefined ? p.name : a.name === null ? null : a.name.trim().slice(0, 60) || p.name;
  const first = (n: string | null): string => (n ?? '').split(' ')[0] ?? '';
  const title = p.title !== null && p.name !== null && name !== p.name && p.title.startsWith(`${first(p.name)}'s `) ? (name === null ? null : `${first(name)}'s ${p.title.slice(first(p.name).length + 3)}`) : p.title;
  return {
    ...p,
    name,
    title,
    usecase: caseGone ? null : p.usecase,
    modules: [...new Set([...p.modules.filter((id) => !dropped.has(id)), ...moved.map((m) => m.to), ...(a.on ?? [])])].filter((id) => !(a.off ?? []).includes(id)),
    heard: heard as P['heard'],
  };
}

/** The answer to the one question (`lib/start/question.ts`): which it was, and the value, or `null` for skipped. */
export type Reply = { about: 'arrivesBy' | 'currency' | 'name'; value: string | null };

/** Where the changes and the answer wait beside the sentence across the mail, on this device only. */
export const AMEND_KEY = 'braindog.signup.amend';

/**
 * WHAT WAS CHANGED BY HAND AND ANSWERED, kept for the sentence it was said of. The tab the link opens reads the
 * sentence again and lays these over it; a different sentence (another device's, said again) finds nothing. Storage
 * that throws keeps nothing, and `null` forgets.
 */
export function keepAmend(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, kept: { said: string; amend: Amend; reply: Reply | null } | null): void {
  try {
    if (kept === null || kept.said.trim() === '') storage?.removeItem(AMEND_KEY);
    else storage?.setItem(AMEND_KEY, JSON.stringify({ said: kept.said.trim(), amend: kept.amend, reply: kept.reply }));
  } catch {
    /* Storage off: the build is read from the sentence alone. */
  }
}

/** The changes and the answer kept for `said`, or none. Anything malformed is none. */
export function amendKept(storage: Pick<Storage, 'getItem'> | null | undefined, said: string): { amend: Amend; reply: Reply | null } {
  const none = { amend: NO_AMEND, reply: null };
  try {
    const v: unknown = JSON.parse(storage?.getItem(AMEND_KEY) ?? 'null');
    if (typeof v !== 'object' || v === null) return none;
    const o = v as { said?: unknown; amend?: { out?: unknown; to?: unknown; name?: unknown }; reply?: { about?: unknown; value?: unknown } | null };
    if (o.said !== said.trim()) return none;
    const strs = (x: unknown): string[] => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string') : []);
    const to = typeof o.amend?.to === 'object' && o.amend.to !== null ? Object.fromEntries(Object.entries(o.amend.to).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
    const name = o.amend?.name;
    const on = strs((o.amend as { on?: unknown } | undefined)?.on);
    const off = strs((o.amend as { off?: unknown } | undefined)?.off);
    const amend: Amend = { out: strs(o.amend?.out), to, ...(typeof name === 'string' || name === null ? { name } : {}), ...(on.length > 0 ? { on } : {}), ...(off.length > 0 ? { off } : {}) };
    const about = o.reply?.about;
    const value = o.reply?.value;
    const reply: Reply | null = (about === 'arrivesBy' || about === 'currency' || about === 'name') && (typeof value === 'string' || value === null) ? { about, value } : null;
    return { amend, reply };
  } catch {
    return none;
  }
}
