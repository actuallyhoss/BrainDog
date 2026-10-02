/**
 * The query builder's words: `lib/query/QueryBuilder.svelte` and the surfaces that mount it.
 *
 * A NEW AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads it into `copy`, and every key here is read as a
 * literal `copy.<key>` by the builder or a surface that mounts it, so `dead-copy` sees each one drawn. Plain Node loads
 * this file through the aggregate (`passkey.mjs`), so it imports nothing.
 *
 * THE OPERATOR WORDS ARE NOT HERE. "is", "starts with" and "within the last" are the builder's grammar as much as its
 * copy, and `lib/query/tree.ts` keeps each one beside the `where` operator it says, so the two cannot drift apart.
 */

/* ── the query builder ──────────────────────────────────────────────────── */

export const query = {
  /** The group's own control: how its conditions join. A condition row says the rest of the sentence. */
  queryJoin: 'Show what matches',
  /** The three joins `docs/21 §4.1` names, as a person says them. */
  queryAll: 'all of these',
  queryAny: 'any of these',
  queryNone: 'none of these',
  /** The accessible names of one condition's three controls, with its place in the list. */
  queryFieldOf: (n: number): string => `Field of condition ${n}`,
  queryOpOf: (n: number): string => `Condition ${n} asks`,
  queryValueOf: (n: number): string => `Value of condition ${n}`,
  /** The two ways a filter grows. */
  queryAddCondition: 'Add a condition',
  queryAddGroup: 'Add a group',
  /** A row's and a group's remove control, named by what it takes away. */
  queryRemoveCondition: (n: number): string => `Remove condition ${n}`,
  queryRemoveGroup: 'Remove this group',
  /** The depth meter beside Add a group, which stands in for an error at the cap. */
  queryDepth: (at: number, cap: number): string => `Groups ${at} of ${cap} deep`,
  /** Nothing narrows yet. */
  queryEverything: 'Everything. Add a condition to narrow it.',
  /** A value that is a choice, before one is made. */
  queryChoose: 'Choose',
  /** A yes-or-no field's two answers. */
  queryYes: 'Yes',
  queryNo: 'No',
  /** Said after the number in "within the last 30 days". */
  queryDays: 'days',
  /** Help under a date's box, because the box also takes the record's own words for a day. */
  queryDayHelp: 'A date such as 2026-10-01, or today, tomorrow, +30d',
  /** Help under an amount's box: the record refuses an amount with no currency, so it says so first. */
  queryMoneyHelp: 'With its currency, as GBP 960.00',
  /** The text lens: the fold, the box's name, and the two things it can say back. */
  queryAsText: 'As text',
  queryTextName: 'The filter as one sentence',
  queryCouldNotRead: (after: string | null): string => (after ? `Could not read after "${after}"` : 'Could not read the first condition'),
  queryNoSentence: 'Groups cannot be written as one sentence, so the text here only reads.',
  /** A filter the record holds that the rows above cannot draw, kept whole rather than dropped. */
  queryUndrawn: 'Part of this filter cannot be shown here. It still applies as it is.',
  /** The count under the builder: the record's own answer for the list and this filter. */
  queryMatches: (n: number, of: number): string => `Matches ${n} of ${of}`,
  queryCounting: 'Counting',
  /** Describe it: asking Slash for a first draft of the rows. */
  queryDescribe: 'Describe it',
  queryDescribeGo: 'Ask Slash',
  queryDescribeNone: 'Slash could not put that as a filter on this list.',
  /** A row Slash proposed, and what can be done with it before it is part of the filter. */
  queryProposed: 'Proposed',
  queryKeep: 'Keep',
  queryDrop: 'Drop',
  queryApproveAll: 'Approve all',
  /** The saved view's control that opens the builder over the view's narrowing. */
  queryNarrowView: 'Narrow this view',
} as const;
