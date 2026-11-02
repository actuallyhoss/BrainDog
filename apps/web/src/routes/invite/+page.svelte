<!--
  An invitation link. `/invite#<token>`.

  THE TOKEN IS IN THE FRAGMENT, so it never reaches a server log, a proxy or a `Referer`, and it leaves the address
  before the one request made on arrival, which only looks. Nothing is spent until somebody presses Accept, so a mail
  scanner that opens the link spends nothing.

  ACCEPTING SIGNS SOMEBODY IN. Signed in already, as the address the link is for, they go on the record. New here,
  the address proves it is theirs first: Accept mails a link to it and this screen says so. That link opens this page
  again with the proof beside the invitation (`/invite#<token>&proof=<proof>`), and Accept then makes them, signs them
  in, and asks for a passkey, because that is how they come back. An address that can already sign in is sent to sign
  in first.

  ONE SHEET UNDER THE BRAND, AS SIGN IN IS (`signin/Entry.svelte`): the invitation's own title, what it opens, and
  one ink button. The states are sign in's calm block: a glyph in a 32px well, the title, the lines under it.
-->
<script lang="ts">
  import { ROLES } from '$lib/sharing/roles.ts';
  import { onMount } from 'svelte';

  import { acceptInvite, acceptProved, lookInvite, passkeyRegister, support, takeInvite, type InviteLevel, type InviteLink, type InviteSeen, type Said } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import Entry from '../signin/Entry.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';

  const here = support();

  let link = $state<InviteLink | null | undefined>(undefined);
  const token = $derived(link === undefined ? undefined : (link?.token ?? null));
  let seen = $state<Said<InviteSeen> | null>(null);
  let busy = $state<'accept' | 'passkey' | null>(null);
  let failed = $state<string | null>(null);
  let joined = $state(false);
  /** The address the proving link was mailed to, once Accept has asked for one. */
  let proving = $state<string | null>(null);
  let keyAdded = $state(false);
  /**
   * What they typed for themselves. Only somebody new here is asked, and only before the proof: the host keeps the
   * name with the proof and makes the person with it, so a box on the page the mail opens would go nowhere.
   */
  let name = $state('');
  /* AND ON THE PAGE THE MAIL OPENS TOO (collab pass, 2 Nov): an invitation mailed by whoever made it carries no name in
     its proof, so the person names themselves here, and a name the proof already carries wins over it at the host. */
  const asksName = $derived(seen !== null && seen.ok && !seen.value.signedInAs);

  /**
   * WHAT THE LINK OPENS, IN ONE LINE, BEFORE ACCEPT: "Ashgrove: Money (adds rows), Tasks (reads)". Somebody asked to
   * join a record should know what they are agreeing to see before they agree, and the bookkeeper invited to one list
   * should not have to accept to find out it is one list. The whole record comes first when the invitation gives it,
   * then each list by its own name. `null` when a host older than these fields said nothing about either, and the
   * page then says only the address, as it did.
   */
  /* A LEVEL THIS BUILD HAS NO WORDS FOR IS SAID PLAINLY, never printed as the host's own word for it. */
  const can = (level: InviteLevel): string => (Object.hasOwn(copy.inviteCan, level) ? copy.inviteCan[level] : copy.inviteCanOther);
  /* ONE LINE A PART (first F14): "Bills and invoices: you can add", the whole BrainDog first when the link gives it. */
  /* A ROLE ON ALL OF IT IS SAID IN ITS OWN WORDS BELOW (`ROLES`), with what it lets them do and what it does not, so only
     the lists are lines here. */
  const opens = (v: InviteSeen): string[] => [
    ...(v.level !== null && !Object.hasOwn(ROLES, v.level) ? [copy.inviteGives(copy.inviteEverything, can(v.level))] : []),
    ...v.lists.map((l) => copy.inviteGives(l.name, can(l.level))),
  ];
  const role = (v: InviteSeen) => (v.level !== null && Object.hasOwn(ROLES, v.level) ? ROLES[v.level as keyof typeof ROLES] : null);
  /** The BrainDog's own name, when the host said it: the title, the button and the welcome all name it. */
  const recordName = $derived(seen?.ok ? (seen.value.record ?? null) : null);

  /**
   * AN INVITATION THAT GIVES "ADDS ONLY" AND NOTHING TO READ. Every screen of the app reads first, so the
   * one door that is hers is her agent's key, and Accept leads there instead of to a Home that can only refuse her.
   * Adds only on the whole record, or no whole record and every list at adds only; a host older than these fields,
   * which names neither, keeps the usual way on.
   */
  const addsOnly = $derived.by((): boolean => {
    if (!seen?.ok) return false;
    const v = seen.value;
    if (v.level !== null && v.level !== 'append') return false;
    if (v.level === null && v.lists.length === 0) return false;
    return v.lists.every((l) => l.level === 'append');
  });

  /** Whether the host was not reached at all, which is not the link being refused and is said apart from it. */
  const unreached = (out: Said<unknown> | null): boolean => out !== null && !out.ok && out.kind === 'unreachable';

  /** Ask the host about the link again, after it was not reached. "Checking the link" shows while it asks. */
  async function lookAgain() {
    if (!token) return;
    seen = null;
    await look(token);
  }

  /** The host's own sentence where it gave one, and a calm general one where it did not. */
  const sentence = (out: Said<unknown>): string => (!out.ok && 'fix' in out && typeof out.fix === 'string' && out.fix ? out.fix : copy.inviteFailed);

  onMount(() => {
    link = takeInvite(location.hash, () => history.replaceState(history.state, '', `${location.pathname}${location.search}`));
    if (link) void look(link.token);
  });

  async function look(t: string) {
    const at = opened();
    seen = await lookInvite(t);
    closed(true, at);
  }

  /**
   * ACCEPTING SIGNS SOMEBODY IN, SO IT DROPS THE BOOT THIS TAB KEPT. The layout's load asked `boot` for `/invite`,
   * which names no record, was refused, and kept the sample for the tab; Accept is a `fetch` that sets a cookie and
   * nothing more. Measured through the real `readBoot`, the next
   * move was handed The Studio, "Nothing you do here is saved.", with no request made, which is what `/signin` drew
   * for the owner before 6959cf06. "Open BrainDog" below is a full page load, which is the repair; this is for any
   * move out of here that is not one, so it at least asks the record rather than drawing the sample. Only on success:
   * a refused Accept leaves the tab as signed out as it was, and the sample is still the right answer for it.
   */
  async function accept() {
    if (!link || busy) return;
    busy = 'accept';
    failed = null;
    const at = opened();
    /* THE PROOF IS SENT ONLY FOR SOMEBODY NOBODY HAS SIGNED IN: signed in, the host takes the first path, which reads
       no proof, and the address is the session's own. */
    const invitation = link.token;
    const proof = link.proof && seen?.ok && !seen.value.signedInAs ? link.proof : null;
    const out = proof !== null ? await acceptProved(invitation, proof, name) : await acceptInvite(invitation, asksName ? name : undefined);
    closed(true, at);
    busy = null;
    if (!out.ok) {
      /* NOT REACHED IS NOT REFUSED: the link is still good, so the sentence says to press Accept again. */
      failed = unreached(out) ? copy.unreachableWhy : sentence(out);
      /* A PROOF THE HOST REFUSED IS DROPPED, because it was spent, ran out, or belongs to another invitation, and the
         host's sentence says to accept again for a new one. Kept, every later press would send the same dead proof
         and be refused the same way; dropped, the next press asks for a fresh mail and the name box comes back. */
      if (proof !== null && out.kind === 'refused') link = { token: invitation, proof: null };
    } else if (out.value.kind === 'proving') proving = out.value.to;
    else {
      forget();
      joined = true;
    }
  }

  async function addPasskey() {
    if (busy) return;
    busy = 'passkey';
    failed = null;
    const at = opened();
    const out = await passkeyRegister();
    closed(true, at);
    busy = null;
    if (out.ok) keyAdded = true;
    else failed = sentence(out);
  }

  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.invitePageTitle)}</title></svelte:head>

<!-- THE ENTRY FRAME EVERY WAY IN SHARES (`signin/Entry.svelte`): the brand on the ground, one sheet under it. -->
<Entry>
  <div class="col">
    <div class="act">
      {#if token === undefined || (token && seen === null)}
        <p class="status" role="status">{copy.inviteChecking}</p>
      {:else if token === null}
        <!-- NOT AN ERROR, AND THE READINESS CONTRACT IS WHERE THAT SHOWS. Somebody who opens `/invite` with no
             fragment has met no failure: there is simply no invitation at this address, which is a designed empty
             state. Drawn as `error` it set `data-screen="refused"`, and `layout` and `a11y` sweep this route bare,
             so both measured an error card at fifteen widths and reported the screen as never auditable. A token
             the host rejects below is still `error`, because that one is a refusal. -->
        <!-- ONE ACTION UNDER EITHER: the invitation is out of this person's hands until somebody sends a
             new one, so the one thing left to press is the way into whatever they already hold. -->
        <Empty heading kind="no-results" glyph="link" title={copy.inviteNoLink} body={copy.inviteAskNew}>
          {#snippet actions()}<Button href="/signin">{copy.signIn}</Button>{/snippet}
        </Empty>
      {:else if unreached(seen)}
        <!-- THE HOST WAS NOT REACHED, WHICH SAYS NOTHING ABOUT THE LINK. Drawn as the refusal below, it told somebody
             whose wifi dropped to ask for a new link; the link is still good, and asking again is the whole answer. -->
        <Empty heading kind="error" glyph="link" title={copy.unreachableTitle} body={copy.unreachableWhy}>
          {#snippet actions()}<Button weight="primary" onclick={lookAgain}>{copy.askAgain}</Button>{/snippet}
        </Empty>
      {:else if seen && !seen.ok}
        <Empty heading kind="error" glyph="link" title={sentence(seen)} body={copy.inviteAskAgain}>
          {#snippet actions()}<Button href="/signin">{copy.signIn}</Button>{/snippet}
        </Empty>
      {:else if proving !== null}
        <!-- A NEW ADDRESS, ASKED TO PROVE ITSELF. Nothing is made until the mailed link comes back, so this is the
             whole of what the screen can say: where the link went, and what opening it does. -->
        <div class="calm">
          <IconWell name="link" size="card" />
          <h1 class="entry-title">{copy.inviteCheckMail}</h1>
          <p class="calm-body" role="status">{copy.inviteMailSent(proving)}</p>
        </div>
      {:else if seen && seen.ok && !joined}
        <div class="calm">
          <IconWell name="link" size="card" />
          <!-- THE PAGE'S ONE LEVEL-ONE HEADING, in every state it can settle into. While this screen
               drew an error card it settled `refused`, so `a11y` skipped it and nothing ever audited
               it; the moment it settled `empty` the gate looked and found no `h1` at four widths. The
               branches are exclusive, so exactly one of these is ever on the page. -->
          <h1 class="entry-title">{seen.value.by ? copy.inviteLandingBy(seen.value.by, recordName) : copy.inviteLanding(recordName)}</h1>
          {#if role(seen.value)}
            {@const r = role(seen.value)!}
            <div class="role-said">
              <p class="role-name">{copy.inviteAs(r.name)}</p>
              <p class="role-line">{r.can}</p>
              <p class="role-line quiet">{r.cant}</p>
            </div>
          {/if}
          <!-- WHAT IS SHARED WITH THEM, IN THE SHARE'S OWN WORDS: "Ada shared Pottery with you. You can edit tasks in
               Pottery until 1 Dec." Beside what the link gives on the record and its lists, which a link carrying only
               shares leaves empty. -->
          {#if seen.value.shared}<p class="calm-body">{seen.value.shared}</p>{/if}
          {#if opens(seen.value).length > 0}
            <ul class="opens">
              {#each opens(seen.value) as line (line)}<li>{line}</li>{/each}
            </ul>
          {/if}
          <p class="calm-body">{copy.inviteFor(seen.value.email)}</p>
          {#if seen.value.signedInAs}<p class="calm-body">{copy.inviteSignedInAs(seen.value.signedInAs)}</p>{/if}
          {#if link?.proof && !seen.value.signedInAs}<p class="calm-body">{copy.inviteFromMail}</p>{/if}
        </div>
        <div class="doors">
          <!-- ONE OPTIONAL FIELD, AND ONLY FOR SOMEBODY NOBODY HAS SIGNED IN, BEFORE THE PROOF. The host takes a
               name only where it makes the person, so asking somebody already signed in would be a box whose answer
               goes nowhere, and so would asking again on the page the mail opens, whose name was kept with the
               proof. Without it People drew their address where their name goes. -->
          {#if asksName}
            <div class="name-row">
              <label class="field-label" for="in-name">{copy.inviteNameLabel} <span class="optional">{copy.inviteOptional}</span></label>
              <span class="field">
                <input id="in-name" class="field-input" type="text" autocomplete="name" bind:value={name} />
              </span>
            </div>
          {/if}
          <Button weight="primary" onclick={accept} aria-busy={busy === 'accept'}>
            {busy === 'accept' ? copy.inviteAccepting : copy.inviteAccept(recordName)}
          </Button>
          {#if failed}
            <p class="status" role="status">{failed}</p>
            <Button weight="quiet" href="/signin">{copy.inviteSignInFirst}</Button>
          {/if}
        </div>
      {:else if joined}
        <div class="calm">
          <IconWell name="check" size="card" tone="earn" />
          <h1 class="entry-title">{copy.inviteJoined(recordName)}</h1>
          {#if addsOnly}<p class="calm-body">{copy.inviteAddsOnlyNext}</p>{/if}
          {#if !keyAdded && here.webauthn && here.secure}<p class="calm-body">{copy.inviteKeepWay}</p>{/if}
        </div>
        <div class="doors">
          {#if keyAdded}
            <p class="status" role="status">{copy.passkeyAdded}</p>
          {:else if here.webauthn && here.secure}
            <Button weight="primary" onclick={addPasskey} aria-busy={busy === 'passkey'}>
              <Icon name="key" size="m" />{busy === 'passkey' ? copy.addingPasskey : copy.addPasskeyHere}
            </Button>
          {/if}
          {#if failed}<p class="status" role="status">{failed}</p>{/if}
          <!-- A FULL PAGE LOAD, AS ON `/signin`, AND THAT IS THE REPAIR. A client-side move to `/` kept everything
               this tab decided before Accept: the sample boot, the switcher's list, the voice. `/signin` walked it
               twice and drew The Studio with no request made; a reload draws the colleague's record, because the
               Worker answers `/` with a 302 to `/<slug>/` once there is a session. -->
          {#if addsOnly}
            <!-- HER KEY SCREEN, BY THE SAME FULL LOAD, so the session Accept just set is the one it reads. -->
            <Button weight={keyAdded || !(here.webauthn && here.secure) ? 'primary' : 'quiet'} href="/settings/agents" data-sveltekit-reload>{copy.inviteMakeAgentKey}</Button>
          {:else}
            <Button weight={keyAdded || !(here.webauthn && here.secure) ? 'primary' : 'quiet'} href="/" data-sveltekit-reload>{copy.openBrainDog}</Button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</Entry>

<style>
  /* THE FRAME, THE SHEET AND THE BRAND ARE `signin/Entry.svelte`'s, the same as sign in's, so an invitation that leads
     to sign in does not move the brand under the person. What is here is the column inside the sheet. */
  .col,
  .act,
  .doors {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .col {
    gap: var(--sp-5);
  }

  .act {
    gap: var(--sp-5);
  }

  .doors {
    gap: var(--sp-3);
  }

  /* EVERY BUTTON IS THE COLUMN'S WIDTH and as tall as a field: 40 under a mouse, 44 under a thumb. */
  .col :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
    white-space: normal;
    text-align: center;
  }

  /* `Empty` stands in the sheet as sign in's does, with no tile of its own: its padding goes, because the column already
     spaces it. */
  .act :global(.empty) {
    padding: 0;
    background: none;
  }

  .act :global(.empty-actions) {
    align-self: stretch;
  }

  .calm {
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: var(--sp-2);
  }

  .calm :global(.well) {
    margin-block-end: var(--sp-2);
  }

  /* A label above its field (`.field-label` puts 6 under it), as every field in the product has, and the field the
     column's width. Its own name, not the ledger's `.row`, which drew a rule under it and cut the field short. */
  .name-row {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .name-row .field {
    inline-size: 100%;
  }

  .optional {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-weight: 400;
  }

  .calm-body,
  .status {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 20px;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  /* THE NAME FIELD SCROLLS CLEAR OF THE PHONE'S KEYBOARD with Accept under it still in view. */
  .doors .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-6));
  }

  /* WHAT THE LINK OPENS is what a person decides by, so it reads in ink, one part a line, rather than the grey around it. */
  .opens {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* UNDER A THUMB THE FIELD READS AT 16, the phone's body size, below which a phone's browser zooms in on focus. */
  @media (pointer: coarse) {
    .doors .field-input {
      font-size: var(--fs-body);
    }
  }

  /* WHAT THE ROLE LETS THEM DO, under the heading, on the quiet fill (collab pass, 2 Nov). */
  .role-said {
    display: grid;
    gap: 2px;
    padding: var(--sp-3) var(--sp-4);
    border-radius: var(--r-ctl);
    background: var(--in-fill);
    text-align: start;
    max-inline-size: 420px;
    inline-size: 100%;
  }
  .role-said p {
    margin: 0;
  }
  .role-name {
    font-weight: var(--fw-semi);
    color: var(--ink);
  }
  .role-line {
    font-size: var(--fs-meta);
    line-height: 1.45;
    color: var(--ink-2);
    text-wrap: pretty;
  }
  .role-line.quiet {
    color: var(--ink-3);
  }
</style>
