<!--
  "Share a read-only link" for one page: the button, and the sheet that makes the link and shows it once.

  SELF-CONTAINED, so the page head places it with one line, `<ShareMenu slug={...} />`, and owns
  nothing of it. What it writes is `share-write.ts`'s.

  THE LINK IS SHOWN ONCE AND KEPT NOWHERE. The record never holds it (the host signs it after the record answers), so it
  lives in this sheet's memory until the sheet closes, and closing forgets it. A person who lost it closes it in Settings,
  under People & sharing, and makes another; there is no way to see a link again, which is what makes one safe to hand out.

  NO PRESS THAT FAILS. Once for the page, silently, Share asks `shareable` (`shareableOnce`), and "Share a read-only link" is drawn
  only on yes. An owner on a host that makes no links reads the host's own sentence instead; anybody who is not an owner
  reads the record's own sentence for that (`shareable` is ADMIN, as `openShare` is), rather than this guessing at a
  level it does not read. "Share as a template" is offered either way.

  "SHARE WITH PEOPLE" IS THE SAME CONTROL'S FIRST CHOICE when the page can be shared with somebody:
  the button becomes a menu of three, With people, A read-only link and As a template, so the page head stays Share and
  "⋯" and never grows a third control. `people` is the page's way to the Share sheet; absent, it is the button.

  "SHARE AS A TEMPLATE" LIVES IN THE SAME SHEET, so the page head keeps its one line. It reads the page as the
  record stores it, makes a pack of that page alone (`lib/market/template.ts`), and says what the pack adds, what it
  reads, what it calls out to and the page as drawn now, before Download or Publish. Publishing sends the file to the
  Kennel as the signed-in person (`lib/market/publish.ts`), and the answer is one sentence with a link.
-->
<script lang="ts">
  import { focusWhenDrawn } from './keep-focus.ts';
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '../at.ts';
  import { put } from '../clipboard.ts';
  import { dateSaid } from 'braindog-render';
  import { recordNow } from '../record/boot-live.ts';
  import { sourceOf } from '../dog/read.ts';
  import { saveDog } from '../dog/source.ts';
  import { kennelFetch, nextVersion, publishedHref, publishedLink, publishedSaid, publishWords, submitToKennel, type Submitted } from '../market/publish.ts';
  import { templateOf, templateWords, wordsOf, type Template, type TemplateSetting } from '../market/template.ts';
  import { words as market } from '../market/words.ts';
  import { linkEmpty, linkOf, linksOff, openLink, daysSaid, shareableOnce, SHARE_DAYS, SHARE_DAYS_DEFAULT, words } from '../record/share-write.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Menu from './Menu.svelte';
  import Segmented from './Segmented.svelte';
  import Sheet from './Sheet.svelte';
  import { toasts } from './toast.svelte.ts';

  let {
    slug,
    people,
    peopleLabel,
    project = false,
  }: { slug: string; people?: (() => void) | undefined; peopleLabel?: string | undefined; project?: boolean } = $props();

  let open = $state(false);
  let days = $state<number>(SHARE_DAYS_DEFAULT);
  /**
   * WHETHER THE LINK CARRIES MONEY (AF18): off on a project's page until the sharer ticks it, since a project's bills
   * went to whoever held its link without anybody choosing that; on elsewhere, where a page of money is its money.
   */
  let money = $state(false);
  let busy = $state(false);
  let made = $state<{ link: string; until: string } | null>(null);
  let refused = $state<string | null>(null);
  /**
   * Whether this BrainDog makes links, asked once for the page and never said while asked (AH27). `off` is a host
   * that makes none, whose half of Share is hidden and said as coming (AH12); `no` is a sentence for this person.
   */
  let can = $state.raw<{ state: 'asking' } | { state: 'yes' } | { state: 'off' } | { state: 'no'; why: string }>({ state: 'asking' });
  let asks = 0;
  onMount(() => void ask());

  /**
   * WHETHER A LINK TO THIS PAGE WOULD SHOW NOTHING (AM21), asked of the record while the sheet is open, for the page and
   * the money tick as they stand. An answer for an older ask is dropped; no answer is not empty.
   */
  /* AND WHERE ONLY MONEY IS ON IT, that is what is said (AN14): Money with the tick off would show nothing, which is not a
     page with nothing on it. */
  let empty = $state<false | 'empty' | 'money'>(false);
  let emptyAsks = 0;
  $effect(() => {
    if (!open || can.state !== 'yes') {
      empty = false;
      return;
    }
    const n = (emptyAsks += 1);
    const [which, withMoney] = [slug, money];
    const client = createClient({ base: apiBase() });
    void linkEmpty(client, which, withMoney)
      .then(async (none) => (!none ? false : withMoney || (await linkEmpty(client, which, true)) ? 'empty' : 'money'))
      .then((said) => {
        if (n === emptyAsks) empty = said;
      });
  });

  /** Which of the sheet's two jobs it is doing: the read-only link, or the page as a template. */
  let mode = $state<'link' | 'template'>('link');
  let template = $state.raw<{ state: 'reading' } | { state: 'ready'; made: Template } | { state: 'refused'; fix: string }>({ state: 'reading' });
  let sending = $state(false);
  let sent = $state.raw<(Submitted & { title: string }) | null>(null);
  let unsent = $state<string | null>(null);

  /** Every id carries the page, so two menus on one screen never share one. */
  const ids = $derived(`share-${slug}-`);

  function show() {
    made = null;
    refused = null;
    days = SHARE_DAYS_DEFAULT;
    money = !project;
    mode = 'link';
    open = true;
    void ask();
  }

  /** Why somebody who is not an owner makes no read-only link, said without asking the record. */
  const ONLY_OWNER = 'Only the owner can make a read-only link to a page.';

  /** Ask `shareable`. An answer for a sheet opened again since is dropped, so the newest ask is the one drawn. */
  async function ask() {
    const n = (asks += 1);
    /* NOT ASKED FOR SOMEBODY WHO IS NOT AN OWNER (collab pass 3): `shareable` is ADMIN and answered them a 403 on every
       page they opened. They read why here instead. */
    if (shell.me?.owner !== true) return void (can = { state: 'no', why: ONLY_OWNER });
    const said = await shareableOnce(apiBase(), createClient({ base: apiBase() }));
    if (n !== asks) return;
    can = said.can ? { state: 'yes' } : linksOff(said) ? { state: 'off' } : { state: 'no', why: said.why ?? words.shareOff };
  }

  /* CLOSING FORGETS THE LINK, which is the whole of "shown once". */
  function forget() {
    open = false;
    made = null;
    refused = null;
    mode = 'link';
  }

  /* ── as a template ───────────────────────────────────────────────────── */

  type Shell = { index?: { registers?: { id: string; name: string }[] }; people?: { id: string; name: string }[]; me?: { owner?: boolean } };
  const shell = $derived(page.data as Shell);

  /** A list by the name this record gives it, as the rail says it. */
  const listName = (id: string): string => shell.index?.registers?.find((r) => r.id === id)?.name ?? wordsOf(id);

  /** A setting as the sheet says it: with what it holds now when that is a name, never when it is an id. */
  function settingSaid(s: TemplateSetting): string {
    const now = s.names === 'project' ? s.value : s.names === 'person' ? (shell.people?.find((p) => p.id === s.value)?.name ?? null) : null;
    return now === null ? templateWords.setting(s.label) : templateWords.settingNow(s.label, now);
  }

  const fixOf = (out: object): string => ('refusal' in out ? ((out as { refusal: { fix: string } }).refusal.fix ?? templateWords.unread) : templateWords.unread);

  /** Read the page, the packs that hold its lists and the record's format, then make the pack. Nothing is written. */
  async function asTemplate() {
    mode = 'template';
    template = { state: 'reading' };
    sent = null;
    unsent = null;
    const client = createClient({ base: apiBase() });
    const [stored, packs, version] = await Promise.all([sourceOf(apiBase(), slug), client.packs(), client.version()]);
    if ('fix' in stored) template = { state: 'refused', fix: stored.fix };
    else if (!packs.ok) template = { state: 'refused', fix: fixOf(packs) };
    else if (!version.ok) template = { state: 'refused', fix: fixOf(version) };
    else {
      const input = { body: stored.body, states: packs.value, format: version.value.format, primitives: version.value.primitives };
      /* THE VERSION COUNTS ON FROM THE ONE THE KENNEL LISTS UNDER THIS ID, so a second publish is not refused as a copy. */
      const first = templateOf(input);
      template = { state: 'ready', made: templateOf({ ...input, version: await nextVersion(kennelFetch, 'pack', first.id) }) };
    }
  }

  function downloadTemplate() {
    if (template.state !== 'ready') return;
    saveDog(template.made.file, template.made.text);
    toasts.push(templateWords.downloaded(template.made.file), { intent: 'good' });
  }

  /** One press sends one file: a second press while the first is out does nothing. */
  async function publishTemplate() {
    if (template.state !== 'ready' || sending) return;
    const t = template.made;
    sending = true;
    unsent = null;
    try {
      const out = await submitToKennel(kennelFetch, t.text);
      if (out.ok) sent = { ...out.value, title: t.title };
      else unsent = out.fix;
    } finally {
      sending = false;
    }
  }

  /** One press makes one link: a second press while the first is out does nothing. */
  async function make() {
    if (busy) return;
    busy = true;
    refused = null;
    try {
      const out = await openLink(apiBase(), slug, days, money);
      if (out.ok) {
        made = { link: linkOf(out.value.url, globalThis.location.origin), until: dateSaid(out.value.expires_at.slice(0, 10), recordNow()) };
        /* COPY THE LINK TAKES THE FOCUS (first-hour audit AH20): Make the link is gone from under it once the link is drawn. */
        const from = document.activeElement;
        focusWhenDrawn(() => document.getElementById(`${ids}link`)?.parentElement?.querySelector<HTMLElement>('.share-actions a, .share-actions button'), from);
      } else refused = out.fix;
    } finally {
      busy = false;
    }
  }
</script>

{#if people}
  <Menu label={words.shareOpen} align="end">
    {#snippet trigger()}<span class="share-trigger"><Icon name="link" size="s" /><span class="share-word">{words.shareOpen}</span></span>{/snippet}
    <button type="button" role="menuitem" data-share-people onclick={() => people?.()}><Icon name="user-plus" size="s" />{peopleLabel ?? words.shareOpen}</button>
    {#if can.state !== 'off'}<button type="button" role="menuitem" onclick={show}><Icon name="link" size="s" />{words.shareTitle}</button>{/if}
    <button type="button" role="menuitem" onclick={() => { show(); void asTemplate(); }}><Icon name="doc" size="s" />{templateWords.open}</button>
  </Menu>
{:else}
  <Button onclick={show}>
    <Icon name="link" size="s" />
    {words.shareOpen}
  </Button>
{/if}

<Sheet bind:open fit title={mode === 'template' ? templateWords.title : can.state === 'yes' ? words.shareTitle : words.shareOpen} onclose={forget}>
  <div class="share">
    {#if mode === 'template'}
      {#if template.state === 'reading'}
        <p class="share-hint" role="status">{templateWords.reading}</p>
      {:else if template.state === 'refused'}
        <p class="refused" role="alert">{template.fix}</p>
      {:else}
        {@const t = template.made}
        <p class="share-hint">{templateWords.lead}</p>
        <h3 class="share-h" id="{ids}adds">{market.adds}</h3>
        <ul class="share-list" aria-labelledby="{ids}adds">
          <li>{templateWords.addsPage(t.title)}</li>
          {#each t.settings as s (s.key)}<li>{settingSaid(s)}</li>{/each}
        </ul>
        <h3 class="share-h">{templateWords.reads}</h3>
        <p class="share-line">{t.reads.length > 0 ? t.reads.map(listName).join(', ') : templateWords.readsNothing}</p>
        <h3 class="share-h">{market.calls}</h3>
        <p class="share-line">{t.hosts.length > 0 ? market.callsOut(t.hosts) : market.callsNothing}</p>
        <h3 class="share-h" id="{ids}drawn">{templateWords.drawn}</h3>
        {#if t.headings.length > 0}
          <ol class="share-list" aria-labelledby="{ids}drawn">
            {#each t.headings as h, i (i)}<li>{h}</li>{/each}
          </ol>
        {:else}
          <p class="share-line">{templateWords.drawnNone}</p>
        {/if}
        {#if sent}
          <p class="share-sent" role="status">{publishedSaid(sent)} <a href={at(publishedHref(sent))}>{publishedLink(sent)}</a></p>
        {/if}
        {#if unsent}<p class="refused" role="alert">{unsent}</p>{/if}
        <div class="share-actions">
          <Button weight="primary" onclick={downloadTemplate}>{templateWords.download}</Button>
          <Button disabled={sending} aria-busy={sending ? 'true' : undefined} onclick={() => void publishTemplate()}>
            {sending ? publishWords.publishing : publishWords.publish}
          </Button>
        </div>
      {/if}
      <Button weight="bare" onclick={() => (mode = 'link')}>{templateWords.back}</Button>
    {:else if made}
      <p class="once" id="{ids}once">{words.shareOnce}</p>
      <!-- THE LINK IS SAID AS READY, NEVER SPELT OUT (AM21): its whole address is the record's id and a signature, and the
           box read "https://…/s#rec_01M6…". Copy the link is the press it is here for; where the clipboard refuses, the
           address is under Show the link, one line that scrolls and is selected on focus (AH29). -->
      <p class="share-ready" id="{ids}link"><Icon name="check" size="s" />{words.shareReady}</p>
      <div class="share-actions">
        <Button weight="primary" onclick={() => made && void put(made.link, words.shareLinkLabel, words.shareCopied)}>
          <Icon name="copy" size="s" />
          {words.shareCopy}
        </Button>
        <Button weight="bare" onclick={forget}>{words.shareDone}</Button>
      </div>
      <p class="share-hint">{words.shareUntil(made.until)}</p>
      <details class="share-show">
        <summary class="share-show-h">{words.shareShow}</summary>
        <label class="share-label" for="{ids}address">{words.shareLinkLabel}</label>
        <input
          class="share-link"
          id="{ids}address"
          type="text"
          readonly
          spellcheck="false"
          autocomplete="off"
          aria-describedby="{ids}once"
          value={made.link}
          onfocus={(e) => e.currentTarget.select()} />
      </details>
      <Button weight="bare" onclick={() => (made = null)}>{words.shareAnother}</Button>
    {:else if can.state === 'asking'}
      <!-- THE ASK IS SILENT (AH27): it said "Checking whether this BrainDog makes links" after unrelated presses. -->
      <Button weight="bare" onclick={() => void asTemplate()}>{templateWords.open}</Button>
    {:else if can.state === 'off'}
      <!-- LINKS NOT ON THIS HOST YET (AH12): the link half is hidden, and said as coming. -->
      <p class="share-line">{words.shareComing}</p>
      <Button weight="bare" onclick={() => void asTemplate()}>{templateWords.open}</Button>
    {:else if can.state === 'no'}
      <!-- THE RECORD'S SENTENCE FOR THIS PERSON, and no press for a link it would refuse. -->
      <p class="share-line">{can.why}</p>
      <Button weight="bare" onclick={() => void asTemplate()}>{templateWords.open}</Button>
    {:else}
      <p class="share-hint">{words.shareLead}</p>
      <Segmented role="group" aria-label={words.shareDays}>
        {#each SHARE_DAYS as n (n)}
          <button type="button" class="segment" data-on={days === n ? '' : undefined} aria-pressed={days === n ? 'true' : 'false'} onclick={() => (days = n)}
            >{daysSaid(n)}</button
          >
        {/each}
      </Segmented>
      <label class="share-money">
        <input type="checkbox" bind:checked={money} aria-describedby="{ids}money-why" />
        <span class="share-money-words">
          <span>{words.shareMoney}</span>
          <span class="share-hint" id="{ids}money-why">{words.shareMoneyWhy}</span>
        </span>
      </label>
      <!-- A PAGE WHOSE LINK WOULD SHOW NOTHING SAYS SO BEFORE THE LINK IS MADE (AM21), as the record reads it for this
           tick of money (`shareable` with the page): an empty Money made a 30-day link to "nothing a link can show". -->
      {#if empty}<p class="share-empty" role="status"><Icon name="info" size="s" />{empty === 'money' ? words.shareEmptyMoney : words.shareEmpty}</p>{/if}
      {#if refused}<p class="refused" role="alert">{refused}</p>{/if}
      <div class="share-actions">
        <Button weight="primary" disabled={busy} aria-busy={busy ? 'true' : undefined} onclick={() => void make()}>
          {busy ? words.shareMaking : words.shareMake}
        </Button>
      </div>
      <Button weight="bare" onclick={() => void asTemplate()}>{templateWords.open}</Button>
    {/if}
  </div>
</Sheet>

<style>
  /* THE MENU'S TRIGGER DRAWN AS THE QUIET BUTTON IT REPLACES: the tile's fill, radius 8, the glyph and the word at 14
     medium. Under 900px the page head draws it as the glyph alone in a 44px square, as it does every glyph button, and
     the word stays in it at no size as its name. */
  .share-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    box-sizing: border-box;
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: 20px;
    white-space: nowrap;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.menu-trigger:hover > .share-trigger) {
      background: var(--hover);
    }
  }

  /* ON A PHONE THE GLYPH KEEPS ITS WORD (Q46 of 29 October): a bare link glyph did not say it shares the page. */
  @media (width < 900px) {
    .share-trigger {
      min-block-size: var(--tap);
      padding-inline: var(--sp-2);
      background: none;
    }

    .share-trigger :global(.icon[data-size]) {
      inline-size: var(--icon-l);
      block-size: var(--icon-l);
    }
  }

  /* AND IN THE PHONE'S BAR THE WORD IS THE GLYPH'S NAME AND NOT DRAWN (leftovers 4, 2 Nov): a page whose hero holds its
     name hands Share and More to the bar (`PageHead`'s `bar-actions`), and beside them, search, the bell and the face the
     name had about 40px at 390 ("Kiln websi", "Ferme & Co"). The glyph alone there, as under 360px below; the head's own
     row, where there is room, keeps the word (Q46), and the sheet it opens is titled Share. */
  @media (width < 900px) {
    :global(.bar-actions) .share-trigger {
      inline-size: var(--tap);
      padding-inline: 0;
    }

    :global(.bar-actions) .share-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* UNDER 360PX THE WORD IS THE GLYPH'S NAME AND NOT DRAWN. At 320 the bar holds the way back, Share with its word, the
     page's more, search, the bell and the face, 326px of it, and the page's name had none; the glyph alone is the 44
     square it was before Q46, and a screen reader still reads Share. */
  @media (width < 360px) {
    .share-trigger {
      inline-size: var(--tap);
      padding-inline: 0;
    }

    .share-word {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  .share {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  /* THE DAYS AS THE HOUSE'S SEGMENTED CONTROL, as wide as its four words and no wider: stretched across the sheet its
     track ran on past "90 days" as an empty bar. The bare verbs under it sit at the start edge with the rest of the
     sheet's words, not centred under nothing. */
  .share > :global(.segmented),
  .share > :global(.btn[data-weight='bare']) {
    justify-self: start;
  }

  .share > :global(.btn[data-weight='bare']) {
    margin-inline-start: calc(-1 * var(--sp-3));
  }

  .once {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  .share-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  /* A FIELD ON ONE LINE: the `--tile-2` fill with no border, radius 8, as `controls.css` draws `.field`; the link scrolls
     inside it, and Copy the link takes it whole. */
  /* THE LINK, READY: one line with its tick, where the address stood (AM21). */
  .share-ready,
  .share-empty {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .share-empty {
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .share-show {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .share-show-h {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .share-show[open] > .share-show-h {
    margin-block-end: var(--sp-2);
  }

  .share-link {
    box-sizing: border-box;
    inline-size: 100%;
    min-inline-size: 0;
    min-block-size: var(--tap);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    text-overflow: ellipsis;
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
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE ONE TICK: its box beside its words, the reason under them in the hint's ink, a whole row to press. */
  .share-money {
    display: flex;
    align-items: start;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    color: var(--ink);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .share-money input {
    flex: none;
    margin-block-start: 3px;
  }

  .share-money-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .refused {
    margin: 0;
    color: var(--red);
    font-size: var(--fs-meta);
  }

  /* THE TEMPLATE'S FACTS: a small heading over each, and the lines under it in the sheet's one column. */
  .share-h {
    margin: var(--sp-2) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .share-list {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .share-line {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  /* The answer is one sentence, and its link is ink and underlined: red is never a link here. */
  .share-sent {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
  }

  .share-sent a {
    color: var(--ink);
    text-decoration: underline;
  }

  @media (width < 640px) {
    .share-actions :global(.btn) {
      flex: 1 1 100%;
    }
  }
</style>
