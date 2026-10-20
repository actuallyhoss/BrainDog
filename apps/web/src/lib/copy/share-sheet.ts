/**
 * The words of the Share sheet (sharing plan §3.1) and of See as (§3.3): the sheet's six fields, its preview, the inline
 * confirm, the link an address is sent, the banner over the record seen as somebody, and the refusal of a change made
 * there.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a key here
 * as `copy.<key>`. Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports nothing.
 *
 * NAMES, NEVER IDS, and one line where one will do (§3.5). The sentence a share is said in is the record's own
 * (`sharePreview`, `shareSentenceOf`), never typed here.
 */

export const shareSheet = {
  shareOpen: 'Share',
  /* ON A PROJECT'S PAGE, beside "Share" for a read-only link (`ShareMenu.svelte`), so the two are not one word twice. */
  shareWithPeopleOpen: 'Share with people',
  shareSheetTitle: (name: string): string => `Share ${name}`,
  shareThisView: 'Share this view',
  shareTemplatesLabel: 'Start from',
  shareTemplateNames: { accountant: 'Accountant', contractor: 'Contractor', assistant: 'Assistant', reviewer: 'Reviewer' } as Record<string, string>,

  shareWithLabel: 'With',
  shareWithHint: 'A name, a group or an email',
  shareWithInvite: (email: string): string => `Share with ${email}`,
  shareWithGroupSaid: (name: string, people: number): string => `${name}, ${people === 1 ? '1 person' : `${people} people`}`,
  shareWithChange: (name: string): string => `Change who, now ${name}`,
  shareWithNobody: 'Nobody here by that name. Type their email to share with them.',

  shareCanLabel: 'Can',
  shareRungs: { view: 'View', comment: 'Comment', edit: 'Edit', manage: 'Manage' } as Record<string, string>,

  shareWhatLabel: 'What',
  shareWhatAll: (name: string): string => `Everything in ${name}`,
  shareWhatList: (list: string, name: string): string => `${list} in ${name}`,
  shareWhatOnly: (list: string): string => `Only ${list} where...`,
  shareWhatView: 'What this view shows',
  shareWhatTemplate: 'As the template says',

  shareHideLabel: 'Hide',
  shareHideAmounts: 'Amounts',
  shareHideField: 'Hide a field',
  shareHideShown: (field: string): string => `Show ${field} again`,

  shareUntilLabel: 'Until',
  shareUntil: { day1: '1 day', week: '1 week', days30: '30 days', day: 'Pick a day', none: 'No end' } as Record<string, string>,
  shareUntilDay: 'The day it ends',

  shareMoreLabel: 'More',
  shareWeekdays: 'Weekdays 9 to 6',
  shareOnce: 'Just once',
  shareAgents: 'Their agents too',
  shareDelete: 'Can delete',

  conditionField: 'Field',
  conditionIs: 'is',
  conditionYes: 'Yes',
  conditionNo: 'No',
  conditionAnother: 'And another',
  conditionTakeOut: (field: string): string => `Take out ${field}`,
  conditionNeeded: 'Pick a field and say what it is.',

  shareWillSee: (who: string, things: string): string => `${who} will see ${things} now, and new ones as they're added.`,
  shareSeesNone: (who: string): string => `${who} sees nothing here yet, and will see new ones as they're added.`,
  shareCounting: 'Counting what they would see',
  shareCopyLine: 'They can copy what they can see.',
  shareSeeAs: (name: string): string => `See as ${name}`,
  shareSend: 'Share',
  shareSending: 'Sharing',

  shareConfirm: "Confirm it's you",
  shareConfirmWhy: 'Sharing with no end, or letting somebody new change things, asks for Face ID or your passkey first.',
  shareConfirmFailed: "That didn't confirm it. Nothing was shared.",

  shareLinkSaid: (email: string): string => `Send ${email} this link. It works for 24 hours and is shown only now.`,
  shareLinkLabel: 'Link to join',
  shareLinkCopy: 'Copy the link',
  shareLinkCopied: 'Link copied',
  shareLinkMissed: (email: string): string => `Shared. The link for ${email} wasn't made, so make one in Settings.`,

  seeAsBanner: (name: string): string => `Seeing as ${name}. Nothing you do here counts.`,
  seeAsExit: 'Exit',
  seeAsRefused: (name: string): string => `You're seeing as ${name}. Exit to change things.`,
} as const;
