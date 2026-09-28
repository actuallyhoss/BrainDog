<!--
  "Share a read-only link" for one page: the button, and the sheet that makes the link and shows it once.

  SELF-CONTAINED, so the page head places it with one line, `<ShareMenu slug={...} />` (contracts §8, COL-7), and owns
  nothing of it. What it writes is `share-write.ts`'s.

  THE LINK IS SHOWN ONCE AND KEPT NOWHERE. The record never holds it (the host signs it after the record answers), so it
  lives in this sheet's memory until the sheet closes, and closing forgets it. A person who lost it closes it in Settings
  under Links and makes another; there is no way to see a link again, which is what makes one safe to hand out.

  ONLY AN OWNER CAN MAKE ONE (`openShare` is ADMIN). The button is drawn for everybody the head is drawn for, and anybody
  else is told the record's own sentence when they press it, rather than this guessing at a level it does not read.
-->
<script lang="ts">
  import { apiBase } from '../at.ts';
  import { put } from '../clipboard.ts';
  import { day } from 'braindog-render';
  import { linkOf, openLink, daysSaid, SHARE_DAYS, SHARE_DAYS_DEFAULT, words } from '../record/share-write.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  let { slug }: { slug: string } = $props();

  let open = $state(false);
  let days = $state<number>(SHARE_DAYS_DEFAULT);
  let busy = $state(false);
  let made = $state<{ link: string; until: string } | null>(null);
  let refused = $state<string | null>(null);

  /** Every id carries the page, so two menus on one screen never share one. */
  const ids = $derived(`share-${slug}-`);

  function show() {
    made = null;
    refused = null;
    days = SHARE_DAYS_DEFAULT;
    open = true;
  }

  /* CLOSING FORGETS THE LINK, which is the whole of "shown once". */
  function forget() {
    open = false;
    made = null;
    refused = null;
  }

  /** One press makes one link: a second press while the first is out does nothing. */
  async function make() {
    if (busy) return;
    busy = true;
    refused = null;
    try {
      const out = await openLink(apiBase(), slug, days);
      if (out.ok) made = { link: linkOf(out.value.url, globalThis.location.origin), until: day(out.value.expires_at.slice(0, 10)) };
      else refused = out.fix;
    } finally {
      busy = false;
    }
  }
</script>

<Button onclick={show}>
  <Icon name="link" size="s" />
  {words.shareOpen}
</Button>

<Sheet bind:open title={words.shareTitle} onclose={forget}>
  <div class="share">
    {#if made}
      <p class="once" id="{ids}once">{words.shareOnce}</p>
      <label class="share-label" for="{ids}link">{words.shareLinkLabel}</label>
      <!-- A TEXTAREA AND NOT AN INPUT, so a link longer than the sheet wraps and can be read whole at 390px. Read only,
           and selected on focus, so a long press or a click takes all of it. -->
      <textarea
        class="share-link"
        id="{ids}link"
        readonly
        rows="3"
        spellcheck="false"
        aria-describedby="{ids}once"
        value={made.link}
        onfocus={(e) => e.currentTarget.select()}></textarea>
      <div class="share-actions">
        <Button weight="primary" onclick={() => made && void put(made.link, words.shareLinkLabel, words.shareCopied)}>
          <Icon name="copy" size="s" />
          {words.shareCopy}
        </Button>
        <Button weight="bare" onclick={forget}>{words.shareDone}</Button>
      </div>
      <p class="share-hint">{words.shareUntil(made.until)}</p>
      <Button weight="bare" onclick={() => (made = null)}>{words.shareAnother}</Button>
    {:else}
      <p class="share-hint">{words.shareLead}</p>
      <div class="segmented" role="group" aria-label={words.shareDays}>
        {#each SHARE_DAYS as n (n)}
          <button type="button" class="segment" data-on={days === n ? '' : undefined} aria-pressed={days === n ? 'true' : 'false'} onclick={() => (days = n)}
            >{daysSaid(n)}</button
          >
        {/each}
      </div>
      {#if refused}<p class="refused" role="alert">{refused}</p>{/if}
      <div class="share-actions">
        <Button weight="primary" disabled={busy} aria-busy={busy ? 'true' : undefined} onclick={() => void make()}>
          {busy ? words.shareMaking : words.shareMake}
        </Button>
      </div>
    {/if}
  </div>
</Sheet>

<style>
  .share {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .once {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .share-label {
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  /* The link wraps anywhere: a token has no spaces to break at, and a sideways scroll inside a sheet on a phone hides
     the half that matters. */
  .share-link {
    inline-size: 100%;
    min-block-size: var(--ctl-h);
    padding: var(--sp-2) var(--sp-3);
    background: var(--s3);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
    word-break: break-all;
    resize: none;
  }

  .share-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* COPY IS 44 ON BOTH AXES, whatever the pointer: it is the one control this sheet exists for, pressed on a phone. */
  .share-actions :global(.btn) {
    min-block-size: var(--tap);
    min-inline-size: var(--tap);
  }

  .share-hint {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .refused {
    margin: 0;
    color: var(--danger);
    font-size: var(--t-sm);
  }

  @media (max-width: 640px) {
    .share-actions :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
