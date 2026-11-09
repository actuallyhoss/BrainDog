/**
 * The words the shared read helpers put together: the feed's lines on a live record (`record/api.ts` and
 * `record/boot-live.ts`), and money in more than one currency under a figure (`record/metrics.ts`).
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

export const data = {
  /** A use case's pack going in or out, in the feed: "Added the Student use case". */
  useCaseEvent: (verb: string, name: string) => `${verb} the ${name} starter`,
  /** A pack's settings saved, said as what changed: which use case speaks, or that the settings did. */
  useCaseSpeaks: (name: string) => `${name} speaks for this BrainDog now`,
  useCaseBeside: (name: string) => `${name} added beside the starter that speaks`,
  useCaseAddedBeside: (name: string, speaker: string) => `${name} added beside ${speaker}`,
  settingsChanged: (name: string) => `Changed the settings of ${name}`,
  /** A record setting itself up, said as one line of the feed: "Set up Personal with 40 example items". */
  setUpWith: (name: string, rows: number) => `Set up ${name} with ${rows} example ${rows === 1 ? 'item' : 'items'}`,
  setUpRows: (rows: number) => `Added ${rows} example ${rows === 1 ? 'item' : 'items'}`,
  setUpLinked: 'Linked the examples to each other',
  /** Who did it and what to, in a `feed` block on a live record: "You", "Someone", "installed the Team board use case". */
  /** The making of a BrainDog, its owner, add-ons and the person it is for, as one line of the feed. */
  feedMade: 'Your BrainDog was made',
  /* WHAT IS THE READER'S (collab pass, 2 Nov): a row given them, a comment naming them. */
  feedGaveYou: (by: string, title: string) => `${by} gave you ${title}`,
  /** Somebody let in by an invitation (9 Nov), by name where the reader is told it. */
  feedJoined: (who: string | null) => (who ? `${who} joined your BrainDog` : 'Somebody joined from your invitation'),
  feedMentionedYou: (by: string, title: string | null, note: string) =>
    `${by} mentioned you${title ? ` on ${title}` : ''}: ${note.length > 90 ? `${note.slice(0, 89)}…` : note}`,
  /** A decision in the feed, with the reason it was given when there is one. */
  feedDecided: (title: string, reason: string | null) => (reason ? `Decided: ${title}${/[.?!]$/u.test(title) ? '' : '.'} ${reason}` : `Decided: ${title}`),
  /**
   * A decision by the answer chosen (audit 6g, AG6): "You chose Chase it on Invoice 2026-041: brand system", where the
   * line said "Decided: … Chase it? Answered in one press, for the option's own reason: Mark an invoice as chased". `on`
   * is the thing the question is about when it names one, else the question; the reason only when somebody wrote one.
   */
  feedChose: (who: string | null, label: string, on: string | null, question: string, reason: string | null) => {
    const lead = who === null ? `Chose ${label}` : `${who} chose ${label}`;
    const said = on !== null ? `${lead} on ${on}` : `${lead}: ${question}`;
    return reason ? `${said}${/[.?!]$/u.test(said) ? '' : '.'} “${reason}”` : said;
  },
  /** Many writes by one writer in a few seconds, such as an import, as one line of the feed: "Added 52 items and asked 8 questions". */
  feedBulk: (n: { added: number; changed: number; asked: number; removed: number }, more: boolean, why: string | null = null, list: string | null = null) => {
    const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
    const parts = [
      n.added ? `added ${plural(n.added, 'item', 'items')}` : '',
      n.changed ? `made ${plural(n.changed, 'change', 'changes')}` : '',
      n.removed ? `removed ${plural(n.removed, 'item', 'items')}` : '',
      n.asked ? `asked ${plural(n.asked, 'question', 'questions')}` : '',
    ].filter(Boolean);
    const joined = parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    const tail = more ? ', and more before these' : '';
    /* WHERE, WHEN IT WAS ONE LIST (audit of 30 October, 7): "Made 17 changes at once" said nothing of what changed. */
    const where = list ? ` in ${list}` : '';
    return why ? `${why}: ${joined}${where}${tail}` : `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${where} at once${tail}`;
  },
  feedYou: 'You',
  feedUseCase: (name: string) => `the ${name} starter`,
  feedPack: (id: string) => `the ${id} plugin`,
  /* MONEY IN MORE THAN ONE CURRENCY, said under the figure rather than left blank: why it is one amount per currency,
     and once it is added up, as of which day's rates. */
  figureNoHome: 'In more than one currency. Choose a home currency in Money’s settings to add them up.',
  figureNoRate: (pairs: string) => `Not added up yet: there is no rate from ${pairs}. Add one to Exchange rates.`,
  /* PART OF IT WAS ADDED UP, so this never says none of it was: the least the whole can be, and each pair the rest
     waits on, the last after "or". */
  figureAtLeast: (amount: string, pairs: readonly string[]) =>
    `At least ${amount} here; no rate from ${pairs.length > 1 ? `${pairs.slice(0, -1).join(', ')} or ${pairs[pairs.length - 1]}` : (pairs[0] ?? '')} for the rest.`,
  figureConvertedForward: (day: string) => `Converted at rates as of ${day}, the first after some of these amounts.`,
  /* NOTHING BESIDE A FIGURE UPDATES A RATE, so the stale sentence names where rates are kept up and the way in, by the
     names they carry on Money's settings (`packs.ratesSetUp`), and asks for no press that is not on the page. */
  figureConvertedStale: (day: string) =>
    `Converted at rates as of ${day}, which are out of date. Rates are kept up in Exchange rates: Set up exchange rates, in Money’s settings, fetches them every day.`,
  /** A target declared in one currency, said in the one the figure was converted into. */
  targetConverted: (line: string, from: string) => `${line}, converted from ${from} at the latest rate`,
} as const;
