/**
 * The words of sharing one money account (`lib/money/AccountShare.svelte`) and of a budget that carries over.
 *
 * AN AREA FILE OF THE COPY AGGREGATE, imported by `lib/copy.ts` and spread into `copy`. It imports nothing.
 */

export const moneyShare = {
  accountShareOpen: 'Share this account',
  accountShareTitle: (name: string): string => `Share ${name}`,
  accountShareSaid: 'They see this account and every line on it, with the categories and payees those lines name. Nothing else.',
  accountShareWho: 'With',
  accountShareCan: 'They can',
  accountShareView: 'View',
  accountShareEdit: 'Edit',
  accountShareEditSaid: 'They can add lines to this account and change them. They cannot delete the account.',
  accountShareSend: 'Share',
  accountShareSent: (name: string, who: string): string => `${name} is shared with ${who}.`,
  accountSharedWith: 'Shared with',
  accountSharedCan: (who: string, edit: boolean): string => `${who}${edit ? ', can edit' : ''}`,
  accountShareStop: 'Stop',
  accountShareStopSaid: (who: string): string => `Stop sharing with ${who}`,
  accountShareStopped: (who: string): string => `${who} no longer sees this account.`,
  accountShareMissing: 'This account could not be read, so nothing was shared.',
  /* UNDER AN ADD-ON'S SECRET SETTING: the setting holds a key's name, and the link itself goes in Keys under it. */
  settingSecretSaid: (label: string): string => `This is the name of a key, never the link itself. Put the link in your keys under "${label}".`,
  settingSecretOpen: 'Open Keys',
  /* UNDER A BUDGET'S BAR: how much of the most to spend came over from the period before. */
  budgetCarried: (amount: string): string => `Includes ${amount} carried over`,
};
