<!--
  The webhook doors in Settings, Ingest: every web address this record declares it takes things in at, one row each,
  and one press per row that mints the token the address carries.

  IT WAS ONE DOOR, AND A BANK'S. `ShortcutDoor.svelte` minted for `bank-from-out-sms` and printed an iPhone recipe, so a
  record whose door took anything else had no screen for it. The rows are now the record's answer
  to `doors`, and each press sends back the id that answer gave: nothing here knows what any door is for.

  AN OWNER'S SCREEN, SAID BEFORE THE LIST. Both `doors` and `ingestMint` are ADMIN, and the mint wants a sign-in from the
  last fifteen minutes, because whoever holds a token can write into the record. The page's own `anOwner` is handed in,
  so there is one predicate for who owns the record; the record decides again on each call.

  A LIST ON THE GROUND: each door a row with the plug in its 32px well, its name, the list it writes to and
  whether an address is in use, then its one press. No tile over it, because the doors read carries no count to draw:
  a number with no chart under it is the one thing a tile may not hold.

  A SWITCH ON EACH ROW TURNS THE DOOR OFF AND ON. Off keeps the token and the address, so it asks nothing
  first; the row then says since when and how many were turned away, and every row says its last arrival. A host whose
  `doors` predates the switch answers no `on`, and that row draws no switch.

  A TOKEN LIVES IN `said` AND NOWHERE ELSE. The section is drawn only inside the `ingest` arm, so leaving the area takes
  the component and every token with it, and nothing writes one to a store, a query string or a toast. The rules are
  `webhook-doors.ts`, which the tests hold.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import * as clipboard from '$lib/clipboard.ts';
  import {
    asksFirst,
    callerAt,
    lastLine,
    listDoors,
    mintDoor,
    offLine,
    switchDoor,
    switched,
    switchLabel,
    type Door,
    type Listed,
    type Said,
    type Switched,
  } from '$lib/ui/webhook-doors.ts';
  import { reprove } from '$lib/record/keychain.ts';
  import { methods, passkeySignIn, support } from '$lib/auth.ts';
  import { words as levelWords } from '../../routes/settings/levels.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import NewAction from '$lib/ui/NewAction.svelte';
  import { actionWords } from '$lib/record/action-draft.ts';

  let { owner = false }: { owner?: boolean } = $props();

  let listed = $state<Listed | null>(null);
  /* ONE ANSWER PER DOOR, keyed by the id the list gave, so minting a second door does not take the first one's token
     off the screen before it was copied. */
  let said = $state<Record<string, Said>>({});
  let busy = $state<string | null>(null);
  /* THE DOOR WHOSE HELD TOKEN IS ONE PRESS FROM BEING REPLACED. One at a time: a second row asking while the first
     still asks is two confirms open, and the one somebody presses is the one they were not reading. */
  let asking = $state<string | null>(null);
  let reproving = $state(false);
  /* THE NEW-DOOR SHEET. A door made there is minted there, so closing it reads the list again for the new row. */
  let making = $state(false);

  function made() {
    making = false;
    listed = null;
  }
  /* THE PRESS A SIGN-IN INTERRUPTED, so signing in again finishes it rather than leaving a press to find. */
  let resume = $state<string | null>(null);
  /* THE SWITCH ON EACH ROW: what its last press answered, keyed by door, and the door being switched. */
  let flips = $state<Record<string, Switched>>({});
  let flipping = $state<string | null>(null);
  let resumeFlip = $state<{ id: string; on: boolean } | null>(null);
  const now = Date.now();

  const doors = $derived(listed?.kind === 'doors' ? listed.doors : []);

  /* EVERY ARM IS A SENTENCE: the record's own `fix`, verbatim (`13 §6`). */
  const lineOf = (s: Said | Listed | Switched | null | undefined): string =>
    !s || s.kind === 'minted' || s.kind === 'doors' || s.kind === 'switched' ? (s?.kind === 'minted' ? copy.doorsMade : '') : s.fix;
  const toneOf = (s: Said | Listed | Switched | null | undefined): 'bad' | undefined =>
    !s || s.kind === 'minted' || s.kind === 'doors' || s.kind === 'switched' ? undefined : 'bad';

  /* THE RECORD'S METHODS UNDER ITS SLUG; the door they mint is `/in/…` on the bare host, which a stranger posts to. */
  const call = () => callerAt(apiBase());

  async function read() {
    const at = opened();
    listed = await listDoors(call());
    closed(listed.kind === 'doors', at);
  }

  /* READ ONCE, WHEN AN OWNER SEES THE SECTION. Nobody else may, and a list read for somebody who cannot mint would be
     an ADMIN refusal drawn under the sentence that already says so. */
  /* THE READ IS UNTRACKED, and without that this effect asked for ever. `read` calls `opened()` on its first line, which
     increments the screen's `$state` counter, so the effect depended on what it wrote and ran again before `listed` was
     set: measured on `/settings/ingest` over the gates' record, `/api/doors` was requested more than
     thirty times in three seconds and the screen never settled, which `a11y` reported on all four of its passes. The
     mail door above this section is called the same way for the same reason. */
  $effect(() => {
    if (owner && listed === null) untrack(() => void read());
  });

  function press(door: Door) {
    if (busy !== null) return;
    if (asksFirst(door) && asking !== door.id) {
      asking = door.id;
      return;
    }
    void mint(door.id);
  }

  async function mint(id: string) {
    if (busy !== null) return;
    busy = id;
    asking = null;
    const at = opened();
    const out = await mintDoor(call(), location.origin, id);
    said = { ...said, [id]: out };
    closed(out.kind === 'minted', at);
    /* THE ROW NOW HOLDS A TOKEN, so the next press on it asks first without the list being read again. */
    if (out.kind === 'minted' && listed?.kind === 'doors')
      listed = { kind: 'doors', doors: listed.doors.map((d) => (d.id === id ? { ...d, held: true } : d)) };
    resume = out.kind === 'signin' ? id : null;
    /* ONE PRESS WAITS ON A SIGN-IN AT A TIME, the newest, so signing in finishes what was pressed last. */
    if (resume !== null) resumeFlip = null;
    busy = null;
  }

  /* OFF KEEPS THE ADDRESS AND THE TOKEN, so the switch asks nothing first: on again is the same door. */
  async function flip(id: string, on: boolean) {
    if (flipping !== null) return;
    flipping = id;
    const at = opened();
    const out = await switchDoor(call(), id, on);
    flips = { ...flips, [id]: out };
    closed(out.kind === 'switched', at);
    if (out.kind === 'switched' && listed?.kind === 'doors')
      listed = { kind: 'doors', doors: listed.doors.map((d) => (d.id === id ? switched(d, out.facts) : d)) };
    resumeFlip = out.kind === 'signin' ? { id, on } : null;
    if (resumeFlip !== null) resume = null;
    flipping = null;
  }

  /* SIGNING IN AGAIN WITHOUT LEAVING, then the same press again: `reprove` is the agents and mail areas' own, so the
     three cannot come to disagree about what a fresh sign-in is. */
  async function signInAgain() {
    if (reproving) return;
    reproving = true;
    const back = await reprove({ support, methods, passkeySignIn }, (href) => location.assign(href));
    reproving = false;
    if (!back) return;
    if (resume !== null) await mint(resume);
    else if (resumeFlip !== null) await flip(resumeFlip.id, resumeFlip.on);
    else await read();
  }
</script>

<!-- THE LINE FIRST, THEN ITS BUTTON: "New web address" in the heading's corner wrapped to a row of
     its own on a phone, above the sentence that says what it makes. -->
<Tile icon="link" class="section" data-surface="tile" title={copy.doorsTitle}>
  <div class="section-body">
    <!-- WHAT THEY ARE, ONCE: over the list, or as the empty state's own line when there are none (ui-perfect, 3 Nov). -->
    {#if !(owner && listed?.kind === 'doors' && doors.length === 0)}<p class="hint">{copy.doorsHow}</p>{/if}
    <!-- THE BUTTON OVER A LIST THAT HAS ROWS; an empty one carries it in its own state (G17), under what will be here. -->
    {#if owner && !(listed?.kind === 'doors' && doors.length === 0)}<div class="row-actions"><Button weight="quiet" onclick={() => (making = true)}>{actionWords.newDoor}</Button></div>{/if}
    {#if !owner}
      <p class="hint">{levelWords.ownersOnly}</p>
    {:else if listed === null}
      <p class="hint" role="status">{copy.doorsReading}</p>
    {:else if listed.kind !== 'doors'}
      <p class="code-said" role="status" data-tone={toneOf(listed)}>{#if toneOf(listed)}<span class="glyph" aria-hidden="true"><Icon name="alert" /></span>{/if}{lineOf(listed)}</p>
      {#if listed.kind === 'signin'}
        <div class="row-actions">
          <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
        </div>
      {/if}
    {:else if doors.length === 0}
      {#snippet newDoor()}<Button weight="quiet" onclick={() => (making = true)}>{actionWords.newDoor}</Button>{/snippet}
      <!-- ITS STATE, THEN WHAT ONE IS (settings lane, 3 Nov): "Each address you make is listed here" described the list. -->
      <Empty kind="no-data-yet" compact title="No web addresses yet." body={copy.doorsHow} agentPrompt={copy.doorsPrompt} actions={newDoor} />
    {:else}
      <p class="hint">{copy.doorsUnknown}</p>
      <ul class="doors">
        {#each doors as door (door.id)}
          {@const mine = said[door.id]}
          {@const flipped = flips[door.id]}
          {@const off = offLine(door, now)}
          <li class="door">
            <IconWell name="plug" size="l" />
            <div class="door-main">
              <p class="door-name">{door.name}</p>
              {#if door.register}
                <p class="hint">{copy.doorsWrites(door.register)}</p>
              {/if}
              {#if door.on !== null}
                <!-- OFF IS SAID IN WORDS, in ink, so the state never rests on the switch's fill alone. -->
                {#if off}<p class="door-off">{off}</p>{/if}
                <p class="hint">{lastLine(door, now)}</p>
                <p class="code-said" role="status" data-tone={toneOf(flipped)}>{#if toneOf(flipped)}<span class="glyph" aria-hidden="true"><Icon name="alert" /></span>{/if}{lineOf(flipped)}</p>
                {#if flipped?.kind === 'signin'}
                  <div class="row-actions">
                    <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
                  </div>
                {/if}
              {/if}
              {#if !door.mintable}
                <p class="hint">{copy.doorsOtherCheck}</p>
              {:else}
                <p class="hint">{door.held ? copy.doorsHeld : copy.doorsNotHeld}</p>
                {#if mine?.kind === 'minted'}
                  {@const minted = mine}
                  <!-- SHOWN ONCE, from `said` alone. THE SENTENCE IS PASSED to `clipboard.put` as `said`, so the toast is
                       that one line: passed only as the label it read "Copied Address copied.", and with
                       neither it would quote the text, which is a live credential. -->
                  <div class="code-form">
                    <p class="code-label">{copy.doorsOnce}</p>
                    {#if minted.url}
                      <p class="mono wrap">{minted.url}</p>
                      <div class="row-actions">
                        <Button weight="primary" onclick={() => void clipboard.put(minted.url ?? '', copy.doorsUrlCopied, copy.doorsUrlCopied)}>{copy.doorsCopyUrl}</Button>
                      </div>
                      <p class="hint">{copy.doorsPost}</p>
                    {:else}
                      <!-- NO PATH IN THE ANSWER, SO NO ADDRESS. The token is still the only copy there will be, so it is
                           shown rather than thrown away, with the sentence that says why the address is missing. -->
                      <p class="mono wrap">{minted.token}</p>
                      <div class="row-actions">
                        <Button weight="primary" onclick={() => void clipboard.put(minted.token, copy.doorsTokenCopied, copy.doorsTokenCopied)}>{copy.doorsCopyToken}</Button>
                      </div>
                      <p class="hint">{copy.doorsNoAddress}</p>
                    {/if}
                  </div>
                {/if}
                {#if asking === door.id}
                  <!-- THE CONFIRM IS IN PLACE OF THE BUTTON, as `ClearExamples` asks: the press that replaces sits where
                       the first press was, and keeping the old one is the quieter of the two. -->
                  <p class="code-said">{copy.doorsReplaceAsk}</p>
                  <div class="row-actions">
                    <Button weight="primary" tone="bad" disabled={busy !== null} onclick={() => void mint(door.id)}>{copy.doorsReplace}</Button>
                    <Button weight="bare" disabled={busy !== null} onclick={() => (asking = null)}>{copy.doorsKeep}</Button>
                  </div>
                {:else}
                  <div class="row-actions">
                    <Button weight={door.held ? 'quiet' : 'primary'} disabled={busy !== null} onclick={() => press(door)}>
                      {busy === door.id ? copy.doorsMinting : door.held ? copy.doorsRemint : copy.doorsMint}
                    </Button>
                  </div>
                {/if}
                <!-- Always in the document: a live region inserted with its first sentence is not reliably announced. -->
                <p class="code-said" role="status" data-tone={toneOf(mine)}>{#if toneOf(mine)}<span class="glyph" aria-hidden="true"><Icon name="alert" /></span>{/if}{lineOf(mine)}</p>
                {#if mine?.kind === 'signin'}
                  <div class="row-actions">
                    <Button weight="quiet" disabled={reproving} onclick={() => void signInAgain()}>{copy.signInAgain}</Button>
                  </div>
                {/if}
              {/if}
            </div>
            {#if door.on !== null}
              <!-- THE HOUSE SWITCH (`controls.css`), 44px under a thumb. Its name says what on means for this door. -->
              <button
                type="button"
                class="switch"
                role="switch"
                aria-checked={door.on}
                aria-label={switchLabel(door)}
                disabled={flipping !== null}
                onclick={() => void flip(door.id, door.on !== true)}><span class="switch-track"></span></button
              >
            {/if}
          </li>
        {/each}
      </ul>
      <p class="hint">{copy.doorsFreshWhy}</p>
    {/if}
  </div>
</Tile>

{#if owner}
  <NewAction open={making} kind="door" onclose={made} />
{/if}

<style>
  /* THE SETTINGS PAGE'S OWN RULES, REPEATED, because its styles are scoped to it and do not reach inside a component:
     the mail section above this one draws the same shown-once block, and the two must read as one screen. */
  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .doors {
    display: flex;
    flex-direction: column;
    margin: 0 0 var(--sp-3);
    padding: 0;
    list-style: none;
  }

  /* A DOOR IS A ROW ON THE GROUND: the plug in its well beside everything the door says and offers, and a hairline
     between two doors, as between any two rows. */
  .door {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--sp-3);
    padding-block: var(--sp-3);
  }

  .door + .door {
    border-block-start: 1px solid var(--rule);
  }

  .door-main {
    min-inline-size: 0;
  }

  .door-main > :last-child {
    margin-block-end: 0;
  }

  /* THE NAME AS A ROW TITLE, 15 at 500, level with the middle of its well. */
  .door-name {
    margin: 0 0 2px;
    padding-block-start: 6px;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: 20px;
  }

  .door .hint {
    margin-block-end: var(--sp-1);
  }

  /* THE OFF LINE, in ink at the row's size, because it is the one fact about the door that changed. */
  .door-off {
    margin: 0 0 var(--sp-1);
    color: var(--ink);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
  }

  /* THE ADDRESS SHOWN ONCE, as the mail section above it in Settings draws its own, so the two read as one screen. */
  .code-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin-block-start: var(--sp-3);
  }

  .code-form .hint {
    margin: 0;
  }

  .code-label {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* A TOKEN IS ONE 43-CHARACTER WORD and the address is longer, so without this the body scrolls sideways at 320px. */
  .wrap {
    margin: 0;
    overflow-wrap: anywhere;
  }

  /* AN ADDRESS IS SET IN GEIST MONO. */
  .mono {
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    letter-spacing: 0;
  }

  /* WHAT THE RECORD SAID, in the second ink; a refusal after a red glyph and in ink, so the words carry it. */
  .code-said {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .code-said[data-tone='bad'] {
    color: var(--ink);
  }

  .glyph {
    display: inline-flex;
    flex: none;
    margin-block-start: 1px;
    color: var(--red);
  }

  .row-actions {
    flex-wrap: wrap;
    display: flex;
    gap: var(--sp-2);
    margin-block: var(--sp-3) var(--sp-2);
  }

</style>
