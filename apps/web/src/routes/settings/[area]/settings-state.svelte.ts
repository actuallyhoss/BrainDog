/**
 * What more than one settings area reads, held once for as long as Settings is open.
 *
 * ONE COMPONENT PER AREA, AND THIS IS WHAT THEY STILL HAVE IN COMMON. Settings was one file that drew
 * every area, so any `$state` two areas read was simply in scope for both. Split, each area
 * in `areas/` keeps its own state and loses it when the person moves to the next area, which is what
 * the old `{#if area !== ...}` resets were doing by hand. What more than one area reads or writes
 * lives here instead: whether the reader owns the record, who the record's members are (People and
 * Identity), what the host says about signing in (Identity and Recovery), whether this host makes
 * forwarding addresses (Ingest and Billing), the lists a colleague can hold, and the bare origin.
 *
 * ONE INSTANCE PER VISIT TO SETTINGS, AND NOT ONE PER TAB. `+page.svelte` opens a fresh one every
 * time it mounts, which is the lifetime these answers had as that page's own state. Moving between
 * areas keeps it, because SvelteKit keeps the page mounted while only the parameter changes; leaving
 * Settings and coming back asks again. A module-level answer that outlived the route would outlive a
 * sign-out, and every answer here is one cheap read.
 *
 * WHY A HOLDER AND NOT A PROP. Every area takes `{ shell, area }` and nothing else (the settings
 * split's contract), so the one instance is reached through `settingsState`, which the page has
 * already filled by the time any area's script runs: a parent's script runs before its children's.
 */

import { page } from '$app/state';
import { apiBase } from '$lib/at.ts';
import { methods, passkeys, type Methods, type PasskeyInfo } from '$lib/auth.ts';
import { copy } from '$lib/copy.ts';
/* Type only, so the client's route table stays out of this chunk. */
import type { Shell } from '$lib/record/boot-live.ts';
/* THE DECLARATION CACHE, WHICH ONLY THE RECORD FILLS (`held.ts`). */
import { REGISTERS } from '$lib/record/held.ts';
/* WHETHER THE HOST ANSWERING HAS A MAIL DOOR AT ALL. `inbound-door.ts` says why it is a request and
   not the build's variant. */
import { mintsMail } from '$lib/record/inbound-door.ts';
import type { Person } from '$lib/record/schema.ts';
import { readPeople } from '$lib/record/settings-write.ts';
import { closed, opened } from '$lib/ui/screen.svelte.ts';
/* WHETHER THE PERSON READING THIS MAY USE WHAT IS ON IT, which nothing here asked. `../levels.ts`
   carries what was measured: seven colleagues, every area, the owner's controls in all of them. */
import { ownsRecord } from '../levels.ts';

/** The props every area takes, and the only ones: the shell the layout read, and the area in the address. */
export type AreaProps = { shell: Shell; area: string };

/**
 * THE BARE ORIGIN, READ IN THIS ONE FILE.
 *
 * The login line, the mail door's address, the invite link and the move to another record are built
 * on the host itself rather than under this record's address, so they need `location.origin`, which
 * `lib/at-sites.test.ts` allows only in the files it names. This is the one Settings file that list
 * names, so every area that builds one of them asks here rather than reading it itself.
 */
export const bareOrigin = (): string => location.origin;

export class SettingsState {
  #shell: () => Shell;

  constructor(shell: () => Shell) {
    this.#shell = shell;
  }

  /**
   * WHETHER THIS IS AN OWNER, WHICH IS THE ONE QUESTION EVERY AREA WAS DRAWN WITHOUT ASKING.
   *
   * Measured on a real self-host with a colleague at each of the five levels: a `read` colleague was
   * offered 3 controls on People, 4 on Agents, 1 on Backups, 6 on Export and 2 on Delete, and one of
   * the sixteen said it was off. `write` and `decide` were offered the same sixteen, because every
   * settings write in this product is an ADMIN method and none of them is reachable below `owner`.
   *
   * ONE DERIVED AND NOT A CHECK PER CONTROL: one
   * predicate on `AREAS` and one per section, rather than eleven times. The predicate itself is in
   * `../levels.ts` with what it costs, and `levels.test.ts` holds each area to it.
   */
  anOwner = $derived.by(() => ownsRecord(this.#shell().me));

  /* ── the record's members, which People lists and Identity reads its own row from ── */

  /**
   * THE PEOPLE AREA'S ROWS: the record's members, and nobody else's.
   *
   * `reading` draws no list, so a live record never flashes somebody else's colleagues. A record that says no, or a
   * host with no such read, draws its sentence in place of the list. There was a `sample` state that drew
   * `PEOPLE_ACCESS`, four colleagues nobody invited, where no record answered; that answer is a refusal now.
   *
   * IDENTITY READS THE SAME LIST, because it draws a person too: the address it prints beside "Signed in as" is a
   * fact about a member of this record, and it was being read out of a fixture while the record sat one call away.
   */
  people = $state<Person[]>([]);
  peopleFrom = $state<'reading' | 'live' | 'unrouted' | 'refused'>('reading');
  peopleRefusal = $state('');

  readPeopleNow = async (): Promise<void> => {
    const at = opened();
    const out = await readPeople(apiBase());
    this.people = out.from === 'live' ? out.people : [];
    this.peopleRefusal = out.from === 'refused' ? out.fix : out.from === 'unrouted' ? copy.peopleUnrouted : '';
    this.peopleFrom = out.from;
    closed(true, at);
  };

  /* ── signing in, which Identity and Recovery both draw ── */

  /**
   * WHAT THE HOST SAYS ABOUT SIGNING IN, read only on the two areas that draw it.
   *
   * `null` until it answers, and where there is no host at all: those two areas then draw no
   * passkey and no control that would need a session.
   */
  hostAuth = $state<Methods | null>(null);
  liveKeys = $state<PasskeyInfo[] | null>(null);
  /* THE SESSION THIS SCREEN ENDED, so the table stops naming who was in it. A later read that finds somebody puts it back. */
  signedOut = $state(false);

  readSignIn = async (): Promise<void> => {
    const at = opened();
    const answer = await methods();
    this.hostAuth = answer.ok ? answer.value : null;
    if (this.hostAuth?.me) this.signedOut = false;
    if (this.hostAuth?.me && this.hostAuth.passkey) {
      const listed = await passkeys();
      this.liveKeys = listed.ok ? listed.value : null;
    }
    closed(true, at);
  };

  /* ── whether this host makes forwarding addresses, which Ingest offers and Billing reads ── */

  /**
   * WHETHER THIS HOST MAKES FORWARDING ADDRESSES, asked once on arriving at the first area that needs it.
   *
   * `null` UNTIL IT ANSWERS, AND NEITHER MAIL BUTTON IS DRAWN MEANWHILE. A usability
   * pass counted `Make an address` and `Stop taking forwarded mail` among the eight controls a
   * fresh record cannot honour: on a self-host both presses answered 404 `ROUTE_UNKNOWN`, the good
   * sentence about `inbound.token` arrived only after the press, and a reload put both buttons back.
   *
   * IT IS NOT THE SAMPLE'S `DEPLOYMENT.kind`, WHICH WOULD HAVE TAKEN THE FEATURE OFF THE CLOUD. That
   * constant followed `__BRAINDOG_VARIANT__`, substituted at build time and empty in every shipped
   * bundle, so it read `self-host` on the Cloud build too: it said which record the build drew and
   * knew nothing about which host answered. `mintsMail` asks the door instead.
   *
   * AND THE ANSWER IS KEPT FOR AS LONG AS SETTINGS IS OPEN, because it is a fact about the host rather
   * than about the record: leaving the Ingest area empties what that area held and leaves this alone,
   * so moving between settings areas and coming back does not ask again. Billing reads the same
   * answer, since it is the one answer only a self-host gives (`billing.ts`).
   */
  mintsHere = $state<boolean | null>(null);

  /**
   * One GET at the mint door, which mints nothing.
   *
   * `serveInbound` refuses a non-POST at its second line, above the bearer, the origin, the level and
   * the fifteen-minute proof, so this costs one request and has no effect on any host. A host without
   * the door answers 404 `ROUTE_UNKNOWN` from `serveApi` and the two buttons are never drawn.
   *
   * EACH CALLER CALLS IT INSIDE `untrack`, for the reason the Ingest area's effect gives: `opened()`
   * reads and writes the same state, so an effect that made this call tracked would loop for ever.
   */
  askMailDoor = async (): Promise<void> => {
    /* A HOST THAT SAID WHICH IT IS IS NOT ASKED: `boot`'s `host` is its own word, the self-host routes no mail door and
       the Cloud's is real. The GET was a 404 in the console of every self-host that opened Ingest or Billing. A host
       older than the field is asked, as before. */
    const host = this.#shell().host;
    if (host !== undefined) {
      this.mintsHere = host === 'cloud';
      return;
    }
    const at = opened();
    this.mintsHere = await mintsMail(apiBase());
    closed(true, at);
  };

  /* ── the lists a colleague can hold, which People offers and Identity names ── */

  /* THE LISTS AN EXCEPTION CAN BE ON: the shell's, which are the record's. `REGISTERS` is the declaration cache, for now. */
  lists = $derived(
    ((page.data as { lists?: readonly { id: string; name: string }[] }).lists ??
      Object.entries(REGISTERS).map(([id, r]) => ({ id, name: r.name }))),
  );
  listName = (id: string): string => this.lists.find((l) => l.id === id)?.name ?? REGISTERS[id]?.name ?? id;
  namesOf = (ids: readonly string[]): string => new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(ids.map(this.listName));
}

let open: SettingsState | null = null;

/** A fresh instance for this visit to Settings. `+page.svelte` calls it once, as it mounts. */
export function openSettings(shell: () => Shell): SettingsState {
  open = new SettingsState(shell);
  return open;
}

/**
 * The instance the page opened, which is what every area reads.
 *
 * IT OPENS ONE ONLY IF THE PAGE HAS NOT, which never happens while the areas are drawn by `+page.svelte`
 * alone. An area mounted any other way still gets state of its own rather than an error.
 */
export function settingsState(shell: () => Shell): SettingsState {
  open ??= new SettingsState(shell);
  return open;
}
