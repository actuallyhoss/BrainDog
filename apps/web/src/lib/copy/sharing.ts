/**
 * The sharing words: Settings > Sharing, and what the person a share let in reads (sharing plan §3.2, §3.4, §3.5).
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a key here
 * as `copy.<key>`. Every key starts `sharing`, so a key the Share sheet adds beside these cannot meet one of another
 * area's.
 *
 * NAMES, NEVER IDS, AND ONE LINE WHERE ONE WILL DO. A share is said by the record in one sentence ("Priya can edit
 * tasks in Kiln until 1 Dec."), so nothing here says one again; these are the words around the sentences.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports nothing.
 */

export const sharing = {
  /* ── Settings > Sharing ── */
  sharingPeopleHere: 'People here',
  sharingShared: 'Shared',
  sharingWaiting: 'Waiting',
  sharingGroups: 'Groups',
  sharingEnded: 'Ended',
  sharingEndedLead: 'The last 30 days.',
  sharingWaitingLead: 'Shared with an address, until its person accepts the invite.',
  sharingNothing: 'Nothing is shared',
  sharingNothingBody: 'Share a list, a project or one thing from its menu.',
  sharingNoneWaiting: 'Nobody is waiting',
  sharingNoneEnded: 'Nothing ended in the last 30 days',
  sharingShare: 'Share something',
  sharingChange: (sentence: string) => `Change this: ${sentence}`,
  sharingStopLabel: (what: string, who: string) => `Stop sharing ${what} with ${who}`,
  sharingStop: 'Stop',
  sharingKeep: 'Keep',
  sharingStopAsk: (what: string, who: string) => `Stop sharing ${what} with ${who}?`,
  sharingStopped: (what: string, who: string) => `Stopped. ${who} can't see ${what} now.`,
  sharingEndedOn: (day: string) => `Ended ${day}`,
  sharingSomeone: 'Someone',
  sharingGroupSize: (n: number) => (n === 1 ? '1 person' : `${n} people`),
  sharingGroupHolds: (n: number) => (n === 0 ? 'Shares nothing yet' : n === 1 ? 'Holds 1 share' : `Holds ${n} shares`),
  sharingNoGroups: 'No groups yet',
  sharingNoGroupsBody: 'A group shares the same things with several people at once, such as Accountants.',
  sharingGroupNameLabel: 'New group',
  sharingGroupMake: 'Make the group',
  sharingGroupMade: (name: string) => `${name} is ready. Put people in it.`,
  sharingGroupPersonLabel: (group: string) => `Put someone in ${group}`,
  sharingGroupPick: 'Choose a person',
  sharingGroupAdd: 'Put in',
  sharingGroupAdded: (who: string, group: string) => `${who} is in ${group} now.`,
  sharingGroupOutLabel: (who: string, group: string) => `Take ${who} out of ${group}`,
  sharingGroupOut: 'Take out',
  sharingGroupLeft: (who: string, group: string) => `${who} is out of ${group}, and its shares ended for them.`,
  sharingGroupRetire: 'Retire group',
  sharingGroupRetireAsk: (group: string) => `Retire ${group}? Everything it shares stops at once.`,
  sharingGroupRetired: (group: string) => `${group} is retired. Everything it shared stopped.`,
  sharingSeeAs: 'See as...',
  sharingSeeAsHint: 'Open the record as one person sees it. Nothing you do there counts.',
  sharingSeeAsPick: 'Choose who',

  /* ── the person a share let in ── */
  sharingYouCanSee: 'What you can see here',
  sharingEndedTitle: 'Your access ended',
  sharingEndedBody: 'Your access to this record ended. Ask its owner if you need it back.',
  sharingWelcomeClose: 'Close',
} as const;
