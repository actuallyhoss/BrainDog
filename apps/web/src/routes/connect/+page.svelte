<!--
  Connect an app: the page an MCP client's sign-in lands on (`loop/finish/agents.md` C5).

  WHO IS ASKING, WHERE THE ANSWER GOES, WHAT IT MAY DO, ON WHICH RECORD, AND ONE ALLOW. The app's name and the host its
  code is sent back to come from the held request (`GET /oauth/request`); what it may do is a sentence, never the bare
  word; the record is the one the address names (`/app/<slug>/connect`) or, at `/app/connect`, one of the records this
  person owns. Allow and Deny post to the host's own doors, and the host answers with the app's address, which is where
  the browser goes next: that is the whole of finishing the sign-in.

  A PAGE AND NOT A DIALOG, because it is the whole of what the person came to do, and because the app sent the browser
  here with nothing else open. It fits an iPhone's screen without scrolling, and on a phone Allow is the last button,
  full width, where a thumb already is.

  NOTHING HERE IS A FAILURE BUT A FAILED READ. No request in the address is a person who opened the page by hand, and a
  sign-in that ended is the host saying so; both are designed states and neither marks the screen refused.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { slugOf } from '$lib/at.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { copy } from '$lib/copy.ts';
  import { read } from '$lib/data/read.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { reprove } from '$lib/record/vault.ts';
  import { titleOf } from '$lib/title.ts';
  import { TONES } from 'braindog-render';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import PageHead from '$lib/ui/PageHead.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import { answer, choicesOf, readConsent, type Scope } from './consent.ts';

  const shell = $derived(page.data as unknown as Shell);
  const request = $derived(page.url.searchParams.get('request'));

  /* THE REQUEST IS THE QUESTION, so a second sign-in opened in the same tab reads its own request rather than drawing
     the first one's app under the second one's address. */
  const held = read(
    () => (request ? `consent:${request}` : null),
    () => readConsent((url, init) => fetch(url, init), request ?? ''),
  );

  const consent = $derived(held.value !== null && 'held' in held.value ? held.value.held : null);
  const gone = $derived(held.value !== null && 'gone' in held.value ? held.value.gone : null);

  /* THE RECORDS ON OFFER, and the one chosen before the person chooses: the record open in this tab when it is one of
     them, which is the record they were last working in. */
  const choices = $derived(choicesOf(shell, slugOf(page.url.pathname)));
  let picked = $state<string | null>(null);
  const record = $derived(
    picked !== null && choices.some((c) => c.slug === picked) ? picked : (choices.find((c) => c.slug === shell.index.slug) ?? choices[0])?.slug ?? null,
  );

  let chosenScope = $state<Scope | null>(null);
  const scope = $derived(consent === null ? null : chosenScope !== null && consent.offers.includes(chosenScope) ? chosenScope : consent.suggested);

  /* ONE PRESS AT A TIME, and none after the host has answered with the app's address: the browser is leaving, and a
     second Allow would find the request already taken and say so over the page being left. */
  let sending = $state(false);
  let said = $state('');
  let signIn = $state(false);

  async function send(door: 'approve' | 'deny') {
    if (sending || consent === null) return;
    if (door === 'approve' && (record === null || scope === null)) return;
    sending = true;
    said = '';
    signIn = false;
    const at = opened();
    const out = await answer(
      (url, init) => fetch(url, init),
      door,
      door === 'approve' ? { request: consent.request, record: record ?? '', scope: scope ?? consent.suggested } : { request: consent.request },
    );
    closed(true, at);
    if (out.ok) {
      /* THE APP'S OWN ADDRESS, ON ITS OWN ORIGIN, so it is not an address in this app and `at()` has nothing to do to
         it. `replace` and not a new entry: Back from the app must not land on a request that has been answered. */
      location.replace(out.to);
      return;
    }
    sending = false;
    said = out.say;
    signIn = out.signIn;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, where a passkey can do it, and then Allow is sent again; anywhere else sign-in
     is opened and comes back to this address, request and all. */
  let reproving = $state(false);
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (back) await send('approve');
  }

  const title = $derived(consent ? copy.consentNamed(consent.client_name) : copy.consentTitle);
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<!-- THE HEAD IN EVERY STATE, so the screen always has its one `h1`. -->
<PageHead {title} />
<div class="consent">
  {#if request === null}
    <Empty kind="no-data-yet" title={copy.consentNone} body={copy.consentNoneWhy} />
  {:else if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
    <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
  {:else if gone !== null}
    <Empty kind="no-data-yet" title={copy.consentGone} body={gone} />
  {:else if consent !== null}
    <!-- `dir="auto"` ON WHAT THE APP WROTE: its name is its own, in whatever script it chose. -->
    <p class="asks" dir="auto">{copy.consentAsks(consent.client_name, consent.redirect_host)}</p>
    <form
      class="choose"
      onsubmit={(e) => {
        e.preventDefault();
        void send('approve');
      }}
    >
      {#if choices.length === 0}
        <p class="fact">{slugOf(page.url.pathname) === null ? copy.consentNotOwner : copy.consentNotOwnerHere}</p>
      {:else}
        <!-- ONE RECORD IS A FACT AND NOT A CHOICE: a single radio button chooses nothing. -->
        {#if choices.length === 1}
          <div class="fact-pair">
            <p class="fact-label">{copy.consentRecord}</p>
            <p class="fact">{choices[0]?.name}</p>
          </div>
        {:else}
          <fieldset class="pick">
            <legend class="fact-label">{copy.consentRecord}</legend>
            {#each choices as c (c.slug)}
              <label class="option">
                <input type="radio" name="record" value={c.slug} checked={record === c.slug} onchange={() => (picked = c.slug)} />
                <span>{c.name}</span>
              </label>
            {/each}
          </fieldset>
        {/if}

        {#if consent.offers.length === 1}
          <div class="fact-pair">
            <p class="fact-label">{copy.consentReach}</p>
            <p class="fact">{copy.consentScope[consent.suggested]}</p>
          </div>
        {:else}
          <fieldset class="pick">
            <legend class="fact-label">{copy.consentReach}</legend>
            {#each consent.offers as s (s)}
              <label class="option">
                <input type="radio" name="scope" value={s} checked={scope === s} onchange={() => (chosenScope = s)} />
                <span>{copy.consentScope[s]}</span>
              </label>
            {/each}
          </fieldset>
        {/if}

        <p class="lasts">{copy.consentLasts}</p>
      {/if}

      <!-- DENY FIRST IN THE DOCUMENT AND ALLOW LAST, so Allow is the trailing button at 1440 and the lowest one on a
           phone, and the tab order matches what is seen. Deny needs no session: turning an app away hands it nothing. -->
      <div class="acts">
        <Button disabled={sending} onclick={() => void send('deny')}>{copy.consentDeny(consent.client_name)}</Button>
        {#if choices.length > 0}
          <Button weight="primary" type="submit" disabled={sending || record === null}>{copy.consentAllow(consent.client_name)}</Button>
        {/if}
      </div>
      <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
      <p class="said" role="status" data-intent={said ? 'bad' : undefined}>
        {#if said}<span class="glyph" role="img" aria-label={TONES.bad.label}>{TONES.bad.glyph}</span> {said}{/if}
      </p>
      {#if signIn}
        <div class="acts">
          <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
        </div>
      {/if}
    </form>
  {/if}
</div>

<style>
  .consent {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-5) var(--gutter) var(--sp-7);
    max-inline-size: var(--measure);
  }

  /* WHAT THE APP WROTE AND WHERE IT GOES BREAK ANYWHERE, so a long name or host never pushes the page sideways at 320. */
  .asks {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    line-height: var(--lh-body);
    overflow-wrap: anywhere;
  }

  .choose {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* A LABEL ABOVE ITS VALUE, as a row page's facts are drawn on a phone, and no box around either. */
  .fact-pair {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }

  .fact-label {
    margin: 0;
    padding: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .fact {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-md);
    overflow-wrap: anywhere;
  }

  .pick {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border: 0;
    min-inline-size: 0;
  }

  .pick > .fact-label {
    margin-block-end: var(--sp-1);
  }

  /* THE WHOLE LINE IS THE TARGET, and 44 tall under a thumb: the radio's own drawing is 16 or 20px and nobody should
     have to hit that. */
  .option {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--t-base);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .option {
      min-block-size: var(--tap);
      font-size: var(--t-md);
    }
  }

  .lasts {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
    line-height: var(--lh-body);
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  /* ON A PHONE, ONE BUTTON TO A LINE AND THE WHOLE WIDTH, with Allow at the bottom where the thumb is. */
  @media (width < 640px) {
    .acts {
      flex-direction: column;
      align-items: stretch;
    }

    .acts :global(.btn) {
      inline-size: 100%;
      justify-content: center;
    }
  }

  .said {
    margin: 0;
    color: var(--tone, var(--ink2));
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }
</style>
