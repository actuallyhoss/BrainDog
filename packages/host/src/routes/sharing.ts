/**
 * The route rows for sharing part of the record with somebody (`packages/record/src/methods/sharing.ts`, the sharing
 * plan's slice 7).
 *
 * ONE ROW A LINE, IN THE SHAPE `ROUTES` HAS ALWAYS HAD, because the two gates over the table read it by that shape:
 * `router-groups` holds each row's group to `docs/30-BLUEPRINT.md` §5, and `guards` holds the record method of the same
 * name to the guard its group implies.
 *
 * DECIDING WHO SEES WHAT IS AN OWNER'S OR AN ADMIN'S, IN A BROWSER: ADMIN, guarded by `team`. A grantee's own two are
 * DATA, because whoever holds a share may read what they hold and share on what they manage. A token is refused
 * `NEEDS_BROWSER_SESSION` but the owner's own agent while he lets agents do everything without asking, or told it to and
 * it sent his words as `said`: then it shares as he does (the owner's word of 2 Nov). `sharing` lists shares, since
 * `shares` already lists the links to one page.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'sharing', group: 'ADMIN', writes: false, what: 'Every share here, live and ended in the last 30 days, each said as one sentence.' },
  { name: 'share', group: 'ADMIN', writes: true, what: 'Share part of this BrainDog with somebody, or change a share. Never with an owner. The owner\'s own agents may, while he lets them do everything without asking, or on his word sent as said. A project by its handle or name, a person by their People row.' },
  { name: 'unshare', group: 'ADMIN', writes: true, what: 'Stop one share at once, and every share made onward from it.' },
  { name: 'sharePreview', group: 'ADMIN', writes: true, postRead: true, what: 'A share said as one sentence, with how many rows of each list it reaches now. It keeps nothing.' },
  { name: 'groupPut', group: 'ADMIN', writes: true, what: 'Make a group of people to share with, rename one, or retire one, which ends every share it holds.' },
  { name: 'shareActivity', group: 'ADMIN', writes: false, what: 'What people who are not owners saw and changed lately, and through which share, in plain words.' },
  { name: 'sharedOut', group: 'ADMIN', writes: false, what: "What is shared out, for Today's one line: how many shares, with how many people, and those made today." },
  { name: 'groups', group: 'ADMIN', writes: false, what: 'Every live group here: its name, its people, and how many shares it holds.' },
  { name: 'groupMember', group: 'ADMIN', writes: true, what: "Put somebody on this BrainDog in a group, or take them out, which ends the group's shares for them." },
  { name: 'myShares', group: 'DATA', writes: false, what: 'What has been shared with you here, each as one sentence. A person only.' },
  { name: 'shareOnward', group: 'DATA', writes: true, what: 'Share on what you manage, with somebody on this BrainDog, at most Edit and never past your own share.' },
];
