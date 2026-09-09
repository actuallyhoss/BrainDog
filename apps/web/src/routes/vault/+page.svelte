<!--
  The Vault: what each key OPENS, and when each was last rotated. Never the value.

  Three things make it safe rather than convenient, and none of them may be relaxed:

    - No agent tool returns a secret. The whole /api/vault surface is refused to agents, because a
      tool reaching every credential in the estate would sit in the system prompt of every session
      on every turn — which is the highest-value thing prompt injection could ask for.
    - Reveal is deliberate and audited, with your name on the row.
    - THE BACKUP BENEFIT AND THE EXFILTRATION PATH ARE THE SAME OBJECT. That sentence is why this
      screen indexes what a key opens and stops there (12 §6).

  `/vault` carries NOTHING in its query string, ever. A credential id in the address is an entry in
  browser history and in URL-bar autocomplete (19 §5).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { TONES, relative } from 'braindog-render';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { copy } from '$lib/copy.ts';
  import { NOW, VAULT } from '$lib/record/api.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Chip from '$lib/ui/Chip.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { drew } from '../../lib/ui/screen.svelte.ts';

  const stale = $derived(VAULT.filter((c) => c.stale).length);

  /**
   * THIS SCREEN COMPUTES ITS CONTENT SYNCHRONOUSLY, and says so.
   *
   * `data-screen` on `<main id="main">` is what lets anything outside the page tell a drawn screen
   * from a shell that has fetched nothing. Four browser gates waited on `#main` having a child,
   * with the wait swallowed by a `catch`, which is satisfied by a page heading and means nothing
   * the day a screen fetches. `Empty` says `empty` or `refused` for the states it draws; this is
   * the other claim, and it is true of this screen today.
   *
   * IT STOPS BEING AVAILABLE WHEN IT STOPS BEING TRUE. A screen that starts fetching brackets its
   * reads with `opened()` and `closed()`, and a call still out takes the attribute away whatever
   * this line says.
   */
  $effect(() => drew('ready'));
</script>

<svelte:head><title>{titleOf(copy.vault)}</title></svelte:head>

<PageHead icon="vault" title={copy.vault} count={VAULT.length}>
  {#snippet actions()}
    <!-- ONE SENTENCE, FROM ONE PLACE. This was typed here AND sat unrendered in `copy.ts` as
         `staleKey` — the same fact written twice, with the reviewable copy the dead one. -->
    {#if stale}<Chip label={copy.staleCount(stale)} tone="warn" />{/if}
  {/snippet}
</PageHead>

<div class="page">
  <!-- AND WHAT A VAULT ROW IS. The screen showed a title, a count and a list of key names with
       nothing saying that the value is never here — which is the single most important fact about
       this surface, and `vaultBlurb` had it, unrendered, in `copy.ts`. -->
  <p class="blurb">{copy.vaultBlurb}</p>

  <ul class="ledger">
    <!-- A NEW RECORD HAS NO CREDENTIALS IN IT, and this was a bare `{#each}` over the list: a
       heading, a `0`, one sentence of standing prose, and then nothing at all. `19 §6` names the
       state and asks for a line saying what belongs here; the vault's own framing sentence already
       says what that is, so the state says where one comes from. -->
  {#if VAULT.length === 0}
    <Empty kind="no-data-yet" title={copy.vaultEmpty} body={copy.vaultHolds} />
  {/if}

  {#each VAULT as c}
      <li>
        <div class="line">
          <!-- THE KIND AS A READER SAYS IT. `api_token` is what the column holds; `12 §6` closes
               the list at five and `19 §9` bans the word this screen used for three of them. -->
          <span class="seq">{copy.credentialKinds[c.kind] ?? c.kind}</span>
          <span class="line-main">
            <span class="line-title">{c.label}</span>
            <span class="line-detail">{copy.opens}: {c.opens}</span>
          </span>
          <span class="line-amount">
            <!-- IT SAYS WHAT IT WOULD DO. A reveal is the one action in this product that is
                 audited with your name on it, and a button that does nothing under a warning
                 saying so teaches somebody the warning is decorative. -->
            <Button
              weight="bare"
              onclick={() =>
                toasts.push(copy.notWritten(`${c.label} would be decrypted once and the read logged against you`), {
                  intent: 'warn',
                })}
            >
              <Icon name="eye" size="s" />
              {copy.reveal}
            </Button>
          </span>
          <!-- A STALE CREDENTIAL WAS AMBER AND NOTHING ELSE. `13 §5.1`: colour never carries
               meaning alone. "14 months ago" in warn amber says "rotate this" to somebody who sees
               the amber and says nothing at all to anybody else — on the one screen in the product
               where not noticing has a cost measured in somebody else's access to your accounts. -->
          <span class="line-when" data-intent={c.stale ? 'warn' : undefined}>
            {#if c.stale}
              <span class="glyph" role="img" aria-label={TONES.warn.label}>{TONES.warn.glyph}</span>
            {/if}
            <!-- THE COLUMN SAYS WHAT THE DATE IS. "14 months ago" beside a credential label is a
                 date with no noun: rotated? created? last opened? All three are on this row's DDL
                 (`12 §6`) and only one is on screen. `copy.rotated` existed for this and rendered
                 nowhere. -->
            <span class="rotated-key">{copy.rotated}</span>
            {relative(c.rotated, NOW)}
          </span>
        </div>
      </li>
    {/each}
  </ul>

  <p class="note">
    <Icon name="alert" size="s" />
    {copy.revealWarning}
  </p>
</div>

<style>
  /**
   * THE ROTATION COLUMN NEEDS THE WIDTH IT USES.
   *
   * The ledger's trailing track is `9ch`, which is a date; this holds a glyph, the word *Rotated*
   * and a relative age. Measured: the *Reveal once* button ends at x 1099 and "⚠︎ Rotated 10mo ago"
   * starts at 1079 — twenty pixels of overlap, painting the warning triangle inside the word. Only
   * the two rows carrying the glyph collide, which is why it survived: the four without it clear the
   * button by a few pixels, so four rows out of six looked correct.
   *
   * `auto` for both trailing tracks. Scoped here rather than in `rows.css`, and above 640px only,
   * for the same two reasons `/packs` carries the identical guard: 9ch is right for a date
   * everywhere else, and below 640 the row is a card whose placements a component `<style>` would
   * override.
   */
  @media (width >= 640px) {
    .ledger :global(.line) {
      grid-template-columns: 12ch minmax(0, 1fr) auto auto;
    }
  }

  .rotated-key {
    color: var(--dim);
    font-size: var(--t-xs);
  }

  /* One sentence saying what the things on this screen are, in the person's words. */
  .blurb {
    margin-block-end: var(--sp-4);
    max-inline-size: 62ch;
    color: var(--ink2);
    font-size: var(--t-ui);
    line-height: 1.6;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6) var(--sp-9);
    max-inline-size: 1000px;
  }

  .note {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-xs);
  }

  @media (width < 900px) {
    .page {
      padding: var(--sp-4) var(--sp-4) var(--sp-8);
    }
  }
</style>
