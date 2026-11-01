<!--
  Connect an agent: the page an MCP client's sign-in lands on.

  WHO IS ASKING, WHERE THE ANSWER GOES, WHAT IT MAY DO, ON WHICH RECORD, AND ONE ALLOW. The app's name and the host its
  code is sent back to come from the held request (`GET /oauth/request`); what it may do is a sentence, never the bare
  word; the record is the one the address names (`/<slug>/connect`) or, at `/connect`, one of the records this
  person owns. Allow and Deny post to the host's own doors, and the host answers with the app's address, which is where
  the browser goes next: that is the whole of finishing the sign-in.

  A PAGE AND NOT A DIALOG, because it is the whole of what the person came to do, and because the app sent the browser
  here with nothing else open. It fits an iPhone's screen without scrolling, and on a phone Allow is the last button,
  full width, where a thumb already is.

  THE LOOK IS THE ENTRY SCREENS' (`signin/Entry.svelte`): the lit ground, and on it one lead tile with
  the mark and the name at its top, because a person arrives here from sign-in, often straight from it, and the brand
  stays where it was. In the tile, the app's own face and the one heading, the sentence of what it asks, the two facts
  as a label over its value (or the choice, where there is one), how long it lasts in the quiet ink, and the two
  presses: Deny a quiet pill and Allow the one ink pill. No figure, so no chart.

  THE HEADING IS THIS SCREEN'S OWN `h1` AND NOT `PageHead`'s. There is one in every state, which is what the head was
  kept for; `PageHead` is the shell's title row, and on a surface drawn bare its phone bar carried a search circle
  that opens a palette this surface does not mount, a button that did nothing.

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
  import { reprove } from '$lib/record/keychain.ts';
  import { titleOf } from '$lib/title.ts';
  import { TONES } from 'braindog-render';
  import AgentMark from '$lib/ui/AgentMark.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Face from '$lib/ui/Face.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import ReadState from '$lib/ui/ReadState.svelte';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Entry from '../signin/Entry.svelte';
  import { answer, choicesOf, readConsent, type Scope } from './consent.ts';
  import { markFor, provenLine } from './proven.ts';

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
  /* WHAT THE DOOR PROVED ABOUT THE APP, under the name it chose: checked for an app served from its own address, and
     said plainly when it only named itself. */
  const proven = $derived(consent === null ? null : provenLine(consent));

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
  /* A KNOWN AGENT WEARS ITS MAKER'S MARK, as it does on Connect your agent (first F11), but only when its document came
     from that maker's own host (`markFor`); any other app its initials, whatever name it chose. */
  const marked = $derived(consent ? markFor(consent) : null);
  /** The BrainDog the app would reach, by its name, once there is one to name. */
  const recordName = $derived(choices.find((c) => c.slug === record)?.name ?? null);
</script>

<svelte:head><title>{titleOf(title)}</title></svelte:head>

<Entry>
  <div class="consent">
    <!-- THE ONE HEADING, IN EVERY STATE, and beside it the app's own face once the app is known: its initials on its own
         hue in the rounded square a thing wears, so the name that asks is also a shape. `dir="auto"` on what the app
         wrote: its name is its own, in whatever script it chose. -->
    <header class="who">
      {#if marked !== null}
        <span class="agent-disc" aria-hidden="true"><AgentMark kind={marked} size="m" /></span>
      {:else if consent !== null}
        <Face name={consent.client_name} of="record" size="l" />
      {:else}
        <!-- A WELL WHERE NO APP IS NAMED YET (G25), as Invite's card leads with one: the two entry cards start alike. -->
        <IconWell name="plug" size="card" />
      {/if}
      <h1 class="entry-title" dir="auto">{title}</h1>
    </header>

    {#if request === null}
      <!-- NOBODY IS ASKING, AND IT IS NOT A DEAD END (first F11): the way to connect one from this side, and the way in. -->
      <div class="state">
        <Empty kind="no-data-yet" title={copy.consentNone} body={copy.consentNoneWhy}>
          {#snippet actions()}
            <Button weight="primary" href="/settings/agents">{copy.consentOpenAgents}</Button>
          {/snippet}
        </Empty>
        <!-- AND THE ADDRESS TO PASTE, for someone who came here to connect an app and found nothing asking: the
             connector address any app takes (`connectLines` in `device.ts`), with its copy button. -->
        <div class="paste">
          <p class="paste-said">{copy.consentPaste}</p>
          <CodeLine text={`${page.url.origin}/mcp`} label="Connector address" />
        </div>
      </div>
    {:else if held.state === 'waiting' || held.state === 'refused' || held.state === 'offline'}
      <ReadState state={held.state} refusal={held.refusal} onretry={held.reread} />
    {:else if gone !== null}
      <div class="state"><Empty kind="no-data-yet" title={copy.consentGone} body={gone} /></div>
    {:else if consent !== null}
      <p class="asks" dir="auto">{copy.consentAsks(consent.client_name, recordName, consent.redirect_host)}</p>
      {#if proven !== null}
        <p class="proven" data-intent={proven.tone}>
          <span class="glyph" role="img" aria-label={TONES[proven.tone].label}>{TONES[proven.tone].glyph}</span>
          {proven.text}
        </p>
      {/if}
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
</Entry>

<style>
  /* THE COLUMN INSIDE THE ENTRY TILE (`Entry.svelte` draws the ground, the tile and the brand): everything on one start
     edge, 16 apart. */
  .consent {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-inline-size: 0;
  }

  /* THE APP'S FACE AND THE HEADING ON ONE LINE, as a tile's heading row is, so the facts and Allow stay within a
     phone's first screen. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* The title is the entry screens' one (`Entry.svelte`); here it shares its row with the app's face. */
  .who :global(.entry-title) {
    min-inline-size: 0;
  }

  /* A KNOWN AGENT'S MARK IN A ROUND WELL: an agent is a who, so its face is round, 40 with the mark at 20 inside. */
  .agent-disc {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 40px;
    block-size: 40px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    color: var(--ink);
  }

  /* `Empty` stands in the sheet with no tile of its own, and its padding goes: the column's gap already spaces it. */
  .state :global(.empty) {
    padding: 0;
    background: none;
  }

  .state :global(.empty-actions) {
    align-self: stretch;
  }

  .state :global(.btn) {
    inline-size: 100%;
    min-block-size: max(40px, var(--ctl-h));
  }

  /* WHAT THE APP WROTE AND WHERE IT GOES, THE SCREEN'S ONE SENTENCE: 16/24 in the second ink, breaking
     anywhere, so a long name or host never pushes the page sideways at 320. */
  .asks {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
    line-height: 24px;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }

  .choose {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }

  /* A LABEL ABOVE ITS VALUE, in meta over the body, and no box around either. */
  .fact-pair {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .fact-label {
    margin: 0;
    padding: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
    line-height: 18px;
  }

  .fact {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
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
    font-size: var(--fs-body);
    cursor: pointer;
  }

  @media (pointer: coarse) {
    .option {
      min-block-size: var(--tap);
      font-size: var(--fs-body);
    }
  }

  /* HOW LONG IT LASTS AND HOW TO UNDO IT, in the quiet ink: read once, and then out of the way. */
  .lasts {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 18px;
    text-wrap: pretty;
  }

  /* DENY THEN ALLOW AT THE TRAILING EDGE, and each label may wrap: an app's name is as long as its maker made it. */
  .acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  .acts :global(.btn) {
    max-inline-size: 100%;
    white-space: normal;
    text-align: center;
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

  /* WHAT IS PROVEN, IN ITS TONE AND ITS MARK, never the colour alone: body size, so it is read and not skimmed. */
  .proven {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 22px;
    overflow-wrap: anywhere;
  }

  /* THE PRESS'S ANSWER, when there is one: the intent's dot and the host's sentence in the intent's colour. It stays in
     the document while it is empty, so the sentence is announced when it arrives. */
  .said {
    margin: 0;
    color: var(--tone, var(--ink-2));
    font-size: var(--fs-meta);
    line-height: 18px;
    overflow-wrap: anywhere;
  }

  /* EMPTY, IT TAKES NO ROOM: the column's gap above it is taken back, so the sheet ends 24 under Allow. */
  .said:empty {
    margin-block-start: calc(-1 * var(--sp-4));
  }

  /* THE CONNECTOR ADDRESS UNDER THE EMPTY STATE: one line of words, then the address to copy. */
  .paste {
    display: grid;
    gap: var(--sp-2);
    margin-block-start: var(--sp-4);
    min-inline-size: 0;
  }

  .paste-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }
</style>
