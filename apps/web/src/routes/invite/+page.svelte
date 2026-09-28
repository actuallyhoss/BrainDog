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
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { acceptInvite, acceptProved, lookInvite, passkeyRegister, support, takeInvite, type InviteLevel, type InviteLink, type InviteSeen, type Said } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
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
  const asksName = $derived(seen !== null && seen.ok && !seen.value.signedInAs && !link?.proof);

  /**
   * WHAT THE LINK OPENS, IN ONE LINE, BEFORE ACCEPT: "Ashgrove: Money (adds rows), Tasks (reads)". Somebody asked to
   * join a record should know what they are agreeing to see before they agree, and the bookkeeper invited to one list
   * should not have to accept to find out it is one list. The whole record comes first when the invitation gives it,
   * then each list by its own name. `null` when a host older than these fields said nothing about either, and the
   * page then says only the address, as it did.
   */
  const does = (level: InviteLevel): string => (Object.hasOwn(copy.inviteDoes, level) ? copy.inviteDoes[level] : level);
  const opens = (v: InviteSeen): string | null => {
    const what = [
      ...(v.level !== null ? [copy.inviteEverything(does(v.level))] : []),
      ...v.lists.map((l) => copy.inviteListGives(l.name, does(l.level))),
    ];
    return what.length > 0 ? copy.inviteOpens(v.record ?? copy.inviteThisRecord, what.join(', ')) : null;
  };

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
   * ACCEPTING SIGNS SOMEBODY IN, SO IT DROPS THE BOOT THIS TAB KEPT. The layout's load asked `boot` for `/app/invite`,
   * which names no record, was refused, and kept the sample for the tab; Accept is a `fetch` that sets a cookie and
   * nothing more. Measured through the real `readBoot` (`loop/research-batch-forty-six-audit.md` section 5), the next
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
    const out = proof !== null ? await acceptProved(invitation, proof) : await acceptInvite(invitation, asksName ? name : undefined);
    closed(true, at);
    busy = null;
    if (!out.ok) {
      failed = sentence(out);
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

<!-- THE ENTRY LAYOUT EVERY WAY IN SHARES (`signin/Entry.svelte`): the brand at the top left, then this column. -->
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
        <!-- ONE ACTION UNDER EITHER (DSN-18): the invitation is out of this person's hands until somebody sends a
             new one, so the one thing left to press is the way into whatever they already hold. -->
        <Empty heading kind="no-results" glyph="link" title={copy.inviteNoLink} body={copy.inviteAskNew}>
          {#snippet actions()}<Button href="/signin">{copy.signIn}</Button>{/snippet}
        </Empty>
      {:else if seen && !seen.ok}
        <Empty heading kind="error" glyph="link" title={sentence(seen)} body={copy.inviteAskNew}>
          {#snippet actions()}<Button href="/signin">{copy.signIn}</Button>{/snippet}
        </Empty>
      {:else if proving !== null}
        <!-- A NEW ADDRESS, ASKED TO PROVE ITSELF. Nothing is made until the mailed link comes back, so this is the
             whole of what the screen can say: where the link went, and what opening it does. -->
        <div class="calm">
          <span class="door-glyph"><Icon name="link" size="l" /></span>
          <h1 class="calm-title">{copy.inviteCheckMail}</h1>
          <p class="calm-body" role="status">{copy.inviteMailSent(proving)}</p>
        </div>
      {:else if seen && seen.ok && !joined}
        <div class="calm">
          <span class="door-glyph"><Icon name="link" size="l" /></span>
          <!-- THE PAGE'S ONE LEVEL-ONE HEADING, in every state it can settle into. While this screen
               drew an error card it settled `refused`, so `a11y` skipped it and nothing ever audited
               it; the moment it settled `empty` the gate looked and found no `h1` at four widths. The
               branches are exclusive, so exactly one of these is ever on the page. -->
          <h1 class="calm-title">{copy.inviteLanding}</h1>
          {#if opens(seen.value)}<p class="calm-body opens">{opens(seen.value)}</p>{/if}
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
            <label class="lbl" for="in-name">{copy.inviteNameLabel}</label>
            <span class="field field-lg">
              <input id="in-name" class="field-input" type="text" autocomplete="name" bind:value={name} />
            </span>
          {/if}
          <Button weight="primary" onclick={accept} aria-busy={busy === 'accept'}>
            {busy === 'accept' ? copy.inviteAccepting : copy.inviteAccept}
          </Button>
          {#if failed}
            <p class="status" role="status">{failed}</p>
            <Button weight="quiet" href="/signin">{copy.inviteSignInFirst}</Button>
          {/if}
        </div>
      {:else if joined}
        <div class="calm">
          <span class="door-glyph ok"><Icon name="check" size="l" /></span>
          <h1 class="calm-title">{copy.inviteJoined}</h1>
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
          <!-- A FULL PAGE LOAD, AS ON `/signin`, AND THAT IS THE REPAIR. A client-side move to `/app/` kept everything
               this tab decided before Accept: the sample boot, the switcher's list, the voice. `/signin` walked it
               twice and drew The Studio with no request made; a reload draws the colleague's record, because the
               Worker answers `/app/` with a 302 to `/app/<slug>/` once there is a session. -->
          <Button weight={keyAdded || !(here.webauthn && here.secure) ? 'primary' : 'quiet'} href="/" data-sveltekit-reload>{copy.openBrainDog}</Button>
        </div>
      {/if}
    </div>
  </div>
</Entry>

<style>
  /* THE FRAME AND THE BRAND ARE `signin/Entry.svelte`'s, the same as sign in's, so an invitation that leads to sign in
     does not move the brand under the person. What is here is the column inside it. */
  .col,
  .act,
  .doors {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }

  .col {
    gap: var(--sp-6);
  }

  .act {
    gap: var(--sp-5);
  }

  .doors {
    gap: var(--sp-3);
  }

  .calm {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  /* NOT `.glyph`, for the reason `/signin` gives: `blocks.css` draws that name as a 6px intent dot, and this set only
     the colour of it. */
  .door-glyph {
    color: var(--ink2);
  }

  .door-glyph.ok {
    color: var(--earn);
  }

  .calm-title {
    /* THE SIZE IS STATED HERE BECAUSE THE TAG CHANGED. This was a `p` and is now the page's `h1`,
       and a user agent draws an `h1` at `2em` against a paragraph's `1em`, so leaving the size to
       the default would have doubled this line the moment it became a heading. */
    margin: 0;
    /* AND IT IS THE ENTRY SCREENS' ONE TITLE: `--t-3xl` in the display face, as sign in's slogan is (design §4). */
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--t-3xl);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: var(--lh-3xl);
    text-wrap: balance;
    overflow-wrap: anywhere;
  }

  .lbl {
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .calm-body,
  .status {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }

  /* THE NAME FIELD SCROLLS CLEAR OF THE PHONE'S KEYBOARD with Accept under it still in view. */
  .doors .field-input {
    scroll-margin-block: var(--sp-6) calc(var(--tap) + var(--sp-6));
  }

  /* WHAT THE LINK OPENS is the line a person decides by, so it reads in ink rather than the grey around it. */
  .opens {
    color: var(--ink);
    font-weight: 500;
  }
</style>
