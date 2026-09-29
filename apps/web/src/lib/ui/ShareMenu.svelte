<!--
  "Share a read-only link" for one page: the button, and the sheet that makes the link and shows it once.

  SELF-CONTAINED, so the page head places it with one line, `<ShareMenu slug={...} />` (contracts §8, COL-7), and owns
  nothing of it. What it writes is `share-write.ts`'s.

  THE LINK IS SHOWN ONCE AND KEPT NOWHERE. The record never holds it (the host signs it after the record answers), so it
  lives in this sheet's memory until the sheet closes, and closing forgets it. A person who lost it closes it in Settings
  under Links and makes another; there is no way to see a link again, which is what makes one safe to hand out.

  ONLY AN OWNER CAN MAKE ONE (`openShare` is ADMIN). The button is drawn for everybody the head is drawn for, and anybody
  else is told the record's own sentence when they press it, rather than this guessing at a level it does not read.

  "SHARE AS A TEMPLATE" LIVES IN THE SAME SHEET (PLT-14), so the page head keeps its one line. It reads the page as the
  record stores it, makes a pack of that page alone (`lib/market/template.ts`), and says what the pack adds, what it
  reads, what it calls out to and the page as drawn now, before Download or Publish. Publishing sends the file to the
  Kennel as the signed-in person (`lib/market/publish.ts`), and the answer is one sentence with a link.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { createClient } from '@braindog/client';
  import { apiBase, at } from '../at.ts';
  import { put } from '../clipboard.ts';
  import { day } from 'braindog-render';
  import { sourceOf } from '../dog/read.ts';
  import { saveDog } from '../dog/source.ts';
  import { kennelFetch, nextVersion, publishedHref, publishedLink, publishedSaid, publishWords, submitToKennel, type Submitted } from '../market/publish.ts';
  import { templateOf, templateWords, wordsOf, type Template, type TemplateSetting } from '../market/template.ts';
  import { words as market } from '../market/words.ts';
  import { linkOf, openLink, daysSaid, SHARE_DAYS, SHARE_DAYS_DEFAULT, words } from '../record/share-write.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { toasts } from './toast.svelte.ts';

  let { slug }: { slug: string } = $props();

  let open = $state(false);
  let days = $state<number>(SHARE_DAYS_DEFAULT);
  let busy = $state(false);
  let made = $state<{ link: string; until: string } | null>(null);
  let refused = $state<string | null>(null);

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
    mode = 'link';
    open = true;
  }

  /* CLOSING FORGETS THE LINK, which is the whole of "shown once". */
  function forget() {
    open = false;
    made = null;
    refused = null;
    mode = 'link';
  }

  /* ── as a template ───────────────────────────────────────────────────── */

  type Shell = { index?: { registers?: { id: string; name: string }[] }; people?: { id: string; name: string }[] };
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

<Sheet bind:open title={mode === 'template' ? templateWords.title : words.shareTitle} onclose={forget}>
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
      <Button weight="bare" onclick={() => void asTemplate()}>{templateWords.open}</Button>
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
    font-weight: 500;
  }

  /* The link wraps anywhere: a token has no spaces to break at, and a sideways scroll inside a sheet on a phone hides
     the half that matters. */
  /* A FIELD: the `--s1` fill with no border, radius `--r-md`, as `controls.css` draws `.field` (SYSTEM §6). */
  .share-link {
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--s1);
    border: 0;
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

  /* THE TEMPLATE'S FACTS: a small heading over each, and the lines under it in the sheet's one column. */
  .share-h {
    margin: var(--sp-2) 0 0;
    color: var(--dim);
    font-size: var(--t-sm);
    font-weight: 500;
  }

  .share-list {
    display: grid;
    gap: var(--sp-1);
    margin: 0;
    padding-inline-start: var(--sp-5);
    color: var(--ink2);
    font-size: var(--t-sm);
  }

  .share-line {
    margin: 0;
    color: var(--ink2);
    font-size: var(--t-sm);
    overflow-wrap: anywhere;
  }

  /* The answer is one sentence, and its link is ink and underlined: red is never a link here. */
  .share-sent {
    margin: 0;
    color: var(--ink);
    font-size: var(--t-sm);
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
