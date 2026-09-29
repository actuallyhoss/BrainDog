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
  useCaseEvent: (verb: string, name: string) => `${verb} the ${name} use case`,
  /** A pack's settings saved, said as what changed: which use case speaks, or that the settings did. */
  useCaseSpeaks: (name: string) => `${name} speaks for this BrainDog now`,
  useCaseBeside: (name: string) => `${name} added beside the use case that speaks`,
  useCaseAddedBeside: (name: string, speaker: string) => `${name} added beside ${speaker}`,
  settingsChanged: (name: string) => `Changed the settings of ${name}`,
  /** A record setting itself up, said as one line of the feed: "Set up Personal with 40 example rows". */
  setUpWith: (name: string, rows: number) => `Set up ${name} with ${rows} example ${rows === 1 ? 'row' : 'rows'}`,
  setUpRows: (rows: number) => `Added ${rows} example ${rows === 1 ? 'row' : 'rows'}`,
  setUpLinked: 'Linked the example rows to each other',
  /** Who did it and what to, in a `feed` block on a live record: "You", "Someone", "installed the Team board use case". */
  /** A decision in the feed, with the reason it was given when there is one. */
  feedDecided: (title: string, reason: string | null) => (reason ? `Decided: ${title}${/[.?!]$/u.test(title) ? '' : '.'} ${reason}` : `Decided: ${title}`),
  /** Many writes by one writer in a few seconds, such as an import, as one line of the feed: "Added 52 rows and asked 8 questions". */
  feedBulk: (n: { added: number; changed: number; asked: number; removed: number }, more: boolean, why: string | null = null) => {
    const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
    const parts = [
      n.added ? `added ${plural(n.added, 'row', 'rows')}` : '',
      n.changed ? `made ${plural(n.changed, 'change', 'changes')}` : '',
      n.removed ? `removed ${plural(n.removed, 'row', 'rows')}` : '',
      n.asked ? `asked ${plural(n.asked, 'question', 'questions')}` : '',
    ].filter(Boolean);
    const joined = parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    const tail = more ? ', and more before these' : '';
    return why ? `${why}: ${joined}${tail}` : `${joined.charAt(0).toUpperCase()}${joined.slice(1)} at once${tail}`;
  },
  feedYou: 'You',
  feedUseCase: (name: string) => `the ${name} use case`,
  feedPack: (id: string) => `the ${id} add-on`,
  /* MONEY IN MORE THAN ONE CURRENCY, said under the figure rather than left blank: why it is one amount per currency,
     and once it is added up, as of which day's rates. */
  figureNoHome: 'In more than one currency. Choose a home currency in Money’s settings to add them up.',
  figureNoRate: (pairs: string) => `Not added up yet: there is no rate from ${pairs}. Add one to Exchange rates.`,
  figureConvertedForward: (day: string) => `Converted at rates as of ${day}, the first after some of these amounts.`,
  figureConvertedStale: (day: string) => `Converted at rates as of ${day}. Update the rates for a current figure.`,
  /** A target declared in one currency, said in the one the figure was converted into. */
  targetConverted: (line: string, from: string) => `${line}, converted from ${from} at the latest rate`,
} as const;
