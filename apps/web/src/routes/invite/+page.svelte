<!--
  An invitation link. `/invite#<token>`.

  THE TOKEN IS IN THE FRAGMENT, so it never reaches a server log, a proxy or a `Referer`, and it leaves the address
  before the one request made on arrival, which only looks. Nothing is spent until somebody presses Accept, so a mail
  scanner that opens the link spends nothing.

  ACCEPTING SIGNS SOMEBODY IN. Signed in already, as the address the link is for, they go on the record. New here,
  the host makes them and signs them in, and this screen then asks for a passkey, because that is how they come back.
  An address that can already sign in is sent to sign in first.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  import { acceptInvite, lookInvite, passkeyRegister, support, takeInvite, type InviteSeen, type Said } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { titleOf } from '$lib/title.ts';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Mark from '$lib/ui/Mark.svelte';
  import { closed, drew, opened } from '$lib/ui/screen.svelte.ts';

  const here = support();

  let token = $state<string | null | undefined>(undefined);
  let seen = $state<Said<InviteSeen> | null>(null);
  let busy = $state<'accept' | 'passkey' | null>(null);
  let failed = $state<string | null>(null);
  let joined = $state(false);
  let keyAdded = $state(false);

  /** The host's own sentence where it gave one, and a calm general one where it did not. */
  const sentence = (out: Said<unknown>): string => (!out.ok && 'fix' in out && typeof out.fix === 'string' && out.fix ? out.fix : copy.inviteFailed);

  onMount(() => {
    token = takeInvite(location.hash, () => history.replaceState(history.state, '', `${location.pathname}${location.search}`));
    if (token) void look(token);
  });

  async function look(t: string) {
    const at = opened();
    seen = await lookInvite(t);
    closed(true, at);
  }

  async function accept() {
    if (!token || busy) return;
    busy = 'accept';
    failed = null;
    const at = opened();
    const out = await acceptInvite(token);
    closed(true, at);
    busy = null;
    if (out.ok) joined = true;
    else failed = sentence(out);
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

<div class="door">
  <div class="col">
    <header class="brand">
      <Mark height={36} />
      <span class="wordmark">{copy.product}</span>
    </header>

    <div class="act">
      {#if token === undefined || (token && seen === null)}
        <p class="status" role="status">{copy.inviteChecking}</p>
      {:else if token === null}
        <!-- NOT AN ERROR, AND THE READINESS CONTRACT IS WHERE THAT SHOWS. Somebody who opens `/invite` with no
             fragment has met no failure: there is simply no invitation at this address, which is a designed empty
             state. Drawn as `error` it set `data-screen="refused"`, and `layout` and `a11y` sweep this route bare,
             so both measured an error card at fifteen widths and reported the screen as never auditable. A token
             the host rejects below is still `error`, because that one is a refusal. -->
        <Empty heading kind="no-results" glyph="link" title={copy.inviteNoLink} body={copy.inviteAskNew} />
      {:else if seen && !seen.ok}
        <Empty heading kind="error" title={sentence(seen)} body={copy.inviteAskNew} />
      {:else if seen && seen.ok && !joined}
        <div class="calm">
          <span class="glyph"><Icon name="link" size="l" /></span>
          <!-- THE PAGE'S ONE LEVEL-ONE HEADING, in every state it can settle into. While this screen
               drew an error card it settled `refused`, so `a11y` skipped it and nothing ever audited
               it; the moment it settled `empty` the gate looked and found no `h1` at four widths. The
               branches are exclusive, so exactly one of these is ever on the page. -->
          <h1 class="calm-title">{copy.inviteLanding}</h1>
          <p class="calm-body">{copy.inviteFor(seen.value.email)}</p>
          {#if seen.value.signedInAs}<p class="calm-body">{copy.inviteSignedInAs(seen.value.signedInAs)}</p>{/if}
        </div>
        <div class="doors">
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
          <span class="glyph ok"><Icon name="check" size="l" /></span>
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
          <Button weight={keyAdded || !(here.webauthn && here.secure) ? 'primary' : 'quiet'} href="/">{copy.openBrainDog}</Button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* The sign-in screen's frame: one column, centred, and `safe` so a tall column keeps its top on a phone. */
  .door {
    display: grid;
    grid-template-columns: minmax(0, min(400px, 100%));
    justify-content: center;
    align-content: safe center;
    min-block-size: 100dvh;
    padding-block: var(--sp-7);
    padding-inline: var(--sp-5);
  }

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

  .brand {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }

  .wordmark {
    font-weight: 600;
    font-size: var(--t-lg);
  }

  .calm {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .glyph {
    color: var(--ink2);
  }

  .glyph.ok {
    color: var(--earn);
  }

  .calm-title {
    /* THE SIZE IS STATED HERE BECAUSE THE TAG CHANGED. This was a `p` and is now the page's `h1`,
       and a user agent draws an `h1` at `2em` against a paragraph's `1em`, so leaving the size to
       the default would have doubled this line the moment it became a heading. */
    margin: 0;
    font-size: var(--t-lg);
    font-weight: 600;
  }

  .calm-body,
  .status {
    margin: 0;
    color: var(--ink2);
    overflow-wrap: anywhere;
  }
</style>
