/**
 * The account's words: settings and every area in it, the Keychain, signing in, an invitation, usage, backups and
 * History.
 *
 * AN AREA FILE OF THE COPY AGGREGATE. `lib/copy.ts` spreads this object into `copy`, and every screen reads a
 * key here as `copy.<key>`. The house voice is written once, at the top of `copy.ts`. A word a screen in another
 * area also draws is in `shell.ts`, so that rewording it is nobody's edit to another area's screen.
 *
 * ONE BLOCK PER AREA. A change adding account words adds them in a block of its own under a comment naming it, so
 * two changes writing here at once never share a line.
 *
 * Plain Node loads this file through the aggregate (`passkey.mjs`), so it imports only relative `.ts` files.
 */

import { SUPPORT_EMAIL } from './shell.ts';

export const account = {
  shownInNav: (title: string) => `${title} is back in your nav.`,
  showAgain: 'Show again',
  perPerson: 'Kept for you in this BrainDog, on every device you sign in on.',
  promoted: (title: string) => `${title} is in your nav, at the end of its section.`,

  sourcesAdd: 'Sources come with add-ons or agents.',
  sourcesAddGo: 'Browse add-ons',

  /**
   * WHAT A LEVEL MEANS, IN ONE CELL. There were two: a chip printing the enum (`write`) and, three
   * inches away, a sentence collapsing three levels into two with a ternary — so S. Marchetti's row
   * read `write` … `Read only`, two cells contradicting each other about who can change the
   * business record. The chip was also the schema's spelling, lower-cased, on the one screen where
   * a person decides who to trust.
   */
  levelMeans: {
    owner: 'Can change everything, and invite people',
    decide: 'Can change items, and answer questions',
    write: 'Can add and change items',
    /* `20 §1`: `append` is *"`create`, `propose` and `log` — and no read … an appender sees nothing,
       **not even what it filed**"*. "Not the rest" said the opposite — that they can read their own
       submissions — which is wrong in the PERMISSIVE direction, on the control that decides who can
       see somebody's business. */
    append: 'Can add items, and read nothing',
    read: 'Can read, cannot change',
  } as Record<string, string>,
  auditHolds: 'Every change to your BrainDog shows up here, with who made it and when.',
  export: 'Download a copy',
  /* The two questions an audit log exists to answer, as the labels of the two controls. */
  auditWho: 'Who',
  auditWhat: 'What kind of change',
  /* A DAY-ONE SENTENCE, because this is now the `no-data-yet` title and the filtered case has its
     own. "Nothing in the log matches that" was drawn for both, so an empty record and a filter that
     missed said the same thing — and the empty record has not been asked anything. */
  auditNone: 'Nothing in the log yet',
  /* WHAT THE VERSION IS FOR, rather than what it is. Every change moves it by one, so it names a
     moment — which is the only thing anybody does with it. */
  /* THE DAY FILTER, on the screen the restore setting sends somebody to with the words "find the
     moment". It had no way to narrow by when at all. */
  auditWhen: 'Day',
  auditAnyDay: 'Any day',
  verifyFile: 'Check an exported file',
  /* WHAT DELETING DOES, said instead of a one-word heading that states no fact. `Danger` was over
     `Delete this record` over `Delete the studio` — three lines, two of them the same sentence, and
     the two disagreeing about what the record is called. */
  /* "THIS RECORD", NEVER ITS NAME, IN THE TITLE: a record named after its owner read "Delete Marta". */
  deleteWhat: (record: string): string => `Deletes every list and page in ${record}, and all they hold. It cannot be undone.`,
  deleteRecord: 'Delete my BrainDog',
  holdingPen: 'Not placed. Nothing moved.',

  /* settings */
  /* `appearance` WAS THE FIRST LINE OF THIS SECTION AND THE SCREEN NEVER READ IT. Settings names its
     own areas: `{ id: 'appearance', label: 'Appearance', icon: 'sun' }` is typed into
     `settings/[area]/+page.svelte:473` with the other seven. `dead-copy` excused the key as an area
     id being title-cased, and nothing title-cases anything there. The label being in the route and
     not here is a finding about that file rather than a reason to keep a second copy of the word. */
  scheme: 'Colour scheme',
  schemeLight: 'Light',
  schemeSystem: 'System',
  schemeDark: 'Dark',
  textSize: 'Text',
  textSmall: 'Small',
  textNormal: 'Normal',
  textLarge: 'Large',
  density: 'Density',
  densityCompact: 'Compact',
  densityComfortable: 'Comfortable',
  densityRoomy: 'Roomy',
  characterKeys: 'Character keys',
  /* IT SAID "Single letters act on the focused list", WHICH NAMED NEITHER THE SCOPE NOR THE COST.
     Nothing has to be focused: `?`, `/` and `g` act anywhere, and `j` moves a page's block cursor
     from nowhere. So a reader deciding whether to turn this off was told it affected one list, and
     what it actually takes is the help sheet, the palette shortcut and every goto. The sentence a
     person needs before pressing Off is what stops working and what does not. */
  characterKeysHint: 'Off silences one-key shortcuts like ?, / and g. Ctrl and Alt ones keep working.',

  /* the record's own colour */

  accentTitle: 'Accent',
  /* IT DESCRIBED THE GENERATOR: "Every surface, ink and boundary is solved from it against the same
     contrast floors, so a colour that would be unreadable is refused rather than approximated." True,
     and a sentence about how the palette is computed, under a row of swatches somebody is choosing
     between. What it does for them is the same fact from their side, including the refusal, which
     is the one thing a swatch press can do that they would not expect. AND THEN IT WAS STILL A PARAGRAPH ABOUT THE
     SCREEN: how the other colours follow, and what a press may refuse, which the refusal says in place when it happens
     (`accentRefused`). What is left is the choice itself. */
  accentHint: "Yours alone. It wins over the shared look below, which the owner sets for everyone.",
  /**
   * THE PALETTE THAT SHIPPED AND COULD NOT BE TURNED ON.
   *
   * `packages/theme` solves a second palette against a higher contrast floor and `theme.mjs` writes
   * it into `house.css` behind `html[data-theme='hc']`, byte-compared on every build. Nothing in
   * the app ever set that attribute, so it was sixteen checks' worth of work that no reader could
   * reach. What stood in its way was the record accent, which was being written into the same
   * attribute and read by nothing.
   *
   * NAMED FOR WHAT IT DOES AND NOT FOR THE STANDARD IT MEETS. "WCAG AAA" is a fact about a document
   * somebody else wrote; "more contrast" is a fact about the screen in front of you (`19 §9`).
   */
  contrast: 'More contrast',
  /* "A second palette, solved against a higher floor" was the comment above, said to the reader.
     What they get is the second sentence it already had, in the words of what they see. */
  contrastHint: 'Makes text and edges stand out more, and keeps the accent you chose.',
  shot: 'Screenshot mode',
  shotHint: 'Hides what your BrainDog holds on this screen. What is sent to this device does not change.',

  /* the settings areas `19 §2` says an earlier draft dropped */
  /* AND SO DOES THIS ONE. **Who can see this record · 4** stood over four rows, one of which is an
     invitation that has not been accepted, at level `append`, which reads nothing — so three of the
     four could see the record and the fourth could not, for two independent reasons, both printed
     within two hundred pixels of the heading counting them. */
  whoCanSee: 'Who can see this BrainDog',
  /* `19 §9` bans `ceiling` and `scope` by name and says: say WHAT THEY CAN SEE. And it says the
     thing this line exists for — a level here is over the whole record, not one list. */
  /**
   * IT ASSERTED TWO RULES THAT CANNOT BOTH BE TRUE, and each half was a real one.
   *
   * *"A level here covers every list. Nobody is added to a new list until you add them."* The first
   * clause is `45 §5.1` step 3 — the `'*'` row fills every register without one of its own, new
   * ones included. The second is `20 §1`'s *"a new register, entity or page is private until
   * granted"*. Both are true **of different rows of the matrix**: the `'*'` grant covers everything,
   * and somebody with no `'*'` row holds exactly the lists they were named on. The screen drew one
   * level per person, so there was no matrix for either clause to be about, and the sentence read as
   * a contradiction because on that screen it was one.
   */
  accessScope: 'A level here covers every part of this BrainDog, including ones added later. Give somebody a different level on one part and it replaces it, for that part only.',
  /* THE WHOLE OF THIS AREA AT ONE PERSON. A level, an exception, a removal and an erasure are all
     one person measured against another, so on a record whose only person is you there is nothing
     for any of them to say: five greyed segments, two hints about the greying, and a red erasure
     aimed at the reader. This sentence and the invitation below it are what is left, and everything
     else comes back the day there is somebody to compare with. */
  onlyPerson: 'Only you, for now.',
  peopleOwnersOnly: 'Who can see this BrainDog, and what each person can do, is set by its owner. Ask them if you need more.',
  levelFor: (name: string) => `What ${name} can do`,
  /* NOT A SIXTH LEVEL. `member` is a ROW that may not exist, and "no row" is a different answer from
     the lowest rung — `members.ts` shipped both wrong readings of that before settling on `null`. */
  noRecordLevel: 'No access',
  noRecordLevelMeans: 'Nothing on the whole BrainDog. Only the parts named below, and nothing that is added later.',
  addException: 'Different on one part',
  removeException: 'Back to their level',
  suspendedSince: (ago: string) => `stopped ${ago}`,
  /* THE READ MARK, WHICH `20 §6` PUTS ON THE *WORTH BUILDING* SIDE of its table: "who has seen the
     thing that binds them", against live cursors and avatar stacks on the other. A decision binds
     people who were not in the room, so whether they have looked is the question a record can
     answer and a chat cannot — and this screen showed what everybody MAY do and nothing about
     whether any of them had been. */
  lastLooked: (ago: string) => `last looked ${ago}`,
  /* NOT "never" ON ITS OWN, WHICH READS AS AN ACCUSATION and is ambiguous besides: somebody whose
     invitation is still out has also never looked, and that is a different sentence. This one is
     only ever drawn for somebody who has accepted. */
  neverLooked: 'has not opened it',
  removeAccess: 'Remove',
  /* `LEVEL_REQUIRED`'s own fix sentence, verbatim (45 §5.6). */
  lastOwner: 'A BrainDog keeps at least one owner.',
  /* THE ONE ACTION THAT REMOVES YOUR OWN WAY BACK. `45 §5.6` gives every level change one method,
     and another owner can still do this to you — which is what a second owner is for. What is
     refused is doing it to yourself, alone, from the screen you would then be locked out of. */
  ownLevel: 'You cannot change your own level here. Another owner can.',
  inviteTitle: 'Invite somebody',
  inviteHow: 'One use, one address, good for 24 hours.',
  invitePerson: 'Invite a person',
  erasePerson: 'Erase a person',
  eraseWhat: 'Everything one person wrote, removed from sixteen places in one go. It cannot be undone.',

  /* recovery — the way back in */
  passkeys: 'Passkeys',
  passkeyHow: 'Keep more than one, on more than one device.',
  noPasskeys: 'No passkey yet',
  /**
   * `13 §5.2`: be specific about what will be here. On this screen that sentence is the stakes —
   * AND THE STAKES DEPEND ON THE DEPLOYMENT.
   *
   * There was one sentence, ungated: *"Without one, the only way back into this record is an email
   * link."* The magic-link SECTION four blocks down is gated on `AUTH_METHODS.magic`, with a comment
   * quoting `49 §5.6` — *"so the screen never offers it"* — but the gate was on the section and not
   * on this. With no passkeys and no SMTP the screen read "the only way back in is an email link"
   * and then nothing, because the block that would have explained the link had deleted itself.
   *
   * That is the hole `19 §2` names by name — *"left a passkey-primary product with no designed way
   * back in"* — reopened inside the fix for it, on the one screen where believing a false promise
   * costs the record. `49 §5.7` has the self-host answer, and it is a person rather than a link.
   */
  noPasskeysWhy: (magic: boolean) =>
    magic
      ? 'Without one, the only way back in is an email link.'
      : 'This server cannot send an email link, so without a passkey there is no way back in on your own. Ask whoever runs it.',
  addPasskey: 'Add a passkey',
  addedWhen: (ago: string) => `added ${ago}`,
  remove: 'Remove',
  lastPasskey: 'Your only passkey. Add another before removing it.',
  /* A passkey the host holds with no name, which is every one this browser adds. */
  passkeyUnnamed: 'Passkey',
  passkeysUnread: 'Your passkeys could not be read just now.',
  passkeyNotRemoved: 'That passkey was not removed. Try again.',
  magicLink: 'If you lose them all',
  /* `49 §5.6`. It is the ONLY other way in — there are no recovery codes anywhere in this product,
     and saying so is kinder than letting somebody look for them. */
  magicHow: 'An emailed link, good once for 15 minutes. There are no recovery codes.',
  lockout: 'After too many tries',
  /* `49 §5.5`: ten strikes, fifteen minutes, sticky, fail-closed. */
  lockoutHow: '10 failed tries lock sign-in for 15 minutes.',

  /* export — `03 §1`'s three layers, and the two containers `03 §2.1` keeps apart */
  yourData: 'Your whole BrainDog',
  /* WHAT THE FILE IS, IN PLAIN WORDS. The whole copy is a `.brainl`: text, one JSON line for each thing in it (`03 §2.1`),
     streamed out in pages. It said "Readable by any database tool", which is the `.brain` SQLite file's promise, and this
     button never hands that one out (finish G2). */
  exportWhat: 'A plain text file, one line for each thing in it. Any text editor opens it, and BrainDog reads it back in.',
  /* `03 §1`: the three layers are addressable independently, and the governance layer alone IS a
     pack. A product whose only exit is all-or-nothing has three exits it is not offering. */
  takeAway: 'Part of it',
  takeAwayWhat: 'Take the setup or what you wrote, on its own.',
  exportPack: 'Export the way you work',
  exportRows: 'Export your items only',

  /* identity — `33 §10`: login is account-level, so this lives outside the record */
  you: 'You',
  signedInAs: 'Signed in as',
  onThisRecord: 'In this BrainDog',
  identityOutside: 'One sign-in for every BrainDog you have.',
  yourRecords: 'BrainDogs you can open',
  thisOne: 'you are here',

  /* identity: a person changes their own name and sign-in email. The name is the record's `renamePerson`; the
     address is a link mailed to the new one (`/account/email`), and nothing moves until it is opened. */
  identityNoName: 'No name yet',
  identityChangeName: 'Change name',
  identityNameLabel: 'Your name',
  identityNameHint: 'How every record you belong to shows you, from 1 to 80 characters.',
  identitySaveName: 'Save name',
  identitySaving: 'Saving',
  identityCancel: 'Cancel',
  identityClose: 'Close',
  identityNameSaved: (name: string) => `You are ${name} in every record you belong to.`,
  identityPeopleRow: 'Rename yourself in People too',
  identityPeopleRowDone: 'You have the new name in People too.',
  identityPasskeysWay: 'Passkeys',
  identityPasskeys: (n: number) => (n === 0 ? 'None yet' : n === 1 ? 'One passkey' : `${n} passkeys`),

  /* A PASSKEY'S NAME: each passkey is a line under How you sign in, named for the device that made it, and
     renamed here through the host's `POST /auth/passkey/rename`. The host's own sentence answers an empty name. */
  identityPasskeyWay: 'Passkey',
  identityRenamePasskey: 'Rename',
  identityRenamePasskeyOf: (name: string) => `Rename ${name}`,
  identityPasskeyNameLabel: 'Name for this passkey',
  identityPasskeyNameHint: 'Up to 64 characters, such as the device it lives on.',
  identityPasskeySaveName: 'Save',
  identityPasskeyRenamed: (name: string) => `This passkey is called ${name} now.`,
  identityPasskeyNotRenamed: 'The name did not save. Try again.',
  identityChangeEmail: 'Change email',
  identityEmailLabel: 'New email address',
  identityEmailHint: 'We mail a link to it. Nothing changes until you open that link.',
  identitySendLink: 'Send the link',
  identitySending: 'Sending',
  /* SAID THE SAME FOR AN ADDRESS ANOTHER ACCOUNT HOLDS, which is mailed nothing: the answer cannot tell them apart (SEC6). */
  identityLinkSent: (to: string) => `If ${to} can be used, a link is on its way there. It works for 24 hours.`,
  identityEmailMoving: 'Changing your sign-in email',
  identityEmailMoved: (to: string) => `You now sign in with ${to}.`,
  identityEmailBehind: (n: number) =>
    n === 1
      ? 'One of your BrainDogs could not be reached just now and still shows your old address. It catches up the next time you change your name or email.'
      : `${n} of your BrainDogs could not be reached just now and still show your old address. They catch up the next time you change your name or email.`,

  /* `backup` AND IT WAS `sealed copy` AND `snapshot`, WHICH ARE TWO WORDS FOR ONE IDEA. A friction
     pass found them competing on the same screen: `/decide` said "The newest sealed copy is from
     2026-09-02" and a card beside it was titled `Snapshot`. Neither is the word a person uses, and
     having two of them means a reader who learns one still meets the other.

     THE SEALING IS NOT LOST, it moves to where it is the point: the sentence about the key, three
     screens down, where somebody is being told why a copy can be proved to be theirs. Above that,
     what they want to know is that there is a backup and how old it is. */
  noSnapshots: 'No backup yet',
  noSnapshotsWhy: 'A backup is all of your BrainDog at one moment, kept so you can go back to it.',
  /* The kernel's six. `approved` is the seconds between the press and the machine's next poll, and a
     denied row is kept: "I said no to a request I did not make" is the line this table exists for. */
  deviceState: {
    pending: 'waiting for you',
    approved: 'approved, waiting for the machine',
    active: 'connected',
    expired: 'ran out of time',
    denied: 'turned away',
    revoked: 'revoked',
  } as Record<string, string>,
  /* A KEY OR A MACHINE THE OPERATOR'S CUT-OFF ENDED (`ended_by: 'operator'`), said in place of its state, so the
     owner reads why it stopped rather than a key that still looks connected. */
  endedByOperator: 'ended by the operator',

  /* WHAT IT MAY REACH, with its life, because that difference is the whole decision. `19 §9` keeps
     every word from the schema off the screen. Keychain access lasts as long as its scope says. */
  reachMeans: {
    login: 'sign in as you, for ninety days',
    runner: 'do work for you on this machine, for ninety days',
    export: 'take one copy of your BrainDog, once, in the next ten minutes',
    import: 'load items into your BrainDog, once, in the next ten minutes',
    pack: 'install one add-on, once, in the next ten minutes',
    token: 'make one more key, once, in the next ten minutes',
    vault: 'open the keys of one project, for thirty days',
    vaultAll: 'open the keys that belong to no project, for seven days',
    shape: 'take copies of your BrainDog with every word scrambled, and read nothing else, for ninety days',
  } as Record<string, string>,

  /* The code entry: the `verification_uri` every device flow prints. */
  approveTitle: 'Approve a machine',
  codeLabel: 'The six digits it is showing',
  codeGo: 'Approve',
  codeEmpty: 'Type the six digits the machine is showing.',
  codeShort: (n: number) => `That is ${n} digit${n === 1 ? '' : 's'}. A code is six.`,
  codeLong: (n: number) => `That is ${n} digits. A code is six.`,
  codeOther: 'A code is six digits, and this has something else in it.',
  /* The record says no more than this about a miss, so neither does the screen: no count of tries. */
  codeWrong: 'No machine is waiting with that code. Check the digits in your terminal.',
  codeTries: 'Five wrong codes turned away every waiting machine. Run the command again for a new code.',
  codeExpired: 'That code ran out of time. Run the command again on your machine for a new one.',
  signInAgainWhy: 'Approving a machine needs a sign-in from the last fifteen minutes.',
  approvedNow: (label: string, means: string) => `${label} is approved. It can ${means}.`,
  unnamedMachine: 'A machine with no name',

  /* THE PAGE THE TERMINAL PRINTS (`routes/connect/approve`): the six digits and nothing else on it. */
  codeLede: 'Type the six digits your terminal is showing.',
  codeChecking: 'Checking the code',
  codeWaitingTitle: 'Waiting for you',
  codeAsks: (means: string) => `asks to ${means}.`,
  /* THE PRINT OF THE ONE REQUEST A COMMAND ASKED TO RUN, as the terminal shows it beside the code. */
  requestPrint: (print: string) => `Only the request your terminal shows as ${print}.`,
  codeWaitingLeft: (min: number) => (min <= 1 ? 'under 1 min left' : `${min} min left`),
  codeSafe: 'Approve only codes you started. Each works once, for 10 minutes.',
  codeNotOwner: (record: string) => `Only the owner of ${record} can approve a machine. Ask them to open this page.`,
  approvedTitle: 'Approved',
  approvedWhat: 'What you approved',
  approvedCan: 'What it can do',
  approvedNext: 'Back to your terminal. You can close this tab.',
  approvedUndo: 'Changed your mind? You can remove it in',
  approvedUndoGo: 'Settings, Agents',
  approveAnother: 'Approve another',
  /* WHAT WAS APPROVED, said as the command he ran, on the machine he ran it on (`lib/agents/approve.ts`). */
  askerOn: (who: string, machine: string) => `${who} on ${machine}`,

  /* the tokens — `12 §3`: listed with a revoke button, and never the token itself */
  /* `19 §9` again: what it can do, said as what it can do. There is no `admin` (ADR-060). */
  keyCan: {
    read: 'can read, and change nothing',
    propose: 'can read and suggest, and change nothing itself',
    write: 'can read and change items',
  } as Record<string, string>,
  endsWhen: (when: string) => `ends ${when}`,
  /* A REPORT KEY IN THE TOKENS LIST (`record/device.ts` `reportKeyOf`): its name and the one thing it can do. */
  reportKeyNamed: (name: string | null) => (name ? `Report key for ${name}` : 'A report key'),
  reportKeyCan: (list: string) => (list ? `can send numbers to ${list}, and nothing else` : 'can do nothing, because it has nowhere to send numbers'),

  /* Connect an agent: a write token for ninety days, its bearer shown once. */
  connectTitle: 'Connect an agent',
  /* THE INBOX, OFF UNTIL THE OWNER TURNS IT ON. What it opens, and what it still cannot do. */
  connectInbox: 'May read the inbox',
  connectInboxHint: 'May read the inbox: the bank texts and other arrivals no rule has filed yet. It cannot file or archive them.',

  /* ingest — `25 §9` draws this screen */
  sources: 'Sources',
  /* `25 §9`'s own blockquote, and it outranks the screen it is on. */
  staleShows: 'A stale source shows a gap, never an old number.',

  /* notifications: `09` specifies the mechanism and one setting, the quiet hours, so the rest of this reports */
  whenWeInterrupt: 'Interruptions',
  /* QUIET HOURS ARE THE RECORD'S AND AN OWNER SETS THEM (`09 §5` rule 3). One sentence with the two times in it
     and a switch beside it; a member reads the same sentence with no control. A summary due inside them waits for
     their end, and an urgent notice never does. */
  quietHours: 'Quiet hours',
  quietHold: 'Hold notices from',
  quietUntil: 'to',
  quietWhy: 'Urgent notices still come through.',
  quietHeld: (from: string, to: string) => `Notices are held from ${from} to ${to}.`,
  quietOff: 'Off',
  quietOwner: 'Only an owner can change them.',
  quietDefault: 'Put back 21:00 to 08:00',

  /* notifications on this device: Web Push, drawn only where the host has a key.
     THE LINE NEVER SAYS WHAT HAPPENED, because a push passes through a push service nobody here runs (`09 §3`). */
  pushTitle: 'Notifications on this device',
  pushHow: 'One line that opens BrainDog, never what happened.',
  pushTurnOn: 'Turn on for this device',
  pushTurnOff: 'Turn off for this device',
  pushAsking: 'Asking the browser',
  pushIsOn: 'This device is told when something interrupts you.',
  pushIsOff: 'This device is not told.',
  pushDenied: 'This browser blocks notifications from BrainDog. Allow them in the browser’s settings for this site, then turn this on again.',
  pushDismissed: 'Nothing was turned on, because the browser’s question was closed without an answer.',
  pushUnsupported: 'This browser cannot show notifications from BrainDog. On an iPhone or iPad, add BrainDog to the Home Screen and turn this on from there.',
  pushNoService: 'The browser’s push service did not answer, so nothing was turned on. Try again in a minute.',
  pushNoRoute: 'This BrainDog cannot keep a device’s address yet, so nothing was turned on.',
  pushNotSent: 'BrainDog was not reached, so nothing was turned on. Try again once you are online.',
  /* WHAT OPENING THE ROW SAYS WHEN THE BROWSER WOULD NOT ANSWER WHETHER IT IS SUBSCRIBED. Off is the safe reading: a press
     then subscribes, or finds the one already held under the same key and sends it again, so nothing is doubled. */
  pushUnread: 'This browser did not say whether this device is already told, so this starts as off.',

  /* backups — `53 §5.4` */
  kept: 'What is kept',
  /* ONE SENTENCE SAID BOTH HOSTS' POLICIES AND WAS RIGHT ON NEITHER: "nightly, at 03:00. The 30
     newest are kept." `53 §4` gives Cloud `17 3 * * *` UTC and *"the 30 newest dated keys plus
     `latest`"*; `49 §5.13` gives a self-host 02:00 UTC plus `hash(slug) mod 60` minutes and thirty
     files.

     THIS COMMENT USED TO END "and Cloud's real promise is the bigger one, any point in thirty
     days", and that is the belief that put a restore control on a screen where nothing restores.
     `apps/worker/src/index.ts` hands the record no `snapshots` port, so on Cloud the nightly copies
     are all there is and the app cannot even list them. See `restoreCloud`. */
  /* navigation — `29 §4`'s one global switch, which `19 §2` says is why this area exists */
  suggestPages: 'Suggest new pages',
  suggestPagesHint: 'When something you keep grows, or you keep asking the same question, BrainDog suggests a page for it. Nothing is placed for you: a suggestion waits below until you keep it.',
  suggestOff: 'Not offering anything',
  suggestOffWhy: 'Pages you have already placed are untouched. Turn this back on and BrainDog starts offering again.',
  perDevice: 'This setting is remembered on this device.',

  /* THE CHECK, RUN IN THIS BROWSER over a file somebody picks: the same `checkBrainl` an import runs before it writes
     a row. It proves the file is whole and signed by the key inside it, and not whose key that is, so it says no more. */
  fileChecked: (name: string) => `${name} is whole, signed and unchanged since it was written.`,
  fileFailed: (name: string, fix: string) => `${name} did not pass. ${fix}`,
  fileUnread: (name: string) => `${name} could not be read as text. Only a .brainl file can be checked here.`,

  /* deletion (`02 §9`): browser session, re-authenticated, the slug typed */
  /* THE ONE LINE THAT INVITED A REVERSAL WAS THE LINE THE HOST REFUSES FOR EVER. This read *"A
     final copy is kept for the rest of today, in case you change your mind within the hour. Within
     thirty days nothing of this record is left anywhere."* Changing your mind here means making the
     record again at the same name, and `Directory.prepare` (`apps/worker/src/index.ts`) answers a
     slug whose claim reads `released` with *"was the name of another BrainDog and is never given out
     again"*. Deleting burns the name, permanently, and neither sentence on the screen said so.

     AND THE COPY IT PROMISED IS NOT TAKEN. `deleteRecord` (`packages/record/src/index.ts`) calls
     `destroy()` and nothing else, and the Worker's `destroy` deletes the alarm, deletes every byte
     and closes the names. The nightly R2 copy that landed this batch (`apps/worker/src/snapshots.ts`)
     is the cron's and is read by nobody in the app: no `snapshots` port is handed to the record, so
     restoring answers `NOT_IN_THIS_BUILD`. There is nothing here he can go back to.

     WHAT `53 §5.9`'s DAY +30 IS DOING OFF THIS SCREEN. Pruning runs inside `take`, for records the
     Directory still lists, and a deleted record is not listed, so this screen is not the place to
     assert where the last byte is. What is left is the cost he can act on before he presses it.

     `deleteWhat` carries "It cannot be undone" one line above this, in the section whose own comment
     condemns *"three lines, two of them the same sentence"*, so this one does not say it twice. */
  deleteCosts: 'The name is gone for good. A final copy is kept 30 days, out of reach, so export first to keep anything.',
  /* THE RECORD'S NAME, NOT ITS SLUG (UI pass 20 Oct, agents F15 Δ): names, never ids; compared without case. */
  typeSlug: (name: string) => `Type ${name} to confirm`,

  keptCloud: (n: number) => `Every night. The ${n} newest are kept, plus the latest.`,
  keptSelfHost: (n: number) => `Every night, on this machine. The ${n} newest are kept.`,
  snapshotFailed: 'Nothing kept',
  /* A COPY OF NOTHING SAYS SO, rather than "0 B": render's `bytes(0)` is pinned, so the line is chosen here. */
  snapshotEmpty: 'Empty',
  download: 'Download',
  rowsAndSize: (rows: number, size: string) => `${rows === 1 ? '1 item' : `${rows.toLocaleString('en')} items`} · ${size}`,
  snapshotNow: 'Back up now',
  theKey: 'Backup key',
  /* `49 §8` asks for exactly this line. */
  /**
   * IT TOLD SOMEBODY TO BACK UP A KEY IT WOULD NOT SHOW THEM.
   *
   * The section had no button, no link and no value in it: *"Back that key up somewhere else, or
   * the copies cannot be opened"* over an empty box. `49 §8` asks for the sentence and the sentence
   * is right; a screen that gives an instruction and then withholds the one thing needed to follow
   * it is the same defect as a control that does nothing.
   *
   * WHERE THE KEY IS IS THE HONEST ANSWER, and on a self-host it is a file on their own disk rather
   * than anything this screen could print. `12 §8` keeps the age identity outside the product on
   * purpose, so the fix is not to reveal it here; it is to say where it lives.
   */
  theKeyIs: 'Locked with a key kept outside BrainDog, which cannot show it to you.',
  /* NAMED BY ITS FILE ON A SELF-HOST: it began "If you run BrainDog yourself", said only to the
     person who does. `kek` in the data folder is where `braindog init` writes it (`apps/selfhost/src/main.ts`). */
  /* AND WHAT IT SEALS, TRUE TO THE BYTE (AI17): a copy is plain SQLite, and only the saved keys inside it are sealed.
     ON DOCKER the data folder is inside a volume, so the way off it is named (AI24). */
  theKeyWhere: 'It is the backup key file, named kek, in the data folder. Without it your saved keys stay sealed; everything else in a copy is readable, so keep copies as private as the key. Keep a copy of the key somewhere else.',
  theKeyDocker: 'On Docker, copy it off the volume with:',
  theKeyDockerCommand: 'mkdir -p ~/braindog-backups && docker compose cp braindog:/data/kek ~/braindog-backups/',
  downloadNeedsKey: 'A downloaded copy is put back with the key file beside it.',
  restore: 'Restore',
  /**
   * AND WHERE THE RECORD ITSELF REFUSED, THE SCREEN SAID IT COULD DO THE MOST DESTRUCTIVE THING ON IT.
   *
   * On a hosted record `snapshots()` comes back `NOT_IN_THIS_BUILD`, the Kept section above draws
   * that refusal instead of a list, and this section went on drawing *"Any point in the last thirty
   * days"* over a `Restore to a time` button whose one act is `restore` with an empty bookmark,
   * answered by the same refusal as a toast. Two sentences on one screen, four lines apart, saying
   * opposite things about whether this record can be recovered.
   *
   * IT DOES NOT REPEAT THE REFUSAL, which is already on the screen and already says to export.
   * What it adds is the part the refusal leaves out: a copy is being kept, it is kept out of this
   * app's reach (`53 §5.4`), and going back to one is a thing to ask for.
   */
  restoreNotHere: `Going back to an earlier copy is asked for rather than pressed: write to ${SUPPORT_EMAIL} and say which day.`,
  /* AND ON A SELF-HOST, HOW: the copy and the going back are two commands on the machine it runs on. */
  restoreSelfHost: 'On this machine, braindog backup <folder> saves a copy and braindog restore <folder> puts it back.',

  /* billing — nothing to bill on a self-host (23 §8: one line in Settings) */
  billingSelfHost: 'Runs on your own machine. Nothing to bill.',

  /* SAID ONLY UNDER AN AREA WHOSE CHOICES NEVER LEAVE THIS BROWSER (`KEEPS` in `settings/[area]/+page.svelte`), which
     today is Keyboard. It read "The settings above are kept on this device." under Appearance too, where the code keeps
     the look in the record and Appearance's own hint says "on every device you open it on", so the two lines on one
     screen said opposite things. Appearance says where its look is kept itself, and this names what it is true of. */
  keptOnDevice: 'These choices are kept on this device only.',

  /* ── the front door · `/signin` ───────────────────────────────────────────────────────────────

     One sentence per state of `lib/signin.ts`, and calm throughout: a closed passkey sheet or a
     lockout is something that happened, not something that went wrong. Nothing here names a way in
     the host has not offered, because the screen never draws one. Its own word, `signIn`, is in
     `shell.ts`, because the palette says it too. */
  /* THE TASK, NOT THE SLOGAN (site 2b): a returning person came to sign in, and the slogan is the site's. */
  signInTitle: 'Sign in to BrainDog',
  /* THE WAYS BELOW, naming only the ones drawn: a host with no mail is never promised a link, and Google, the second
     button, is named with the others (audit f, AF17). One way alone is said as what it does. */
  signInLede: (magic: boolean, google: boolean, passkey: boolean): string | null => {
    const ways = [magic ? 'Email' : null, google ? 'Google' : null, passkey ? 'a passkey' : null].filter((w): w is string => w !== null);
    if (ways.length > 1) return `${ways.slice(0, -1).join(', ')} or ${ways.at(-1)}.`;
    return magic ? "We'll email you a link." : passkey ? 'Use your passkey.' : null;
  },
  /* DRAWN ONLY AFTER 400MS (first F15): a host that answers at once shows nothing at all. */
  checkingWays: 'Getting sign-in ready',
  withPasskey: 'Use a passkey',
  /* The mechanism and not the gesture: "Use Face ID" is wrong on a laptop, and the browser names the
     gesture itself a moment later. */
  waitingForPasskey: 'Waiting for your passkey',
  passkeyCancelled: 'Sign-in was cancelled. Nothing changed.',
  /* ANOTHER WAY IN IS NAMED ONLY WHEN THE SCREEN DRAWS ONE: a server that offers passkeys alone was
     told to try a way in that does not exist. */
  passkeyUnusable: (others: boolean) =>
    others
      ? 'This browser cannot use a passkey here. Use one of the other ways in below, or open this page in a browser that supports passkeys.'
      : 'This browser cannot use a passkey here. Open this page in a browser that supports passkeys.',
  withGoogle: 'Continue with Google',
  /* WHAT CAME BACK FROM GOOGLE WITHOUT A SESSION, one sentence each. `unknown` can say so plainly, because Google has
     just shown the address belongs to whoever is reading it. */
  /* MAIL THAT IS NOT GOING OUT (`magic: 'down'`): no link is offered, and this line says why and what to do instead. */
  mailDown: 'Mail is not going out right now. Use a passkey, or try in a few minutes.',
  /* THE FIRST DOOR (`routes/signin/first-door.ts`): a record with no way into it yet (`noDoorYet`), and a first run whose
     way in is a letter that cannot go (`mailHeld`). The claim link is handed to whoever provisioned the record and is
     never mailed (`33 §4`), so it is in a terminal and not an inbox. */
  firstDoorTitle: 'This BrainDog has no passkey yet',
  firstDoorWhy: 'Open the link you were given when this BrainDog was set up. You can add a passkey once you are in.',
  /* IN PLACE OF `mailDown`, which says "Use a passkey" to somebody who has none yet. */
  firstDoorMailDown: 'Mail is not going out right now, so your sign-in link cannot be sent. Try again in a few minutes.',
  /* THE SENT SCREEN'S SECOND LINE, a minute after the press: the host answers alike for any address, so the
     screen cannot know the letter failed, and this is what it can say that is true either way. */
  linkSentLater: 'Nothing yet? Check the address, or send it again.',
  sendAgain: 'Send it again',
  googleSaid: {
    cancelled: 'Google sign-in was cancelled. Nothing changed.',
    unknown: 'Nobody here signs in with that Google address. Use another way in, or create a BrainDog of your own.',
    unverified: 'Google could not vouch for that address. Use another way in.',
    locked: 'Too many tries. Wait a few minutes, then try again.',
    failed: 'Google sign-in did not finish. Try it again.',
  },
  emailLink: 'Email me a sign-in link',
  emailLabel: 'Email',
  emailLike: 'you@example.com',
  sendingLink: 'Sending the link',
  linkSentTitle: 'Check your email',
  /* The host answers alike for an address it does not know, so this cannot say the link was sent. */
  linkSentBody: (email: string) => `If ${email} can sign in here, a link is on its way. It works once, for fifteen minutes.`,
  useAnotherEmail: 'Use a different email',
  serverKeyWay: 'Sign in with the server key',
  serverKeyLabel: 'Server key',
  /* Where the credential goes, said to the person handing it over: one request, and nowhere after. */
  serverKeyHint: 'The key your server started with. Never kept here.',
  /* Two full literals for the toggle's two states, which is `copy.ts`'s own rule about a toggle. */
  showToken: 'Show',
  hideToken: 'Hide',
  signingIn: 'Signing you in',
  rejectedTitle: 'That did not sign you in',
  rejectedNext: (others: boolean) => (others ? 'Try again, or use another way in below.' : 'Try again.'),
  closedTitle: 'The server could not check that just now',
  closedNext: 'Nobody was let in. Try again in a minute.',
  lockedTitle: (minutes: number) => `Sign-in is paused for ${minutes === 1 ? 'a minute' : `${minutes} minutes`}`,
  lockedWhy: 'There were too many tries. Waiting is the only way through it.',
  linkLandingTitle: 'Your sign-in link is here',
  claimLandingTitle: 'Your BrainDog is ready to claim',
  useLink: 'Sign in with this link',
  /* WHOSE ACCOUNT THE LINK OPENS, said before the press, so a link somebody else sent cannot sign you in to theirs unseen. */
  linkOpens: (kind: 'magic' | 'claim', email: string) =>
    kind === 'claim' ? `This link is for ${email}. If that is not your address, close this page.` : `This link signs in as ${email}. If that is not your address, close this page.`,
  claimRecord: 'Claim your BrainDog',
  linkExpiredTitle: 'That link has expired or was already used',
  linkExpiredWhy: (kind: 'magic' | 'claim', canAsk: boolean) =>
    kind === 'claim'
      ? 'Ask whoever set up your account for a new link.'
      : canAsk
        ? 'A link works once, for fifteen minutes. Ask for a new link below.'
        : 'A link works once, for fifteen minutes. Go back to sign in and ask for a new link.',
  unreachableTitle: 'BrainDog did not answer',
  unreachableWhy: 'Check your connection, then try again.',
  /* After a press of Try again that came back the same, so the press visibly did something. */
  unreachableStill: (at: string) => `Asked again at ${at}, and it still did not answer. Check your connection, then try again.`,
  askAgain: 'Try again',
  noHostTitle: 'There is nothing to sign in to here',
  noHostWhy: 'This copy of BrainDog runs without a server, so there is nothing behind it to sign in to.',
  openTitle: 'This server lets you straight in',
  openWhy: 'It was started without a key, so anyone on this computer can open it.',
  openYourRecord: 'Open your BrainDog',
  /* What the hosted app says until its sign-in is switched on, to whoever opens it: a fact and a
     promise. */
  notConfiguredTitle: 'Sign-in is not open here yet',
  notConfiguredWhy: 'When it opens, this is where you will sign in to your BrainDog.',
  insecureTitle: 'Sign-in needs a secure address',
  insecureWhy: "Open this page over https, or at localhost on the server's own computer.",
  signedInTitle: "You're signed in",
  /* NOT "AS SOMEONE ELSE". The screen cannot tell whose a link is until it is spent, and the owner pasting his own
     sign-in link into a tab he is already in was told he would be someone else. Spending any link needs this screen
     signed out first, whoever it belongs to, so that is all it says. */
  linkWaitsSignedIn: 'A link arrived, and you are already signed in. To use it, sign out first.',
  addPasskeyHere: 'Add a passkey on this device',
  /* SAID BY THE WAY HE CAME IN. "Without the key" is the self-host's server key, and it was said after a claim link
     too, to an owner on the Cloud who had never seen a key. `null` is a
     session that was already there when the screen opened, so it cannot say how, and names neither. */
  addPasskeyWhy: (via: 'passkey' | 'key' | 'link' | null) =>
    via === 'key'
      ? 'Add one now, so next time you can sign in without the key.'
      : via === 'link'
        ? 'Add one now, so next time you can sign in without a link.'
        : 'Add one now, so next time this device signs you in on its own.',
  addingPasskey: 'Waiting for your device',
  passkeyAdded: 'Passkey added. Next time, sign in with it.',
  passkeyNotAdded: 'Nothing was added.',
  passkeyExists: 'This device already has a passkey for this BrainDog.',
  passkeyFailed: 'The passkey was not added. Try again.',
  openBrainDog: 'Open BrainDog',
  signedOut: 'You are signed out.',
  levelMoved: (name: string, to: string) => `${name} is set to ${to} across this BrainDog.`,
  accessRemoved: (name: string) => `${name} no longer has access to this BrainDog.`,
  exceptionRemoved: (list: string, to: string) => `${list} is back to ${to}.`,
  exceptionAdded: (name: string, list: string, level: string) => `${name} is set to ${level} on ${list}.`,
  exceptionList: 'List',
  exceptionLevel: 'Level',
  exceptionAdd: 'Add',
  exceptionCancel: 'Cancel',
  peopleUnrouted: 'This BrainDog does not list its people yet.',
  /* Lane F: backups, putting a copy back, erasing a person and deleting the record */
  /* NO MACHINE NAME IN THE TOAST (AI23): the copy is the newest row in the list, named in local words there. */
  backedUp: 'Backed up.',
  /* WHO TOOK A COPY, from the label the host gives its name (`apps/selfhost/src/snapshots.ts`). */
  copyBy: { now: 'taken by you', nightly: 'nightly', 'before-restore': 'kept before a restore' } as Record<string, string>,
  copyToday: 'Today',
  copyYesterday: 'Yesterday',
  sizeOnDisk: (size: string) => `${size} on disk`,
  restoreThis: 'Restore this copy',
  restoreLive: 'Put everything back to one of the copies above. What it holds now is kept as a copy first.',
  /* NO COPY ABOVE YET: "one of the copies above" over none. */
  restoreFirst: 'Once a copy is kept, Restore this beside it puts everything back to that day.',
  restoreConfirm: (id: string) => `Put everything back to ${id}? Everything written since then is replaced.`,
  keepAsIs: 'Keep it as it is',
  restoredTo: (id: string, kept: string) => `Everything is back to ${id}. What it held before is kept as ${kept}.`,
  eraseWho: 'Name or email',
  eraseBasis: 'Legal basis',
  eraseWhichPerson: 'Person',
  eraseNobody: 'Nobody by that name or email',
  eraseNow: 'Erase for good',
  erasedRows: (rows: number) => `Erased. ${rows} ${rows === 1 ? "item no longer holds" : "items no longer hold"} them, and the log keeps only that it happened.`,
  recordDeleted: (record: string) => `${record} is deleted. You can close this tab.`,
  /* Lane G: inviting somebody with a link the owner sends, and opening that link */
  inviteEmailLabel: 'Their email',
  inviteLevelLabel: 'What they can do',
  inviteMaking: 'Making a link',
  /* Same words as `TEAMS_HELD_SAID` in the record's directory; a test holds them equal. */
  inviteHeld: 'Inviting colleagues opens soon. Nobody else can join yet.',
  inviteNoMail: 'Nothing is emailed: copy the link and send it to them yourself.',
  inviteLinkReady: (email: string) => `For ${email}. Shown once, so copy it now.`,
  inviteCopyLink: 'Copy link',
  inviteAddsOnlyNext: 'You add through your own agent. Make its key next.',
  inviteMakeAgentKey: "Make your agent's key",
  inviteLinkLabel: 'the invitation link',
  inviteDone: 'Done',
  invitesWaiting: 'Waiting to be used',
  inviteWaitingRow: (level: string, until: string) => `${level} · good until ${until}`,
  inviteWithdraw: 'Withdraw',
  inviteWithdrawn: (email: string) => `The link for ${email} no longer works.`,
  invitePageTitle: 'Invitation',
  /* THE RECORD'S NAME, the fact being decided (first F14); "this BrainDog" when the host gave none. */
  inviteLanding: (record: string | null) => `You're invited to ${record ?? 'this BrainDog'}`,
  inviteFor: (email: string) => `This invitation is for ${email}.`,
  inviteSignedInAs: (email: string) => `You are signed in as ${email}.`,
  inviteAccept: (record: string | null) => (record ? `Join ${record}` : 'Join'),
  inviteAccepting: 'Joining',
  inviteJoined: (record: string | null) => (record ? `You're in ${record}` : "You're in"),
  inviteKeepWay: 'Add a passkey now, so you can sign in again on this device.',
  inviteNoLink: 'Open your invitation link',
  inviteChecking: 'Checking the link',
  inviteFailed: 'That did not work. Open the link again, or ask for a new one.',
  inviteAskNew: 'Not working? Ask the sender for a new one.',
  /* Under a link the host refused: the link was opened, so only a new one helps. */
  inviteAskAgain: 'Ask whoever sent it for a new link.',
  inviteSignInFirst: 'Sign in',
  /* A new address proves it is somebody's own mailbox before an invitation makes them anybody */
  inviteNameLabel: 'Your name',
  inviteOptional: 'Optional',
  inviteCheckMail: 'Check your email',
  inviteMailSent: (email: string) => `We sent a link to ${email}. Open it within a day to finish.`,
  inviteFromMail: 'You opened the link from your email. Join to finish.',
  /* A key taken out of service from the Keychain screen: the bytes go, its line on the screen stays. */
  keyRevoked: (label: string) => label + ' is out of service. It stays listed, because what it opened is a fact.',

  /* ── Billing, Sessions, Recovery and the lapse banner ─────────────────────────────────────────────────────────────
     BILLING SAYS ONE SENTENCE A RECORD, and the sentence says what happens next: nothing for a paid one, Stripe's retry
     and a new card for a failed payment, and for a lapsed one the date it went read-only, the date it is deleted and
     that export never stops. The plan's price is the Worker's own string (`GET /account/billing`), never written here. */
  /* "YOUR BRAINDOG", NEVER "RECORDS" (first hour audit, E9): a new person owns one, and reads the app's word for it. */
  billingYours: (n: number) => (n > 1 ? 'Your BrainDogs' : 'Your BrainDog'),
  billingPlan: (plan: string, price: string) => (price ? `${plan}, ${price}` : plan),
  billingPlanHosted: 'Cloud',
  billingPlanPlus: 'Cloud Plus',
  /* FREE, the plan a record made without paying is on: named, then one calm offer of the paid plan. */
  billingPlanFree: 'Free',
  /* THE OFFER UNDER A FREE RECORD: what the next plan adds in the figures the site sells, then its price. `more` is
     "80 Slash questions and 15 AI tools", built by `upgradeOf` from the Worker's own limits. */
  billingFreeOffer: (plan: string, price: string, more: string | null) =>
    more ? `Everything in the app, for one person. ${plan} gives you ${more}, for ${price}.` : `Everything in the app, for one person. ${plan} is ${price}.`,
  billingUpgrade: (plan: string) => `Upgrade to ${plan}`,
  billingMoveTo: (plan: string) => `Move to ${plan}`,
  /* THE SHELL'S AMBER LINE OVER A RECORD WHOSE CARD FAILED: nothing is locked yet, and one press fixes it. */
  billingPastDueLine: 'The last payment for this BrainDog did not go through. Nothing is locked: Stripe tries the card again over the next few days, and a new card settles it now.',
  billingUpdateCard: 'Update the card',
  billingSee: 'See billing',
  billingPaidThrough: (day: string) => `Paid through ${day}.`,
  billingPaid: 'Paid and up to date.',
  billingPastDue: 'The last payment did not go through. Stripe will try again; update the card.',
  billingLapsedSince: (since: string, deleted: string) =>
    `Read-only since ${since}, and deleted on ${deleted} unless it is paid. Export is always available.`,
  billingLapsed: 'Read-only until it is paid. Export is always available.',
  billingNotBilled: 'Not billed',
  billingManage: 'Manage payment',
  billingPayAgain: 'Pay again',
  billingOpening: 'Opening the payment page',
  /* ABOUT BRAINDOG'S OWN PLANS: "not taking payments" read as if her bakery had stopped taking them (E9). */
  /* N2 AND N3, THE SITE'S OWN WORDS: the paid plans are named, monthly, coming soon and priced at launch, and nothing made
     on Free is lost or locked when they arrive. */
  billingNotOpen: 'Cloud and Cloud Plus, the monthly plans, are coming soon and priced at launch. Nothing you make now will be lost or locked when they arrive.',
  billingNoneOwned: 'Billing belongs to the owner, and you own no BrainDog here.',
  billingUnread: 'What your BrainDog costs could not be read just now. Try again in a minute.',
  /* The Worker's `LAPSED_FIX` (`apps/worker/src/lapse.ts`), word for word, because the banner and a refused write must
     say the same thing about the same record. */
  lapsedFix: 'Read-only until billing resumes. Export is available.',
  lapseDeletes: (day: string) => `It is deleted on ${day} unless it is paid.`,

  /* SESSIONS: every browser this person is signed in on, this one first. A session has no device name, so a row
     says when it was proved and when it was last used, which is what tells a stranger's session from your own. */
  sessions: 'Where you are signed in',
  sessionsHow: 'Signing the others out ends them at once.',
  sessionThis: 'This browser',
  sessionOther: 'Another browser',
  sessionWhen: (proved: string, used: string) => `Signed in ${proved} · last used ${used}`,
  sessionsEndOthers: 'Sign out everywhere else',
  sessionsEnding: 'Signing out',
  sessionsEnded: (n: number) => (n === 1 ? '1 other browser signed out.' : `${n} other browsers signed out.`),
  sessionsNoneElse: 'You are not signed in anywhere else.',
  sessionsFailed: 'Nothing was signed out. Try again.',
  sessionsUnread: 'Where you are signed in could not be read just now. Try again in a minute.',
  sessionsSignedOut: 'Sign in to see your other browsers.',

  /* RECOVERY: what a lost passkey costs, which is nothing while another way in is left. */
  passkeyLost: 'If you lose a passkey',
  passkeyLostHow: (magic: boolean) =>
    magic
      ? 'Sign in with a link from your mail, then remove the lost passkey here. With no passkey and no mail, the person who runs this BrainDog can let you back in.'
      : 'Sign in with another passkey, then remove the lost one here. With none left, the person who runs this BrainDog can let you back in.',
  /* THE OWNER OF A SELF-HOST IS THAT PERSON (AI30): the way back is the server key, at the sign-in page. */
  passkeyLostSelfHost: 'Lost every passkey? Sign in with the server key at /signin, then add a new one.',

  /* Sign-up for a stranger, a record of your own for somebody signed in with none, and the passkey the first run ends on */
  signupClosedTitle: 'Sign-up is not open yet',
  signupClosedWhy: 'Already have a BrainDog? Sign in.',
  signupNameLabel: 'A name for your BrainDog',
  signupNameHint: 'Lower-case letters, digits and hyphens. It is part of your BrainDog\'s address.',
  signupNameChecking: 'Checking the name',
  signupNameFree: 'That name is free.',
  signupNameUnreachable: 'BrainDog could not check that name. It is checked again when you send the form.',
  signupHuman: 'A check that you are a person',
  signupFailed: 'That did not go through. Check the address and the name, then send it again.',
  signupLocked: (minutes: number) => `Too many tries from here. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`,
  /* THE SAME WORDS AS SIGN IN'S (`linkSentTitle`), so the two letters a person may get are called one thing. */
  signupCheckMail: 'Check your email',
  signupMailSent: (email: string) => `A link to finish is on its way to ${email}. Open it on this device. It works once, within a day.`,
  signupOtherAddress: 'Use another address',
  signupVerifying: 'Checking the link',
  signupLinkFailed: 'That link did not work',
  signupLinkFailedWhy: 'A link works once, within a day. Start again and a new one is sent.',
  signupStartAgain: 'Start again',
  signupPayFor: (name: string) => `Pay for ${name}`,
  signupPayRecord: 'Pay for your BrainDog',
  signupPayWhy: (price: string) => `BrainDog keeps your BrainDog for ${price}. You pay on Stripe's page, then come straight back here.`,
  signupPaying: 'Opening the payment page',
  signupCancelled: 'The payment was not made, and nothing was charged.',
  signupWaiting: 'Making your BrainDog',
  signupWaitingWhy: 'Your payment is in. This takes a few seconds.',
  signupWaitingSlow: 'This is taking longer than it should. Your BrainDog is made as soon as the payment arrives, so check again in a minute.',
  signupCheckAgain: 'Check again',
  /* SIGN IN'S FOOT, BY WHO MAY SIGN UP (first F4): invite only asks for an invite, open creates one; closed says
     nothing, because nobody can be sent anywhere. Never "Make a record". */
  signupAskInvite: 'New here? Get early access',
  signupCreate: 'New here? Create your BrainDog',
  noRecordTitle: 'Create your BrainDog',
  passkeyFirstFailed: 'That did not add a passkey. You can add one later in Settings, under Recovery.',

  /* People and invitations. Stop and let back in, an invitation to chosen lists, a new link for one that ran
     out, and what a link opens, said on `/invite` before Accept. */
  stopAccess: 'Stop',
  letBackIn: 'Let back in',
  accessStopped: (name: string) => `${name} is stopped. Everything they hold is kept for when you let them back in.`,
  accessLetBack: (name: string) => `${name} is back in, with what they held.`,
  inviteReachLabel: 'What the invitation opens',
  inviteWholeRecord: 'All of it',
  inviteChosenLists: 'Only some of it',
  inviteListNothing: 'Nothing',
  inviteListsHint: 'A part left at Nothing stays closed to them.',
  inviteListsEach: (n: number) => `List by list (${n})`,
  inviteListsFold: 'Fewer choices',
  inviteListsMixed: 'Some lists',
  inviteAddsOnlyLeavesOut:
    'Adds only on all of it leaves out Keys, People and anything kept for owners. To give one of those, pick Only some of it.',
  inviteNewLink: 'New link',
  inviteRanOut: (gives: string, on: string) => `${gives} · ran out on ${on}`,
  /* WHAT THE LINK OPENS, ONE LINE A PART (first F14): "Bills and invoices: you can add". The whole BrainDog is
     "Everything". A level this build has no words for is said as `inviteCanOther`, never the host's own word. */
  inviteGives: (part: string, can: string) => `${part}: ${can}`,
  inviteEverything: 'Everything',
  inviteCan: { owner: 'you own it', decide: 'you can decide', write: 'you can edit', append: 'you can add', read: 'you can read' },
  inviteCanOther: 'you have access',
  /* One list's grant narrowed to the items where one field holds one value, picked in the exception picker and
     said back under the exception on the person's card. */
  exceptionOnly: 'Only items where',
  exceptionEveryRow: 'Every item',
  exceptionIs: 'Is',
  exceptionYes: 'Yes',
  exceptionNo: 'No',
  exceptionOnlySaid: (field: string, value: string) => `Only items where ${field} is ${value}.`,
  exceptionOnlyWords: (words: string) => `Only items where ${words}.`,
  exceptionOnlyOther: 'Only the items a rule set elsewhere picks.',
  exceptionOnlyUnread: 'A rule BrainDog cannot read, so nothing here.',
  exceptionAddedOnly: (name: string, list: string, level: string, field: string, value: string) =>
    `${name} is set to ${level} on ${list}, only where ${field} is ${value}.`,
  /* Closing your account, from Settings > Identity. The records keep their own history, and the Directory's
     nightly copies still hold the account until they age out, so both are said before anybody presses. */
  closeTitle: 'Close your account',
  closeSays:
    'This removes your passkeys, your sessions and your sign-in email, and takes you off every BrainDog you belong to. Each one keeps its own history of what you did there, which its owner can erase. Our nightly backups still hold your account for up to 30 days, and then it is gone from them too.',
  closeStart: 'Close your account',
  closeLabel: 'Your sign-in email, to confirm',
  closeHint: (email: string) => `Type ${email}. This works within 15 minutes of signing in.`,
  closeGo: 'Close my account',
  closeGoing: 'Closing',
  closeDone: 'Your account is closed. We mailed you to say every session has ended.',
  closeLeave: 'Done',
  closeUnreached: 'Your account could not be closed just now. Try again in a minute.',

  /* SETTINGS > BACKUPS AND EXPORT: THE NIGHT'S COPY AND THE LAST EXPORT, drawn by `areas/copies.ts`. */
  copiesLastSized: (when: string, size: string) => `Last copy: ${when}, ${size}`,
  copiesLast: (when: string) => `Last copy: ${when}`,
  copiesFirst: 'First copy tonight',
  copiesLate: 'Late',
  copiesJustNow: 'just now',
  copiesYesterday: 'yesterday',
  copiesAgo: (n: number, unit: 'minute' | 'hour' | 'day') => `${n} ${unit}${n === 1 ? '' : 's'} ago`,
  exportedLast: (when: string) => `Last exported: ${when}`,
  exportedNever: 'Never exported',

  /* SETTINGS > BACKUPS: THIS HOST'S LAST RESTORE TEST, drawn by `areas/copies.ts` `drillLine`. The host's,
     never the record's: only the operator holds the key that opens the copies, so every record reads the same line. */
  drillPassed: (when: string) => `This BrainDog's last restore test: passed ${when}`,
  drillFailed: (when: string) => `This BrainDog's last restore test: failed ${when}`,
  /* A test that opened the Directory's copy and tried no record's copy has proven no restore, so it never reads "passed". */
  drillNoRecord: (when: string) => `This BrainDog's last restore test, ${when}: the Directory's copy opened; no record's copy was tried`,
  drillUnproven: 'Not proven',
  drillNever: 'Never tested',
  drillNeverSaid: 'No copy on this BrainDog has been restored as a test yet',
  drillOverdue: 'Overdue',
} as const;
