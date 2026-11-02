<!--
  Settings > People & sharing: who can see the record, at what level, with which exceptions, the
  invitations still waiting, and erasing a person.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle as settleRows } from '$lib/ui/motion.ts';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  /* THE DECLARATION CACHE, WHICH ONLY THE RECORD FILLS (`held.ts`). */
  import { REGISTERS } from '$lib/record/held.ts';
  import { LEVELS, type Level, type Person } from '$lib/record/schema.ts';
  import { LIST_LEVELS } from '$lib/record/may.ts';
  import { ROLES, ROLE_ORDER } from '$lib/sharing/roles.ts';
  /* THE WRITES THIS AREA MAKES, and the one reading of what the record answered to each. */
  import { addException, dropException, handOverTo, moveLevel, removeAccess, suspendPerson, type Wrote } from '$lib/record/settings-write.ts';
  /* The rows of one list a grant reaches, picked with the exception and said back under it. */
  import { ruleRead, rulesHeld, ruleValue } from '$lib/record/settings-write.ts';
  import { labelOf } from '$lib/record/api.ts';
  import type { FieldDecl } from '$lib/record/schema.ts';
  /* Lane F: erasing a person. */
  import { erasePerson } from '$lib/record/settings-write.ts';
  /* Lane G: inviting somebody by address, with a link the owner sends and nobody mails. */
  import { inviteEmail, inviteLink, readInvites, renewInvite, withdrawInvite, type InviteReach, type Waiting } from '$lib/record/settings-write.ts';
  import { methods, sendInvite } from '$lib/auth.ts';
  import type { Invitation } from '@braindog/client';
  import { dateSaid, relative, since } from 'braindog-render';
  import { recordNow } from '$lib/record/boot-live.ts';
  import { untrack } from 'svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Face from '$lib/ui/Face.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { namesHeld, personSaid, secondSaid } from '../people-said.ts';
  import { placeGroups, type PlaceGroup } from '../../invite-places.ts';
  import { hostedHere, readBilling } from '../../billing.ts';
  import { bareOrigin, settingsState, type AreaProps } from '../settings-state.svelte.ts';

  let { shell }: AreaProps = $props();

  /* THE MEMBERS AND THE OWNER QUESTION ARE SHARED: Identity reads the same list, and every area with
     an owner's control asks the same question (`settings-state.svelte.ts`). The names below are the
     ones this markup reads. */
  const s = settingsState(() => shell);

  /* A SELF-HOST WITH NO MAIL SAYS SO BEFORE THE PRESS (selfhost lane, 2 Nov): the sheet promised "We email it to them" on
     a server that sends nothing, and a new address cannot join without the proof a mail carries. Asked only of a self-host;
     the Cloud always mails. */
  let mailOff = $state(false);
  $effect(() => {
    if (shell.host !== 'self-host') return;
    void methods().then((m) => (mailOff = m.ok && m.value.magic !== true)).catch(() => {});
  });
  const inviteHow = $derived(mailOff ? copy.inviteHowNoMail : copy.inviteHowMail);
  const me = $derived(shell.me);
  const anOwner = $derived(s.anOwner);
  /* TEAMS HELD: the Cloud says so in `/account/billing` (`teams_held`), and the invite form gives way to the sentence. */
  let teamsHeld = $state(false);
  $effect(() => {
    if (!hostedHere(shell)) return;
    void readBilling().then((out) => (teamsHeld = out.ok && out.value.teamsHeld));
  });
  const people = $derived(s.people);
  const peopleFrom = $derived(s.peopleFrom);
  const peopleRefusal = $derived(s.peopleRefusal);
  const lists = $derived(s.lists);
  const listName = s.listName;

  let peopleBusy = $state(false);

  /* THE LADDER IN THE WORDS EVERY PLACE THAT GIVES ACCESS USES (`lib/sharing/roles.ts`, collab pass 2 Nov): "Can decide",
     "Can edit", "Can add", "Can view" and Owner, the same on the whole record and on one list, each with one line of what
     it lets them do and one of what it does not. `member.level` keeps the schema's five; only what is printed changes. */
  const roleSaid = (level: string | null) => (level === null ? copy.noRecordLevel : Object.hasOwn(ROLES, level) ? ROLES[level as Level].name : level);
  const levelSaid = roleSaid;
  const meansOf = (level: string) => (Object.hasOwn(ROLES, level) ? `${ROLES[level as Level].can} ${ROLES[level as Level].cant}` : level);
  /* AN ADMIN INVITES TOO (`team` in the record lets `decide` in, and `teamKeeps` holds them below an owner), so the form
     is drawn to them, offering every role but Owner. */
  const anAdmin = $derived(!anOwner && me.level === 'decide');
  const mayInvite = $derived(anOwner || anAdmin);
  const inviteRoles = $derived(ROLE_ORDER.filter((l) => anOwner || l !== 'owner'));

  /**
   * One level change, sent as `invite({ person, levels, why })`.
   *
   * `45 §5.6`: one method does all three. It reads the old rows, deletes every `member` row for the
   * person, re-inserts from `levels`, and appends an `access.grant` per register raised or added and
   * an `access.revoke` per register lowered or removed, each carrying `why` as its note. So
   * invitation, level change and removal are not three operations with three confirmations; they are
   * one call, and `levels: []` is the removal.
   */
  const levelChange = (who: Person, to: Level | null) => {
    /**
     * A SEGMENT THAT IS ALREADY PRESSED IS INERT, and this answered one with a warning toast.
     *
     * The branch read `${who.name} already reaches ${to}`, written for a third person, and the
     * seed's name for the signed-in human is the literal `You`, so the sentence came out as **"You
     * already reaches owner, but nothing was saved yet."** On your own row every other position is
     * disabled and, with one owner, so is Remove, which made this the ONE pressable control in the
     * whole People area: the single thing the screen let you do was report a change that was not
     * one, ungrammatically, about yourself.
     *
     * Pressing the level somebody already holds changes nothing, so nothing is what it says.
     */
    if (to === who.level) return;
    if (peopleFrom === 'live') void settle(() => moveLevel(apiBase(), who, to), copy.levelMoved(who.name, roleSaid(to)));
    else cannotWrite();
  };

  /* A RECORD KEEPS AT LEAST ONE OWNER: `LEVEL_REQUIRED`, and its fix sentence verbatim (45 §5.6).
     The check is here rather than in the control because it is a fact about the whole list. */
  /* EVERY OWNER COUNTS: `members` has no acceptance date, so an invitation still out is not a row here to discount. */
  const owners = $derived(people.filter((p) => p.level === 'owner').length);
  const lastOwner = (who: Person) => who.level === 'owner' && owners <= 1;

  /* THE LIST IS READ ON ARRIVING AT THE AREA, and again after every write that changes it. `untrack`
     for the reason the Ingest area gives: `opened()` reads and writes the same state. */
  $effect(() => {
    untrack(() => void s.readPeopleNow());
  });

  /**
   * A PRESS THAT CANNOT BE SENT, AND THE TWO CASES THIS SCREEN USED TO CONFLATE.
   *
   * Six presses here branched on `peopleFrom !== 'live'`
   * and pushed `copy.notWritten` (the SAMPLE's sentence), so a colleague the record had refused
   * read, on a real record, in a real session: *"A single-use link would be made, bound to that one
   * address and good for 24 hours, but nothing was saved yet."* That says the press did nothing
   * because the product is a mock-up, and never says the one fact that matters, which is that they
   * are not the owner. Measured as a `read` colleague on a self-host, on the form under a section
   * already drawing the record's refusal four inches above.
   *
   * AND NOW THERE IS ONE CASE. The sample was the only arm allowed to say "yet", and it took a
   * sentence saying what each press would have done; there is no sample now, so every
   * press that cannot be sent is a host that answered no. What is said is its own sentence (`13 §6`),
   * which `readPeople` has already put in `peopleRefusal`, or that the record was not reached.
   */
  function cannotWrite(): void {
    toasts.push(peopleRefusal || copy.recordNotReached, { intent: 'warn' });
  }

  /**
   * One write to who may see the record, then the list read again, so what is drawn is what the record holds.
   * A refusal is the record's sentence; a race reads again too, before anybody presses twice.
   */
  async function settle(write: () => Promise<Wrote<unknown>>, done: string): Promise<boolean> {
    if (peopleBusy) return false;
    peopleBusy = true;
    const at = opened();
    const out = await write();
    closed(true, at);
    peopleBusy = false;
    toasts.push(out.ok ? done : out.fix, { intent: out.ok ? 'good' : 'warn' });
    if (out.ok || (out.from === 'refused' && out.raced)) await s.readPeopleNow();
    return out.ok;
  }

  /**
   * WHAT A WAITING INVITATION GIVES, AND A ONE-LIST INVITATION GIVES NO RECORD LEVEL.
   *
   * The row read a missing level as `read`, and drew an invitation minted with `level: null, registers:
   * { expenses: 'write' }`, as "Reads", which told the owner the bookkeeper would read the whole business.
   * The lists it carries are the whole of what it gives, so they are what
   * the row names, each at its own level.
   */
  const inviteGives = (inv: Invitation): string =>
    inv.level !== null
      ? roleSaid(inv.level)
      : Object.keys(inv.registers).length > 0
        ? Object.entries(inv.registers).map(([id, level]) => `${listName(id)}: ${levelSaid(level)}`).join(', ')
        : levelSaid(null);
  let picking = $state<string | null>(null);
  let pickList = $state('');
  let pickLevel = $state<Level>('read');

  function startException(p: Person) {
    if (peopleFrom !== 'live') {
      cannotWrite();
      return;
    }
    picking = p.id;
    pickList = lists.find((l) => !p.scoped.some((sc) => sc.register === l.id))?.id ?? lists[0]?.id ?? '';
    pickLevel = 'read';
    pickField = '';
    pickValue = '';
  }

  /* ── one grant narrowed to some rows: "only rows where <field> is <value>" ─────────── */

  /**
   * THE FIELDS A RULE CAN NAME, which are the ones a person can say one value of: words, a choice, a link to a row, a
   * number, a yes or no, a day. A document, a secret, an amount, a moment, a length of time and a list of values are
   * left out, because "is" one value is not a question anybody asks of them. A retired field is read by no row.
   */
  const RULE_TYPES: ReadonlySet<string> = new Set(['text', 'enum', 'ref', 'email', 'url', 'int', 'decimal', 'bool', 'day']);
  let pickField = $state('');
  let pickValue = $state('');
  const ruleFields = $derived((REGISTERS[pickList]?.fields ?? []).filter((f) => !f.retired && RULE_TYPES.has(f.type)));
  const ruleField = $derived(ruleFields.find((f) => f.id === pickField));
  /* `null` while the value is not one the field holds, which keeps Add off rather than sending a rule no row meets. */
  const ruleSent = $derived(ruleField === undefined ? null : ruleValue(ruleField.type, pickValue));

  /** A value as the person reads it: a choice's own words, Yes or No, or what was typed. */
  const valueSaid = (f: FieldDecl, value: string): string =>
    f.type === 'bool' ? (value === 'true' ? copy.exceptionYes : copy.exceptionNo) : (f.labels?.[value] ?? value);

  /** Where the value starts when a field is picked: a choice's first value and Yes are picked already, words are typed. */
  function startValue(field: string) {
    const f = ruleFields.find((x) => x.id === field);
    pickValue = f?.type === 'bool' ? 'true' : f?.type === 'enum' ? (f.values?.[0] ?? '') : '';
  }

  /**
   * The sentence under one exception on the card, or `null` when the grant is every row of the list. A rule this screen
   * did not write is said as well as it can be and never rewritten: the next write sends it back as it came.
   */
  function onlySaid(p: Person, register: string): string | null {
    const held = rulesHeld(p);
    if (!Object.hasOwn(held, register)) return null;
    const rule = ruleRead(held[register]);
    if (rule.kind === 'unread') return copy.exceptionOnlyUnread;
    if (rule.kind === 'words') return copy.exceptionOnlyWords(rule.words);
    if (rule.kind === 'other') return copy.exceptionOnlyOther;
    const f = REGISTERS[register]?.fields.find((x) => x.id === rule.field);
    return copy.exceptionOnlySaid(f ? labelOf(f) : rule.field.replace(/_/g, ' '), f ? valueSaid(f, rule.value) : rule.value);
  }

  async function saveException(e: SubmitEvent, p: Person) {
    e.preventDefault();
    if (!pickList) return;
    const field = ruleField;
    const value = ruleSent;
    if (field !== undefined && value === null) return;
    const name = lists.find((l) => l.id === pickList)?.name ?? pickList;
    const only = field === undefined || value === null ? null : { field: field.id, value };
    const said =
      only === null || field === undefined
        ? copy.exceptionAdded(p.name, name, levelSaid(pickLevel))
        : copy.exceptionAddedOnly(p.name, name, levelSaid(pickLevel), labelOf(field), valueSaid(field, String(only.value)));
    const ok = await settle(() => addException(apiBase(), p, pickList, pickLevel, only), said);
    if (ok) picking = null;
  }

  /**
   * STOP, AND LET BACK IN, WHICH REMOVE CANNOT UNDO. Removing somebody deletes what they held, so the owner who only
   * wanted them out for a week had to remember every list to invite them back to. Stopping keeps all of it, and the
   * same press on a stopped person lets them back in with exactly that.
   */
  function stopOrLetBack(p: Person) {
    if (peopleFrom !== 'live') cannotWrite();
    else if (p.suspended) void settle(() => suspendPerson(apiBase(), p, false), copy.accessLetBack(p.name));
    else void settle(() => suspendPerson(apiBase(), p, true), copy.accessStopped(p.name));
  }

  /* ── handing the BrainDog over (collab pass, 2 Nov) ──
     ONE PRESS, ONE CONFIRM, ONE WRITE. Making somebody an owner and then stepping yourself down was two presses on two
     rows, and the second was refused here ("You cannot change your own level here"), so ownership could not move at
     all without a second owner's help. Now it is one sentence of what changes, the reauth the app already asks for a
     stale sign-in, and the record's `handOver`, which does both halves in one transaction. */
  let handing = $state<Person | null>(null);
  const recordName = $derived(shell.index.name || copy.handOverThis);
  async function handOver(p: Person) {
    const done = await settle(() => handOverTo(apiBase(), p), copy.handedOver(said(p), recordName));
    handing = null;
    /* WHAT YOU MAY DO HERE CHANGED, so the whole app reads it again: the rail, Settings and every control. */
    if (done) setTimeout(() => location.reload(), 1200);
  }

  function takeAway(p: Person) {
    if (peopleFrom !== 'live') cannotWrite();
    else void settle(() => removeAccess(apiBase(), p), copy.accessRemoved(p.name));
  }

  function backToLevel(p: Person, register: string) {
    const list = REGISTERS[register]?.name ?? lists.find((l) => l.id === register)?.name ?? register;
    if (peopleFrom !== 'live') cannotWrite();
    else void settle(() => dropException(apiBase(), p, register), copy.exceptionRemoved(list, levelSaid(p.level)));
  }

  /* ── inviting somebody: the link the owner sends, and the ones still waiting ── */

  /**
   * THE LINK IS SHOWN ONCE AND KEPT NOWHERE. The record answers the mint with the only copy of the token and keeps
   * its hash, so this is the one moment it can be copied; `madeLink` is the screen holding it until the person is
   * done with it, and nothing writes it anywhere else.
   */
  let inviteTo = $state('');
  let inviteLevel = $state<Level>('read');
  /**
   * THE WHOLE RECORD, OR CHOSEN LISTS, and a list is chosen by giving it a level. The one-line form could only say
   * "the whole record at this level", so a bookkeeper meant for Money alone was invited to everything and demoted
   * after they accepted, and until then the link opened more than the owner meant it to.
   */
  let inviteReach = $state<'record' | 'lists'>('record');
  let inviteLists = $state<Record<string, Level | ''>>({});
  const REACHES: readonly { reach: 'record' | 'lists'; said: string }[] = [
    { reach: 'record', said: copy.inviteWholeRecord },
    { reach: 'lists', said: copy.inviteChosenLists },
  ];
  let inviting = $state(false);
  /* WHAT THE FORM STILL NEEDS, said under the button when it is pressed: the button is
     never drawn grey for a field left empty, which read as broken; it says what is missing and goes to it. */
  let inviteWhy = $state('');
  const inviteNeeds = { email: 'Add their email so the link is bound to it.', lists: 'Give at least one list a level.' } as const;
  /* `unsent` IS THE HOST'S OWN SENTENCE WHEN IT COULD NOT MAIL (a self-host with no mail set up says why, and who can still
     use the link), and null when it said nothing, which keeps the old copy-it-yourself line. */
  let madeLink = $state<{ email: string; link: string; sent: boolean; unsent: string | null } | null>(null);
  let waitingInvites = $state<Waiting[]>([]);

  /** What the form would send, or `null` while it gives nothing: no address, or chosen lists with none given a level. */
  const reachChosen = $derived.by((): InviteReach | null => {
    if (inviteReach === 'record') return { level: inviteLevel };
    const registers: Record<string, Level> = {};
    for (const [list, level] of Object.entries(inviteLists)) if (level) registers[list] = level;
    return Object.keys(registers).length > 0 ? { registers } : null;
  });

  function pickListLevel(list: string, said: string) {
    const level = (LIST_LEVELS as readonly string[]).includes(said) ? (said as Level) : '';
    inviteLists = { ...inviteLists, [list]: level };
  }

  /* THE PLACES, each with the lists in it (`invite-places.ts`), and which of them are opened list by list. */
  const groups = $derived(
    placeGroups(
      lists,
      (shell.lists ?? []).map((l) => ({ ...l, icon: shell.index.registers.find((r) => r.id === l.id)?.icon })),
      shell.nav ?? [],
    ),
  );
  let openGroups = $state<string[]>([]);
  const MIXED = 'mixed';
  /** One level when every list of a place is at it, else `mixed`, which the select says as "Some lists". */
  const groupLevel = (g: PlaceGroup): string => {
    const at = new Set(g.lists.map((l) => inviteLists[l.id] ?? ''));
    return at.size === 1 ? [...at][0]! : MIXED;
  };
  function pickGroupLevel(g: PlaceGroup, said: string) {
    if (said === MIXED) return;
    const level = (LIST_LEVELS as readonly string[]).includes(said) ? (said as Level) : '';
    inviteLists = { ...inviteLists, ...Object.fromEntries(g.lists.map((l) => [l.id, level])) };
  }
  function toggleGroup(key: string) {
    openGroups = openGroups.includes(key) ? openGroups.filter((k) => k !== key) : [...openGroups, key];
  }

  $effect(() => {
    untrack(() => void readInvitesNow());
  });

  /** Every invitation still waiting. A host older than invitations, or one that refused, lists none. */
  async function readInvitesNow() {
    const out = await readInvites(apiBase());
    waitingInvites = out.from === 'live' ? out.invites : [];
  }

  /** One link, for one address, at the level chosen. Nothing is mailed: the owner sends it themselves. */
  async function makeInvite(e: SubmitEvent) {
    e.preventDefault();
    const email = inviteTo.trim();
    const reach = reachChosen;
    if (inviting) return;
    if (!email || !reach) {
      inviteWhy = !email ? inviteNeeds.email : inviteNeeds.lists;
      if (!email) document.getElementById('invite-email')?.focus();
      return;
    }
    inviteWhy = '';
    if (peopleFrom !== 'live') {
      cannotWrite();
      return;
    }
    if (await mint(() => inviteEmail(apiBase(), email, reach))) {
      /* THE SHEET CLOSES ON THE LINK, which the tile then holds (G20). */
      inviteOpen = false;
      inviteTo = '';
      inviteLists = {};
      /* BACK TO ALL OF IT, so the link made is under a short form and not under thirty lists. */
      inviteReach = 'record';
      openGroups = [];
    }
  }

  /**
   * One link made, from the form or from a listed row, then shown once and the list read again.
   * `inviting` is the in-flight guard for both, so a double press makes one link and not two that withdraw each other.
   */
  /* THE INVITATION'S FORM IS A SHEET (G20): the page leads with who is in, and "Invite a person" is the tile's action. */
  let inviteOpen = $state(false);

  /** The host's sentence for an invitation it did not mail, when it gave one. */
  function unsentOf(sent: Awaited<ReturnType<typeof sendInvite>> | null): string | null {
    return sent && !sent.ok && sent.kind === 'refused' && sent.fix ? sent.fix : null;
  }

  async function mint(make: () => ReturnType<typeof inviteEmail>): Promise<boolean> {
    inviting = true;
    const at = opened();
    const out = await make();
    closed(true, at);
    inviting = false;
    if (!out.ok) {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    /* THE LINK IS BUILT ON THE BARE HOST, because `/invite` is the person's before it is a record's. */
    /* AND MAILED TO THEM AT ONCE (collab pass, 2 Nov), with the proof inside it for an address new here, so they open one
       mail and press Join. A host that cannot mail says so, and the link is there to copy either way. */
    const sent = await sendInvite(out.value.token).catch(() => null);
    madeLink = { email: out.value.invitation.email, link: inviteLink(bareOrigin(), out.value.token), sent: sent?.ok === true, unsent: unsentOf(sent) };
    if (sent?.ok === true) toasts.push(copy.inviteEmailed(out.value.invitation.email), { intent: 'good' });
    await readInvitesNow();
    return true;
  }

  /**
   * A NEW LINK FOR A ROW ALREADY LISTED, waiting or run out, giving what it gave. The record withdraws the old link as
   * it makes this one, so the row is replaced rather than joined by a second.
   */
  async function renew(inv: Waiting) {
    if (inviting) return;
    if (peopleFrom !== 'live') {
      cannotWrite();
      return;
    }
    await mint(() => renewInvite(apiBase(), inv));
  }

  /** The one copy, to the clipboard, with the toast that says whether it got there. */
  function copyLink() {
    if (madeLink) void clipboard.put(madeLink.link, copy.inviteLinkLabel);
  }

  /** Withdraw one. Its link stops working at once, and the list is read again. */
  async function withdraw(inv: Invitation) {
    if (peopleFrom !== 'live') {
      cannotWrite();
      return;
    }
    const done = await settle(() => withdrawInvite(apiBase(), inv.id), copy.inviteWithdrawn(inv.email));
    if (done) await readInvitesNow();
  }

  /* ── erasing a person ── */

  let eraseOpen = $state(false);
  let eraseWho = $state('');
  let eraseBasis = $state('');
  let erasePersonId = $state('');
  let eraseBusy = $state(false);

  /* THE FORM OPENS ONLY ON A RECORD THAT ANSWERED WITH ITS PEOPLE; anywhere else the press says why it cannot. */
  function startErase() {
    if (peopleFrom !== 'live') cannotWrite();
    else eraseOpen = true;
  }

  async function eraseNow() {
    if (eraseBusy) return;
    eraseBusy = true;
    const at = opened();
    const who = eraseWho.trim();
    const out = await erasePerson(apiBase(), { subjects: who ? [who] : [], ...(erasePersonId ? { personId: erasePersonId } : {}), basis: eraseBasis.trim() });
    closed(true, at);
    eraseBusy = false;
    if (out.ok) {
      toasts.push(copy.erasedRows(out.value.rows), { intent: 'good' });
      eraseOpen = false;
      eraseWho = '';
      eraseBasis = '';
      erasePersonId = '';
      await s.readPeopleNow();
    } else toasts.push(out.fix, { intent: 'warn' });
  }

  /**
   * WHETHER THERE IS ANYBODY TO COMPARE YOURSELF WITH, which is what most of this area is about.
   *
   * A level, an exception, a removal and an erasure are all facts about one person MEASURED
   * AGAINST another, and on a record whose only person is you there is no other. The product
   * should be smaller at one row than at four hundred and grow by
   * itself; this is the line that lets the People area do it.
   */
  const alone = $derived(people.length < 2);

  /**
   * AND YOU CANNOT TAKE YOUR OWN OWNERSHIP AWAY FROM THIS SCREEN.
   *
   * `lastOwner` is a fact about the RECORD (how many owners exist) and never about *you*, so with
   * a second owner present every control on your own row went live, `read` included, with no
   * confirmation. The toast would have read "You would move from owner to read across this record",
   * after which you cannot reach this screen to undo it: the one action on the surface that removes
   * your own way back.
   *
   * It is a REFUSAL WITH A ROUTE, not a wall. `45 §5.6` has one method for every level change, and
   * another owner can still do this to you, which is the point of there being more than one. What
   * is refused is doing it to yourself, alone, by pressing a segment.
   */
  const self = (who: Person) => who.id === me.person;
  /**
   * WHAT A ROW CALLS ITS PERSON, and it was their email. `personOf` puts the address in `name` when
   * the record holds none, which on a real record is everybody, so the face, the name slot and the
   * level control all said `ben@ashgrove.co.uk`. `people-said.ts` says it the way `/audit` and Home
   * do, and the address moves to the detail line, where it tells two people apart.
   */
  const peopleNames = $derived(namesHeld(people));
  const said = (who: Person) => personSaid(who, me.person, peopleNames);

</script>

<!--
  IT WAS A LIST WITH NO CONTROLS, on the screen called People & sharing.

  You could see who had access and could not change it, could not invite anybody, and could
  not take it away: one of the five areas that were "real", and the one whose whole subject
  is a thing you do. `19 §2` names it beside `recovery` as an area an earlier draft dropped.

  `45 §5.6` HAS ONE METHOD FOR ALL THREE, which is why this is one control and not three:
  `invite({ person, levels, why })` deletes the person's `member` rows and re-inserts from
  `levels`, so a level change and a removal are the same call with a different argument.
-->
<!--
  ONE PERSON IS NOT A COMPARISON, AND THIS AREA DREW THE WHOLE APPARATUS OF ONE.

  On a record whose only person is you: a six-position level segment with five positions
  greyed, two standing hints explaining the greyness, an exceptions control for exceptions to
  a level nobody else holds, a mock invitation, and a red erasure whose only candidate is the
  reader. Every one of those is a fact about a comparison with nothing to compare, and the
  heading counted the reader as a person on their own record.

  The product should be SMALLER at one row than at
  four hundred and get bigger by itself. So at one person this area is one sentence and one
  control, and the segments, the exceptions, the two hints and the erasure appear on the day
  a second person exists, which is the day each of them means something.
-->
<!-- NOTHING WHILE IT IS READ: an empty tile under its title read as nobody at all. -->
{#if peopleFrom === 'reading'}
{:else if peopleFrom === 'refused' || peopleFrom === 'unrouted'}
  <Tile icon="user-check" class="section" data-surface="tile" title={copy.whoCanSee}>
    <div class="section-body">
      <!-- A COLLEAGUE IS TOLD WHO DECIDES IT, in plain words, not the ladder's "This needs owner, and you have write access". -->
      {#if !anOwner && me.level !== 'decide'}
        <p class="reading">{copy.peopleOwnersOnly}</p>
      {:else}
        <Empty kind="error" title={peopleRefusal} />
      {/if}
    </div>
  </Tile>
{:else if alone}
  <!-- ONE PERSON IS THE TILE'S SENTENCE AND NOTHING ELSE: there is nobody to list and nobody to compare. Its glyph is the
       tile's own in every state, so the two faces stay Groups' alone. -->
  <Tile icon="user-check" title={copy.whoCanSee}>
    <p class="reading">{copy.onlyPerson}</p>
  </Tile>
{:else}
  <Tile icon="user-check" class="section" data-surface="tile" title={copy.whoCanSee} count={people.length || undefined}>
    <div class="section-body">
      <p class="hint">{copy.accessScope}</p>
      <!-- TWO LINES PER PERSON, and not the five-column `.line` every other ledger uses.

           The control is five buttons wide and the sentence beside it is a full clause, so in one
           row of that grid the email clipped mid-address and the sentence saying what the person
           can DO was squeezed out of existence, leaving five bare ladder words as the only
           answer to the question this screen exists for. Who they are on the first line, what they
           can do on the second, and the sentence directly under the control that sets it. -->
      <ul class="whos">
        {#each people as p (p.id)}
          <li class="who" in:lineIn out:dismiss animate:flip={settleRows()}>
            <div class="who-head">
              <Face name={said(p)} you={self(p)} kind="person" />
              <span class="who-name">{said(p)}</span>
              <!-- THE EMAIL, because that is what the invitation is bound to (12 §3) and what
                   tells two people with one name apart. And WHEN, because access with no date is
                   a list you cannot audit. -->
              <!-- AND WHETHER THEY HAVE LOOKED. `20 §6` (*"Read marks on decisions: who has
                   seen the thing that binds them"*) is the one row of its table this screen
                   could not draw: `member.seen_at` has been in the DDL since migration 0001 and
                   `members()` returns it per person, and the browser's mirror stopped one column
                   short. So the screen said what four people MAY do and nothing about whether any
                   of them had been.

                   ONLY FOR SOMEBODY WHO HAS ACCEPTED. An invitation still out has also never been
                   looked at, and saying so twice in one line is saying nothing. -->
              <span class="who-detail">
                <!-- A RECORD KEEPS NO ACCEPTANCE DATE, so it says when they last looked and nothing it cannot know. -->
                <!-- AND NOTHING ABOUT LOOKING ON YOUR OWN ROW: "has not opened it" under the person reading it was false. -->
                {#if self(p)}{secondSaid(p, said(p)) ?? ''}{:else}{#if secondSaid(p, said(p))}{secondSaid(p, said(p))}{' · '}{/if}{p.seen ? copy.lastLooked(since(p.seen, Date.now())) : copy.neverLooked}{#if p.suspended}{' · '}{copy.suspendedSince(relative(p.suspended, Date.now()))}{/if}{/if}
              </span>
              {#if !self(p)}
              <span class="who-do">
              <!-- STOP IS NOT FOR YOURSELF, for the reason your own level is not: it is the press that removes your own
                   way back to this screen. Nor for the last owner, who would leave the record with nobody to let anybody
                   back in. -->
              <!-- WHAT THEY DID HERE (collab pass, 2 Nov): Activity, held to their own lines. -->
              <Button weight="bare" href={`/audit?by=${encodeURIComponent(p.id)}`}>{copy.theyDid}</Button>
              {#if anOwner && p.level !== 'owner' && !p.suspended}
                <Button weight="bare" disabled={peopleBusy} aria-haspopup="dialog" onclick={() => (handing = p)}>{copy.handOverPress}</Button>
              {/if}
              <Button
                weight="bare"
                disabled={lastOwner(p) || self(p) || peopleBusy}
                aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                onclick={() => stopOrLetBack(p)}
              >{p.suspended ? copy.letBackIn : copy.stopAccess}</Button>
              <Button
                weight="bare"
                tone="bad"
                disabled={lastOwner(p) || self(p) || peopleBusy}
                aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                onclick={() => takeAway(p)}
              >{copy.removeAccess}</Button>
              </span>
              {/if}
            </div>
            <div class="who-level">
              <!--
                SIX OPTIONS, AND THE SIXTH IS NOT A LEVEL.

                `member.level` is five words and `member` is a ROW that may not exist, and
                `members.ts` records what it cost to conflate the two. `access()` first promoted a
                scoped level to the record-wide one, so somebody invited to one list as its owner
                owned the record; the fix then gave a scoped-only member `read`, which hands an
                APPENDER a record-wide read, and `append`'s point is that it does not read. `null`
                is the answer both versions were reaching for, and a control offering five words
                could not say it.

                It is first, not last: it is the state somebody is in before you decide anything,
                and reading left to right the row now says *nothing on the record, then these
                lists*, which is the sentence "invite the bookkeeper" makes.
              -->
              <Segmented class="levels" role="group" aria-label={copy.levelFor(said(p))}>
                <!-- THE SIXTH OPTION IS NOT A LEVEL, AND ONLY THE COMMENT SAID SO. It rendered as
                     the first of six identical chips with the same `aria-pressed`, inside a group
                     labelled "What <name> can do", so a screen reader heard six equivalent levels
                     and the screen showed six equivalent chips. `13 §5.1`: the meaning cannot live
                     in the styling alone. The accessible name says what it is, and the chip is set
                     apart from the ladder beside it. -->
                {#each [null, ...LEVELS] as level}
                  <button
                    type="button"
                    class="segment"
                    class:level-none={level === null}
                    data-on={p.level === level ? '' : undefined}
                    aria-pressed={p.level === level ? 'true' : 'false'}
                    aria-label={level === null ? copy.noRecordLevelMeans : undefined}
                    disabled={(lastOwner(p) && level !== 'owner') || (self(p) && level !== p.level) || peopleBusy}
                    aria-describedby={lastOwner(p) && level !== 'owner'
                      ? 'last-owner'
                      : self(p) && level !== p.level
                        ? 'own-level'
                        : undefined}
                    onclick={() => levelChange(p, level)}
                  >{roleSaid(level)}</button>
                {/each}
              </Segmented>
              <!-- BELOW 520PX THE LADDER IS A SELECT. Six segments wrap to three lines on a phone and the chosen one lands
                   wherever the wrap put it; one select is one line, 44px tall, with the same six answers and the same
                   ones disabled. Both are drawn and CSS shows one, so each keeps its own accessible name. -->
              <select
                class="ex-select level-select"
                aria-label={copy.levelFor(said(p))}
                value={p.level ?? ''}
                disabled={lastOwner(p) || self(p) || peopleBusy}
                aria-describedby={lastOwner(p) ? 'last-owner' : self(p) ? 'own-level' : undefined}
                onchange={(e) => {
                  const to = e.currentTarget.value;
                  levelChange(p, (LEVELS as readonly string[]).includes(to) ? (to as Level) : null);
                  /* THE SELECT SHOWS WHAT THE RECORD HOLDS, not what was picked: the list read after the write moves it,
                     and a refusal leaves it where it was rather than on a level nobody has. */
                  e.currentTarget.value = p.level ?? '';
                }}
              >
                {#each [null, ...LEVELS] as level}<option value={level ?? ''}>{roleSaid(level)}</option>{/each}
              </select>
              <!-- WHAT THE SELECTED ONE MEANS, said once, in a sentence, under the control that
                   sets it. Five ladder words with nothing explaining them is the schema's
                   vocabulary on the screen that decides who can change somebody's business. -->
              <p class="means">{p.level === null ? copy.noRecordLevelMeans : meansOf(p.level)}</p>

              <!--
                THE EXCEPTIONS, WHICH ARE THE MATRIX.

                `20 §1` materialises person × register × level and `19 §2` names the absence of a
                screen for it as the reason this area was added back. Drawing the whole grid (five
                people down, fourteen lists across) is the shape that makes a person close the
                page: most cells are the same value, and the same value is the record level one
                line up.

                So the record level is the answer and these are the EXCEPTIONS to it. Somebody with
                none has one line and nothing else, which is almost everybody; somebody with two
                has two, named, with what they hold on each. It is the same information and it is
                the difference between a table nobody reads and a sentence anybody can.
              -->
              {#if p.scoped.length > 0}
                <ul class="exceptions">
                  {#each p.scoped as ex}
                    <li>
                      <span class="ex-list">{lists.find((l) => l.id === ex.register)?.name ?? REGISTERS[ex.register]?.name ?? ex.register}</span>
                      <!-- THE LEVEL, AND THEN WHAT IT MEANS. The cell showed the sentence alone (the
                           same sentence the record level one line up already shows), so you could
                           not see at a glance whether an exception was above or below it, which is
                           the one thing a matrix is for. The word is the comparison; the sentence
                           is what the word means. -->
                      <span class="ex-word">{levelSaid(ex.level)}</span>
                      <span class="ex-level">{ROLES[ex.level]?.can ?? ex.level}</span>
                      <!-- NOT THE DANGER TONE. Going back to their level undoes an exception, which is
                           the safe direction, and red on it said the opposite. -->
                      <Button
                        weight="bare"
                        disabled={peopleBusy}
                        onclick={() => backToLevel(p, ex.register)}
                      >{copy.removeException}</Button>
                      <!-- WHICH ROWS OF THE LIST, when the grant is narrowed, said as a sentence on its own line under
                           the exception it narrows, since it is part of what they hold there. -->
                      {#if onlySaid(p, ex.register) !== null}<span class="ex-only">{onlySaid(p, ex.register)}</span>{/if}
                    </li>
                  {/each}
                </ul>
              {/if}
              <!-- `45 §5.6` HAS ONE METHOD FOR ALL OF IT: `invite` takes the record level and the
                   register map together, so adding an exception is the same call as changing a
                   level. One control, because one call.

                   IN ITS OWN ROW, because as the next sibling after the `<ul>` it floated up beside
                   the list on a wide screen and read as belonging to the first exception. -->
              <div class="ex-add">
              {#if picking === p.id}
                <!-- ONE LIST AND ONE LEVEL, then Add. It is the same `invite` as a level change, carrying the
                     exceptions that stay, so nothing else they hold moves. -->
                <form class="ex-pick" onsubmit={(e) => saveException(e, p)}>
                  <label class="ex-field">
                    <span class="ex-label">{copy.exceptionList}</span>
                    <select class="ex-select" bind:value={pickList} onchange={() => {
                      pickField = '';
                      pickValue = '';
                    }}>
                      {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
                    </select>
                  </label>
                  <label class="ex-field">
                    <span class="ex-label">{copy.exceptionLevel}</span>
                    <!-- ONE LIST TAKES THE THREE LEVELS THE RECORD HONOURS THERE (`20 §1`): a list's own Decides or
                         Owner answers nothing more than Edits does, so offering them described a power it does not grant. -->
                    <select class="ex-select" bind:value={pickLevel}>
                      {#each LIST_LEVELS as level}<option value={level}>{levelSaid(level)}</option>{/each}
                    </select>
                  </label>
                  <!-- AND WHICH ROWS OF IT: every row, or only those where one of the list's own fields holds
                       one value, the value picked from a choice or typed. Offered only when the list's fields are known
                       here, because a field this screen cannot name is not one it can offer. -->
                  {#if ruleFields.length > 0}
                    <div class="ex-where">
                      <label class="ex-field">
                        <span class="ex-label">{copy.exceptionOnly}</span>
                        <select class="ex-select" bind:value={pickField} onchange={(e) => startValue(e.currentTarget.value)}>
                          <option value="">{copy.exceptionEveryRow}</option>
                          {#each ruleFields as f (f.id)}<option value={f.id}>{labelOf(f)}</option>{/each}
                        </select>
                      </label>
                      {#if ruleField}
                        <label class="ex-field">
                          <span class="ex-label">{copy.exceptionIs}</span>
                          {#if ruleField.type === 'enum' && (ruleField.values?.length ?? 0) > 0}
                            <select class="ex-select" bind:value={pickValue}>
                              {#each ruleField.values ?? [] as v (v)}<option value={v}>{ruleField.labels?.[v] ?? v}</option>{/each}
                            </select>
                          {:else if ruleField.type === 'bool'}
                            <select class="ex-select" bind:value={pickValue}>
                              <option value="true">{copy.exceptionYes}</option>
                              <option value="false">{copy.exceptionNo}</option>
                            </select>
                          {:else}
                            <span class="field ex-value">
                              <input
                                class="field-input"
                                type={ruleField.type === 'day' ? 'date' : ruleField.type === 'email' ? 'email' : ruleField.type === 'url' ? 'url' : 'text'}
                                inputmode={ruleField.type === 'int' ? 'numeric' : ruleField.type === 'decimal' ? 'decimal' : undefined}
                                autocomplete="off"
                                bind:value={pickValue}
                              />
                            </span>
                          {/if}
                        </label>
                      {/if}
                    </div>
                  {/if}
                  <Button weight="primary" type="submit" disabled={peopleBusy || !pickList || (ruleField !== undefined && ruleSent === null)}>{copy.exceptionAdd}</Button>
                  <Button weight="bare" onclick={() => (picking = null)}>{copy.exceptionCancel}</Button>
                </form>
              {:else}
              <Button
                weight="bare"
                disabled={peopleBusy}
                onclick={() => startException(p)}
              ><Icon name="plus" size="s" />{copy.addException}</Button>
              {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
      <!-- `LEVEL_REQUIRED`'s own fix sentence, and it is always on screen rather than inside the
           refusal: a disabled control whose reason arrives only after you press it is a control
           that has already wasted the press. -->
      <p class="hint" id="last-owner">{copy.lastOwner}</p>
      <!-- BESIDE THE CONTROL, NOT AFTER THE PRESS, for the reason the line above it gives. -->
      <p class="hint" id="own-level">{copy.ownLevel}</p>
    </div>
  </Tile>
  <Sheet open={handing !== null} onclose={() => (handing = null)} title={handing ? copy.handOverTitle(said(handing), recordName) : ''}>
    {#if handing}
      <div class="hand">
        <p>{copy.handOverThey(said(handing))}</p>
        <p>{copy.handOverYou}</p>
        <p class="hint">{copy.handOverBack(said(handing))}</p>
        <div class="hand-do">
          <Button weight="primary" disabled={peopleBusy} aria-busy={peopleBusy} onclick={() => handing && void handOver(handing)}>{copy.handOverDo}</Button>
          <Button weight="quiet" onclick={() => (handing = null)}>{copy.handOverKeep}</Button>
        </div>
      </div>
    {/if}
  </Sheet>
{/if}

<!--
  AND THE FORM IS THE OWNER'S, DRAWN TO THE OWNER.

  This form was drawn in full, four inches
  under a section already saying *"This needs owner, and you have read access"*, to every
  colleague at every level. Driven again here as a `read` colleague: the address field, the
  five-option level select and `Invite a person`, none of them disabled, and the press answered
  with the demo's "nothing was saved yet".

  NOTHING IS SAID IN ITS PLACE, because the section above it is already saying it. The record's
  own refusal is on this screen, in the record's own words, over the list this form adds to.
-->
{#if mayInvite && teamsHeld}
<Tile icon="user-plus" class="section" data-surface="tile" title={copy.inviteTitle}>
  <div class="section-body">
    <p class="hint">{copy.inviteHeld}</p>
  </div>
</Tile>
{:else if mayInvite}
{#snippet inviteAction()}
  <Button weight="primary" size="sm" aria-haspopup="dialog" onclick={() => (inviteOpen = true)}><Icon name="plus" size="s" />{copy.invitePerson}</Button>
{/snippet}
<Tile icon="user-plus" class="section" data-surface="tile" title={copy.inviteTitle} actions={inviteAction} count={waitingInvites.length || undefined}>
  <div class="section-body">
    <!-- NO MAIL LEAVES THIS HOST, and the line says so beside the control rather than after the press: the owner sends
         the link themselves, and somebody expecting an email would wait for one that never comes. -->
    <p class="hint">{inviteHow}</p>
    {#if mailOff}<code class="invite-command">{copy.inviteCommand}</code>{/if}
    <Sheet bind:open={inviteOpen} title={copy.invitePerson} subtitle={mailOff ? copy.inviteHowNoMailShort : inviteHow}>
    <!-- ONE COLUMN AT EVERY WIDTH: the address, what it opens, then the level or the lists, then the button. It was one
         row, and a row has no room for "these lists, at these levels", which is the sentence inviting a bookkeeper is. -->
    <form class="code-form invite-form" onsubmit={makeInvite}>
      <label class="ex-label" for="invite-email">{copy.inviteEmailLabel}</label>
      <div class="field invite-email">
        <input
          class="field-input"
          id="invite-email"
          type="email"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          bind:value={inviteTo}
          oninput={() => (inviteWhy = '')}
        />
      </div>
      <Segmented class="reach" role="group" aria-label={copy.inviteReachLabel}>
        {#each REACHES as r (r.reach)}
          <button
            type="button"
            class="segment"
            data-on={inviteReach === r.reach ? '' : undefined}
            aria-pressed={inviteReach === r.reach ? 'true' : 'false'}
            onclick={() => (inviteReach = r.reach)}
          >{r.said}</button>
        {/each}
      </Segmented>
      {#if inviteReach === 'record'}
        <!-- THE ROLES AS CHOICES THAT SAY WHAT THEY GIVE (collab pass, 2 Nov): a select of five bare words was the whole
             explanation an owner got before handing over his business. Each is its name, what it lets them do and what
             it does not, and "Who can do what" lays all five side by side. -->
        <fieldset class="roles">
          <legend class="ex-label">{copy.inviteLevelLabel}</legend>
          {#each inviteRoles as level (level)}
            <label class="role" data-on={inviteLevel === level ? '' : undefined}>
              <input type="radio" name="invite-role" value={level} bind:group={inviteLevel} />
              <span class="role-text">
                <span class="role-name">{ROLES[level].name}</span>
                <span class="role-can">{ROLES[level].can}</span>
                <span class="role-cant">{ROLES[level].cant}</span>
              </span>
            </label>
          {/each}
          <a class="roles-all" href="/settings/roles">{copy.rolesCompare}</a>
        </fieldset>
        <!-- WHAT A WHOLE-RECORD "ADDS ONLY" LEAVES OUT, said before the link is made (`20 §1`): the record keeps an
             appender off Keys, People and any list declared for owners, and an owner who meant them to add keys would
             otherwise learn it from the colleague. -->
        {#if inviteLevel === 'append'}<p class="hint">{copy.inviteAddsOnlyLeavesOut}</p>{/if}
      {:else}
        <p class="hint">{copy.inviteListsHint}</p>
        <!-- A ROW PER PLACE (Money, Projects, Work), EACH WITH ITS SELECT, which sets every list in it: "Projects, and not
             Money" is two presses. "List by list" opens the place's own lists, each with its select, for the rest. The
             three levels one list honours (`LIST_LEVELS`), and Nothing first, because nothing is what every list gives
             until the owner says. -->
        <ul class="invite-lists">
          {#each groups as g (g.key)}
            {@const at = groupLevel(g)}
            <li class="invite-place">
              <span class="invite-place-head">
                <label class="invite-list-name invite-place-name" for="invite-place-{g.key}">{g.name}</label>
                {#if g.lists.length > 1}
                  <button type="button" class="invite-each" aria-expanded={openGroups.includes(g.key) ? 'true' : 'false'} onclick={() => toggleGroup(g.key)}>
                    {openGroups.includes(g.key) ? copy.inviteListsFold : copy.inviteListsEach(g.lists.length)}
                  </button>
                {/if}
              </span>
              <select class="ex-select" id="invite-place-{g.key}" value={at} onchange={(e) => pickGroupLevel(g, e.currentTarget.value)}>
                {#if at === MIXED}<option value={MIXED} disabled>{copy.inviteListsMixed}</option>{/if}
                <option value="">{copy.inviteListNothing}</option>
                {#each LIST_LEVELS as level}<option value={level}>{levelSaid(level)}</option>{/each}
              </select>
            </li>
            {#if openGroups.includes(g.key)}
              {#each g.lists as l (l.id)}
                <li class="invite-one">
                  <label class="invite-list-name" for="invite-list-{l.id}">{l.name}</label>
                  <select
                    class="ex-select"
                    id="invite-list-{l.id}"
                    value={inviteLists[l.id] ?? ''}
                    onchange={(e) => pickListLevel(l.id, e.currentTarget.value)}
                  >
                    <option value="">{copy.inviteListNothing}</option>
                    {#each LIST_LEVELS as level}<option value={level}>{levelSaid(level)}</option>{/each}
                  </select>
                </li>
              {/each}
            {/if}
          {/each}
        </ul>
      {/if}
      <div class="invite-send">
        <Button weight="primary" type="submit" disabled={inviting} aria-busy={inviting}>
          <Icon name="plus" size="s" />{inviting ? copy.inviteMaking : copy.invitePerson}
        </Button>
        {#if inviteWhy}<p class="invite-why" role="alert">{inviteWhy}</p>{/if}
      </div>
    </form>
    </Sheet>

    {#if madeLink}
      <!-- ONCE. The record keeps the hash and hands back the only copy of the link, so leaving this screen is
           the last of it; Done takes it off the screen deliberately rather than by navigation. -->
      <div class="invite-made">
        <p class="hint">{madeLink.sent ? copy.inviteEmailed(madeLink.email) : `${copy.inviteLinkReady(madeLink.email)} ${madeLink.unsent ?? copy.inviteNoMail}`}</p>
        <div class="field-row-controls">
          <div class="field field-lg">
            <input class="field-input" id="invite-link" type="text" readonly aria-label={copy.inviteLinkLabel} value={madeLink.link} />
          </div>
          <Button weight={madeLink.sent ? 'quiet' : 'primary'} onclick={copyLink}>{copy.inviteCopyLink}</Button>
          <Button weight="quiet" onclick={() => (madeLink = null)}>{copy.inviteDone}</Button>
        </div>
      </div>
    {/if}

    {#if waitingInvites.length > 0}
      <p class="invites-head">{copy.invitesWaiting}</p>
      <ul class="invites">
        {#each waitingInvites as inv (inv.id)}
          <!-- A ROW THAT RAN OUT STAYS, SAYING SO, with New link beside Withdraw: the owner who hears nothing sees why,
               and one press makes a fresh link giving what this one gave. A waiting row has New link too, for the
               link that was copied somewhere and lost. -->
          <li class="invite" data-expired={inv.expired ? '' : undefined} in:lineIn out:dismiss animate:flip={settleRows()}>
            <span class="invite-who">{inv.email}</span>
            <span class="invite-when">{inv.expired
              ? copy.inviteRanOut(inviteGives(inv), dateSaid(inv.expires_at.slice(0, 10), recordNow()))
              : copy.inviteWaitingRow(inviteGives(inv), dateSaid(inv.expires_at.slice(0, 10), recordNow()))}</span>
            <span class="invite-do">
              <Button weight="bare" disabled={inviting || peopleBusy} onclick={() => void renew(inv)}>{copy.inviteNewLink}</Button>
              <Button weight="bare" tone="bad" disabled={peopleBusy} onclick={() => void withdraw(inv)}>{copy.inviteWithdraw}</Button>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Tile>
{/if}

<!-- THE READ-ONLY LINKS ARE IN SHARING'S SHARED CARD, and "Read what you already have" is under Tidy up (audit
     25 October): one card said what is shared, and linking old payments is tidying, not sharing. -->

<!-- AND ERASE ARRIVES WITH THE SECOND PERSON. On a record whose only person is you, the one
     candidate for a red, irreversible "Erase a person" is the person reading it. -->
<!-- AND IT IS THE OWNER'S: `erase` is an ADMIN method, so for anybody else this was a red
     button and three fields over a cascade the record would refuse. -->
{#if !alone && anOwner}
  <!-- `53 §5.8`: the owner erases a person from here, and it is the one control on this screen
       that is not about access at all: it is `02 §10`'s cascade over sixteen stores, in one
       transaction. It says which, because "erase" without a subject is a word nobody can act on. -->
  <Tile icon="trash" class="section" data-surface="tile" title={copy.erasePerson}>
    <div class="section-body">
      <div class="danger">
        <p class="danger-title">{copy.eraseWhat}</p>
        {#if eraseOpen}
          <label class="code-label" for="erase-person">{copy.eraseWhichPerson}</label>
          <div class="field field-lg">
            <select class="field-input" id="erase-person" bind:value={erasePersonId}>
              <option value="">{copy.eraseNobody}</option>
              {#each people.filter((p) => p.level !== 'owner') as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
          </div>
          <label class="code-label" for="erase-who">{copy.eraseWho}</label>
          <div class="field field-lg">
            <input class="field-input" id="erase-who" type="text" autocomplete="off" spellcheck="false" bind:value={eraseWho} />
          </div>
          <label class="code-label" for="erase-basis">{copy.eraseBasis}</label>
          <div class="field field-lg">
            <input class="field-input" id="erase-basis" type="text" autocomplete="off" bind:value={eraseBasis} />
          </div>
          <div class="row-actions">
            <Button
              tone="bad"
              disabled={eraseBusy || (!eraseWho.trim() && !erasePersonId) || !eraseBasis.trim()}
              aria-busy={eraseBusy}
              onclick={eraseNow}
            >{copy.eraseNow}</Button>
            <Button weight="bare" disabled={eraseBusy} onclick={() => (eraseOpen = false)}>{copy.keepAsIs}</Button>
          </div>
        {:else}
          <Button tone="bad" onclick={startErase}>{copy.erasePerson}</Button>
        {/if}
      </div>
    </div>
  </Tile>
{/if}

<style>
  /* UNBOXED, AND EVERY ONE OF THESE WAS A CARD. A person is a row on the page with a hairline
     between them, the way every other list in the product is drawn. */
  .whos {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .who {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-block: var(--sp-3);
  }

  .who + .who {
    border-block-start: 1px solid var(--rule);
  }

  /* THE NAME, WHAT IS KNOWN ABOUT IT UNDER THE NAME, AND THE CONTROL AT THE END OF BOTH. The head was
     a wrapping line, so the facts and the button landed wherever the name's length left room. */
  .who-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 2px var(--sp-2);
  }

  .who-head > :first-child {
    grid-column: 1;
    grid-row: 1;
  }

  .who-head > .who-name {
    grid-column: 2;
    grid-row: 1;
  }

  .who-head > .who-detail {
    grid-column: 2;
  }

  .who-head > .who-do {
    grid-column: 3;
    grid-row: 1 / span 2;
    margin-inline-start: var(--sp-2);
  }

  .who-name {
    color: var(--ink);
    font-weight: 600;
  }

  /* IT TAKES THE SLACK AND GIVES IT BACK. On a wide screen the address and the date sit on the
     name's line, and below about 520px the whole clause wraps instead of truncating an email
     address in the middle, which is where they stop being recognisable. */
  .who-detail {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .who-name {
    overflow-wrap: anywhere;
  }

  /* STOP AND REMOVE GO UNDER THE NAME ON A PHONE. Two buttons in the third column left a 390px row
     about a hundred pixels for the name and the address, which then wrapped a word to a line. */
  @media (width < 520px) {
    .who-head > .who-do {
      grid-column: 1 / -1;
      grid-row: auto;
      margin-inline-start: 0;
    }
  }

  /* The controls sit at the end of the head line and never shrink: a button that wraps its own
     label is a button somebody reads twice. */
  .who-do {
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .who-level {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .means {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* The ladder is five levels and a sixth answer, so its segments take the least padding in the
     product, and the track wraps rather than scrolling, which `controls.css` decided for this reason:
     five 44px segments measured 342px inside a 320px screen. */
  :global(.levels) .segment {
    padding-inline: var(--sp-2);
  }

  /* THE EXCEPTIONS. Indented under the level they are exceptions to, because that relationship is
     the whole content of the line: a flat list beside the level reads as a second, unrelated
     answer. One row each: which list, what they hold there, and the way back. */
  .exceptions {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0 0 0 var(--sp-3);
    border-inline-start: 2px solid var(--rule);
    list-style: none;
  }

  /* ONE LAYOUT FOR EVERY ROW. `flex-wrap` made the shape depend on how long the register's name is,
     so one person's two exceptions rendered two different ways, one 64px tall with the control
     wrapped, the next 36px with the control nine pixels ABOVE its own label. A grid gives every row
     the same three columns and the same height. */
  .exceptions li {
    display: grid;
    grid-template-columns: minmax(6ch, max-content) minmax(6ch, max-content) 1fr auto;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* AND THE CONTROL DROPS TO ITS OWN LINE ON A PHONE. Two `max-content` columns, a sentence and a
     44px button do not fit in 320px (the list ran 391px wide and the row 376), and the column that
     cannot shrink is the one holding a register's name. `13 §10`: below 640 a row becomes a card, and
     a card puts its verb underneath. */
  @media (width < 640px) {
    .exceptions li {
      grid-template-columns: minmax(0, max-content) minmax(0, max-content) 1fr;
    }

    .exceptions li :global(.btn) {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  .ex-list {
    color: var(--ink);
    font-weight: 600;
    font-size: var(--fs-meta);
  }

  /* AND IT IS SET APART FROM THE LADDER. Five rungs and a sixth thing that is not one of them,
     rendered identically, is a control whose own comment insists on a distinction the screen does
     not make. A separator rather than a colour: `13 §5.1` again. It stands beside the pill rather
     than being its border, because a pill's own edge is what marks the chosen one. */
  .level-none {
    position: relative;
    margin-inline-end: var(--sp-3);
  }

  .level-none::after {
    content: '';
    position: absolute;
    inset-block: var(--sp-2);
    inset-inline-end: calc(-0.5 * var(--sp-3) - 1px);
    border-inline-end: 1px solid var(--rule);
    pointer-events: none;
  }

  /* The ladder word, which is what one exception is compared against another by. */
  .ex-word {
    color: var(--ink);
    font-size: var(--fs-meta);
  }

  .ex-add {
    margin-block-start: var(--sp-1);
  }

  /* THE PICKER WRAPS ON A PHONE rather than running off the side, and every control in it is a full control height. */
  .ex-pick {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--sp-2);
  }

  .ex-field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-inline-size: 0;
  }

  .ex-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* WHICH ROWS: the field and its value side by side beside the list and level on a wide screen, and on a phone a
     row of their own with the two stacked at full width, since a field's name and a typed value do not both fit
     beside each other in 390px with a 44px control each. */
  .ex-where {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .ex-value {
    min-inline-size: 16ch;
  }

  @media (width < 640px) {
    .ex-where {
      flex-direction: column;
      align-items: stretch;
      flex-basis: 100%;
    }

    .ex-where .ex-select,
    .ex-where .ex-value {
      inline-size: 100%;
      min-inline-size: 0;
    }
  }

  /* The rows a narrowed grant reaches, said on a line of its own under the exception it narrows. */
  .ex-only {
    grid-column: 1 / -1;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* The invitations still waiting: a row per address, the control at the end of the line. */
  .invites-head {
    margin: var(--sp-3) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .invites {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .invite {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-2);
  }

  .invite + .invite {
    border-block-start: 1px solid var(--rule);
  }

  .invite-who {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .invite-when {
    flex: 1 1 20ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ex-select {
    min-block-size: var(--ctl-h);
    min-inline-size: var(--tap);
    max-inline-size: 100%;
    padding: 0 var(--sp-3);
    background: var(--tile-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
  }

  .ex-level {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE INVITATION'S FORM. Its label, field and button are `settings.css`'s field row, which puts the
     field and its button at one height and wraps them to two lines where they stop fitting. Nothing
     here sets a colour: the ring is `controls.css`'s, on the wrapper. `.code-label` stays for the
     erase fields below, which stand one under another rather than in a row. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* THE INVITATION'S FORM IS ONE COLUMN, capped at a reading width so the address field is not a
     thousand pixels long on a wide screen, and full width on a phone. */
  .invite-form {
    max-inline-size: 36rem;
  }

  .invite-email {
    inline-size: 100%;
  }

  .invite-form :global(.segmented) {
    margin-block-end: 0;
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  /* ONE HEIGHT FOR THE FORM'S CONTROLS (G21): the address was 44 beside a 36 select and a 32 track; all are the house's
     control height now, and 44 under a thumb. */
  .invite-form .invite-email,
  .invite-form .ex-select,
  .invite-form :global(.segmented) {
    box-sizing: border-box;
    block-size: var(--ctl-h);
    min-block-size: var(--ctl-h);
  }

  @media (pointer: coarse) {
    .invite-form .invite-email,
    .invite-form .ex-select,
    .invite-form :global(.segmented) {
      block-size: var(--tap);
      min-block-size: var(--tap);
    }
  }

  /* A ROW PER LIST: its name, and its select at the end of the line. The name takes the slack and
     wraps, so a long list name never pushes the select off a 390px screen. */
  .invite-lists {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .invite-lists li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
    padding-block: var(--sp-1);
  }

  .invite-lists li + li {
    border-block-start: 1px solid var(--rule);
  }

  .invite-list-name {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  /* A PLACE'S ROW LEADS, its lists under it set in from the edge. */
  .invite-place-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px var(--sp-2);
    min-inline-size: 0;
  }

  .invite-place-name {
    font-weight: 600;
  }

  .invite-each {
    padding: 0;
    border: 0;
    background: none;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-meta);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .invite-lists li.invite-one {
    padding-inline-start: var(--sp-3);
  }

  .invite-lists li.invite-one + li.invite-one {
    border-block-start: 0;
  }

  .invite-send {
    margin-block-start: var(--sp-1);
  }

  .invite-why {
    margin: var(--sp-2) 0 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* New link and Withdraw stay together at the end of the row, and wrap under it on a phone. */
  .invite-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* THE LADDER'S SELECT IS FOR A PHONE ONLY, and the segments for everywhere else (see the markup). */
  .level-select {
    display: none;
  }

  @media (width < 520px) {
    .who-level :global(.levels) {
      display: none;
    }

    .level-select {
      display: block;
      inline-size: 100%;
    }
  }

  /* THE SERVER'S COMMAND, in the house's mono on a well, so it reads as something to type. */
  .invite-command {
    display: block;
    inline-size: fit-content;
    max-inline-size: 100%;
    margin: calc(-1 * var(--sp-2)) 0 var(--sp-3);
    padding: var(--sp-1) var(--sp-2);
    overflow-wrap: anywhere;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  /* THE SHARED PILLS FROM `controls.css`, with the two things `Appearance.svelte` explains beside the
     same rule: the track hugs its options, and a segment is 44 on both axes under a thumb. The track is `Segmented`'s
     own element, so the rule reaches it from the row that holds it; the invitation's track has its own rule above. */
  .who-level :global(.segmented) {
    margin-block-end: var(--sp-3);
    inline-size: fit-content;
    max-inline-size: 100%;
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: var(--ctl-h);
  }

  /* WRAPPING, for the reason `/audit`'s segmented bar already wraps: two buttons that do not fit
     are two buttons off the edge. */
  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  /* ERASING IS WORDS AND FIELDS ON THE GROUND, unboxed: the red-edged panel it sat in drew red for a danger, and red
     is what needs him and nothing else. */
  .danger {
    display: grid;
    gap: var(--sp-2);
    max-inline-size: var(--measure);
  }

  .danger-title {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .danger :global(.btn) {
    justify-self: start;
    margin-block-start: var(--sp-2);
  }

  /* THE ONE WRITTEN LINE a tile with no figure still carries. */
  .reading {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
  }

  /* THE ROLE CHOICES: one row each, a radio, its name, and its two lines; the chosen one on the raised fill. */
  .roles {
    display: grid;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
  }
  .role {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-3);
    align-items: start;
    padding: var(--sp-3);
    border-radius: var(--r-ctl);
    background: var(--in-fill);
    cursor: pointer;
    transition: background-color 160ms ease, box-shadow 160ms ease;
  }
  .role[data-on] {
    background: var(--tile);
    box-shadow: inset 0 0 0 1.5px var(--ink);
  }
  .role input {
    margin-block-start: 3px;
    accent-color: var(--ink);
  }
  .role-text {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }
  .role-name {
    font-weight: var(--fw-semi);
    color: var(--ink);
  }
  .role-can,
  .role-cant {
    font-size: var(--fs-meta);
    line-height: 1.4;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .role-cant {
    color: var(--ink-3);
  }
  .roles-all {
    justify-self: start;
    font-size: var(--fs-meta);
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .role {
      transition: none;
    }
  }

  .hand {
    display: grid;
    gap: var(--sp-3);
  }
  .hand p {
    margin: 0;
    text-wrap: pretty;
  }
  .hand-do {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin-block-start: var(--sp-2);
  }
</style>
