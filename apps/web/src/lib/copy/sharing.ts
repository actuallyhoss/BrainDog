/**
 * The sharing words: Settings > Sharing, and what the person a share let in reads.
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
  sharingShared: 'Shared',
  sharingWaiting: 'Waiting',
  sharingGroups: 'Groups',
  sharingEnded: 'Ended',
  sharingEndedLead: 'Last 30 days',
  sharingWaitingLead: 'Not yet accepted',
  sharingNothing: 'What you share with people, and links you make, is listed here.',
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
  sharingNoGroups: 'Share with several people at once, like Accountants.',
  sharingGroupNameLabel: 'New group',
  sharingGroupMake: 'Make group',
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
  sharingSeeAsHint: 'Nothing you do there counts.',
  sharingSeeAsPick: 'Choose who',
  sharingSeen: 'Seen and changed',
  sharingSeenTitle: (who: string) => `What ${who} saw and changed`,
  sharingSeenLead: 'Last 30 days',
  sharingSeenReading: 'Reading what they saw',
  sharingSeenNone: (who: string) => `${who} hasn't opened or changed anything here in the last 30 days.`,

  /* ── the person a share let in ── */
  sharingYouCanSee: 'What you can see here',
  sharingEndedTitle: 'Your access ended',
  sharingEndedBody: 'Your access to this BrainDog ended. Ask its owner if you need it back.',
  sharingWelcomeClose: 'Close',
} as const;
