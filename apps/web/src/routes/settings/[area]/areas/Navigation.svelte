<!--
  Settings > Navigation, for the one frame (§52, nav A): what the app opens on, one list of what is in the sidebar and
  the bar with its order and Hide, then Add a page with a search, and the suggestions with the switch that stops them.
  The phone bar, its switches and the shape picker went with the frame of 23 October.

  EVERY SETTING HERE IS THE PERSON'S OWN ON A RECORD (`nav-prefs.svelte.ts`): the shape is `nav.shape`, the switch is
  `pen.suggest`, and every "Not this one" is appended to `pen.dismissed`, so a choice made on the laptop holds on the
  phone. The sample has no record, so there they stay on this device, and the screen says which it is.
-->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { dismiss, lineIn } from '$lib/motion';
  import { settle } from '$lib/ui/motion.ts';
  import { invalidateAll } from '$app/navigation';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { said as voiceSaid } from '$lib/voice.svelte.ts';
  import { glyphOf, iconOf, penCount, waiting, type Offer, type PenItem } from '$lib/design/pen.ts';
  import { cardWords, todayOf } from '$lib/decide/card.ts';
  import { shortDay } from 'braindog-render';
  import { penWords } from '$lib/design/words.ts';
  import type { Undone } from '$lib/design/keep.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import type { Rehearsed } from '../../../decide/[id]/proposed.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { navPrefs, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { closed, opened } from '$lib/ui/screen.svelte.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import IconWell from '$lib/ui/IconWell.svelte';
  import PageView from '$lib/page/PageView.svelte';
  import type { AreaProps } from '../settings-state.svelte.ts';
  import StateRow from './StateRow.svelte';
  import { widgetHeld } from '$lib/board/widget-held.svelte.ts';
  import Pages from './Pages.svelte';
  import { page } from '$app/state';
  import { untrack } from 'svelte';

  let { shell, area }: AreaProps = $props();

  /* THIS AREA'S OWN WORDS: the group the switch sits in, so the row inside can carry the switch's own name, and the
     order of the pages, which says what a press does in the person's own page names. */
  const words = {
    offers: 'Suggestions',
    waiting: (n: number) => (n === 1 ? 'One suggestion waits' : `${n} suggestions wait`),
    waitingWhy: 'Pages and widgets BrainDog thinks you would use',
    show: 'Show',
  };

  /* THE PEN WAITS BEHIND ITS COUNT (G10): its rows are a different job from the order of the sidebar above it, so the
     tile says how many wait and opens them on a press; the sidebar's "Review" link (`#suggestions`) opens them at once. */
  let penOpen = $state(false);
  $effect(() => {
    if (page.url.hash === '#suggestions') untrack(() => (penOpen = true));
  });

  /** A refusal is the record's own sentence, and a change it kept is said only once it kept it. */
  const said = (saved: Saved, done?: string) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
    else if (done !== undefined) toasts.push(done);
  };

  /* THE SWITCH. Off empties the pen and stops it refilling; the record's own offers come back with the next `boot`, so it
     is read again once the switch is kept. */
  async function flipSuggest() {
    const saved = await navPrefs.setSuggest(!navPrefs.suggest);
    said(saved);
    if (saved.from === 'kept') {
      forget();
      await invalidateAll();
    }
  }

  /* FORGET: what was learned from use before today no longer suggests a widget, and nothing put off waits. */
  async function forgetWidgets() {
    const saved = await widgetHeld.forget();
    toasts.push(saved.from === 'refused' ? saved.fix : 'Forgotten. Widget suggestions start again from today.', saved.from === 'refused' ? { intent: 'warn' } : {});
  }

  /* NO SHAPE IS OFFERED: one sidebar and one bar are drawn for everyone since nav A, so the pen holds the record's
     offers alone. */

  /* KEPT IN THIS VISIT, each with the one call that puts it back. The record stops offering a kept item on the next
     `boot`, so without this the row and its Put back would vanish together. */
  type KeptRow = { item: PenItem; putBack: () => Promise<Undone>; busy: boolean };
  let kept = $state<KeptRow[]>([]);
  /* ONE KEEP AT A TIME, so a double press writes once. */
  let keeping = $state<string | null>(null);

  /* ONE COUNT: the list and its number read the same three inputs, so they cannot say two things. */
  const gone = (id: string): boolean => navPrefs.isDismissed(id) || kept.some((k) => k.item.id === id);
  const offers = $derived(navPrefs.suggest ? waiting(shell.pen, gone) : []);
  const waitingCount = $derived(navPrefs.suggest ? penCount(shell.pen, gone) : 0);
  const idOf = (o: Offer): string => o.item.id;
  /* A PAGE OFFERED FOR A LIST IS SAID AS ONE, not as the list's bare name ("Snapshots" read as a page called that). */
  const titleOf = (o: Offer): string => (o.item.kind === 'page' && o.item.list !== undefined ? `A page for ${o.item.title}` : o.item.title);
  const whyOf = (o: Offer): string => o.item.why;
  /**
   * THE DAY AN OFFER STOPS WAITING, in Decide's own words ("Offered until 27 Oct", `card.ts`), on the reader's own calendar:
   * a day already come is said as today. An offer from a host older than `lapses` says nothing.
   */
  const lapseOf = (o: Offer): string | null => {
    const last = o.item.lapses;
    if (last === undefined) return null;
    const today = todayOf(Date.now());
    return last <= today ? cardWords.lapsesToday : cardWords.lapses(shortDay(last, today));
  };

  /**
   * "Keep it": the offer's whole declaration, written by the owner (`keep.ts`).
   *
   * NOTHING IS SAID UNTIL IT HAPPENED. The toast is the record's answer, and the shell reads `boot` again so a page kept
   * into the nav is in the rail before the toast has gone.
   */
  async function keep(o: Offer) {
    if (keeping !== null) return;
    const item = o.item;
    keeping = item.id;
    const at = opened();
    try {
      const { keepOffer } = await import('$lib/design/keep.ts');
      const out = await keepOffer(apiBase(), item);
      if (out.from === 'refused') {
        toasts.push(out.fix, { intent: 'warn' });
        return;
      }
      kept = [...kept, { item, putBack: out.putBack, busy: false }];
      const nav = item.change.to.body.nav;
      toasts.push(
        item.kind === 'icon'
          ? penWords.iconKept(item.title)
          : item.kind === 'page' && nav !== null && typeof nav === 'object'
            ? copy.promoted(item.title)
            : penWords.kept(item.title),
      );
      forget();
      await invalidateAll();
    } catch {
      toasts.push(copy.recordNotReached, { intent: 'warn' });
    } finally {
      keeping = null;
      closed(true, at);
    }
  }

  async function putBack(row: KeptRow) {
    if (row.busy) return;
    kept = kept.map((k) => (k === row ? { ...k, busy: true } : k));
    const out = await row.putBack().catch((): Undone => ({ from: 'refused', fix: copy.recordNotReached }));
    if (out.from === 'refused') {
      kept = kept.map((k) => (k.item.id === row.item.id ? { ...k, busy: false } : k));
      toasts.push(out.fix, { intent: 'warn' });
      return;
    }
    kept = kept.filter((k) => k.item.id !== row.item.id);
    toasts.push(penWords.putBackDone(row.item.title));
    forget();
    await invalidateAll();
  }

  /** "Not this one": terminal, on every device, and never undone from a toast, because terminal is the promise. */
  function dismissOffer(o: Offer) {
    const title = titleOf(o);
    if (showing !== null && idOf(o) === showing.item.id) sheetOpen = false;
    void navPrefs.dismiss(idOf(o)).then((saved) => said(saved, penWords.dismissed(title)));
  }

  /**
   * "Show it": what keeping would draw, rehearsed by the record and thrown away (`previewChange`), drawn through the one
   * page reader in its preview mode, with the page as it stands beside it when the offer changes one.
   */
  let showing = $state<{ item: PenItem; drawn: Rehearsed | null } | null>(null);
  let sheetOpen = $state(false);
  async function show(item: PenItem) {
    showing = { item, drawn: null };
    sheetOpen = true;
    try {
      const { previewOf } = await import('../../../decide/[id]/proposed.ts');
      const drawn = await previewOf({ to: item.change.to } as Parameters<typeof previewOf>[0], apiBase());
      if (showing?.item.id === item.id) showing = { item, drawn };
    } catch {
      if (showing?.item.id === item.id) showing = { item, drawn: { from: 'refused', fix: copy.recordNotReached } };
    }
  }
</script>

<!-- THE PAGES IN THE NAV, their order and Hide, with what the app opens on in that tile's heading row (G9), then every page not in it with the way back (Pages folded in here). -->
<Pages {shell} {area} part="nav" />
<Pages {shell} {area} part="others" />

<!--
  THE SWITCH THIS AREA WAS ADDED TO HOLD (`19 §2`, `29 §4`: "one global switch, the same shape as Character keys: off").

  WHAT IT TURNS OFF IS THE PROPOSING, NOT THE PAGES. Movement is forward-only and needs a user action, so off empties the
  holding pen and stops it refilling; nothing already placed moves, and nothing is lost.
-->
{#snippet suggestSwitch()}
  <button
    type="button"
    class="switch"
    role="switch"
    aria-checked={navPrefs.suggest}
    aria-label={copy.suggestPages}
    onclick={() => void flipSuggest()}><span class="switch-track"></span></button
  >
{/snippet}

{#snippet forgetUse()}
  <Button size="sm" onclick={() => void forgetWidgets()}>Forget</Button>
{/snippet}


<!--
  THE HOLDING PEN. Every offer, whatever its kind, is one row: what it is, one sentence of why, and three presses, "Show
  it", "Keep it" and "Not this one". Nothing in it is ever applied without the second (`19 §3`).
-->
<!-- NO COUNT OVER NOTHING: "Suggestions 0" sat over "Nothing waiting". The number is the
     sidebar's own (`penCount`), so where one is drawn the two agree. -->
<Tile id="suggestions" icon="inbox" title={words.offers} count={waitingCount || undefined}>
  <StateRow icon="learning" title={copy.suggestPages} line={copy.suggestPagesHint} action={suggestSwitch} />
  <!-- FORGET WHAT IT LEARNED (widgets plan §6.4, Call 12): the widgets Slash suggests from use start again from today. -->
  {#if navPrefs.suggest}<StateRow icon="refresh" title="Forget what BrainDog learned from my use" line="Widget suggestions start again from today. Nothing you added changes." action={forgetUse} />{/if}
  {#if !navPrefs.suggest}
    <!-- NOT `no-data-yet`, WHICH WOULD BE A LIE ABOUT THE RECORD. `19 §6` separates the empty states precisely so that
         "nothing has happened yet" and "you turned this off" cannot read the same. -->
    <Empty kind="cleared" title={copy.suggestOff} body={copy.suggestOffWhy} />
  {:else}
    <!-- ONE LINE, NOT THREE: the pen's long paragraph said what the three buttons already say. -->
    {#if offers.length > 0 && !penOpen}
      <button type="button" class="pen-fold" aria-expanded="false" onclick={() => (penOpen = true)}>
        <IconWell name="inbox" size="l" />
        <span class="pen-fold-words"><span class="pen-fold-title">{words.waiting(offers.length)}</span><span class="pen-fold-line">{words.waitingWhy}</span></span>
        <span class="pen-fold-go" aria-hidden="true">{words.show}<Icon name="chevron" size="s" /></span>
      </button>
    {:else if offers.length > 0}<p class="hint">Nothing changes until you keep one.</p>{/if}
    {#if kept.length > 0}
      <ul class="ledger ledger-lead pen">
        {#each kept as row (row.item.id)}
          <li class="pen-row" in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name="check" size="l" tone="earn" /></span>
              <span class="line-main">
                <span class="line-title">{row.item.title}</span>
                <span class="line-detail">{penWords.kept(row.item.title)}</span>
              </span>
              <span class="line-amount"></span>
              <span class="line-when pen-acts">
                <Button weight="quiet" disabled={row.busy} onclick={() => void putBack(row)}>{penWords.putBack}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
    {#if offers.length === 0}
      <Empty kind="cleared" title={voiceSaid('pen_nothing')} body={voiceSaid('pen_waits')} />
    {:else if penOpen}
      <ul class="ledger ledger-lead pen">
        {#each offers as o (idOf(o))}
          <li class="pen-row" data-pen={idOf(o)} in:lineIn out:dismiss animate:flip={settle()}>
            <div class="line line-tall">
              <span class="line-mark"><IconWell name={glyphOf(o)} size="l" /></span>
              <span class="line-main">
                <span class="line-title">{titleOf(o)}</span>
                <span class="line-detail">{whyOf(o)}</span>
                {#if lapseOf(o) !== null}<span class="line-detail pen-lapse">{lapseOf(o)}</span>{/if}
              </span>
              <span class="line-amount"></span>
              <span class="line-when pen-acts">
                <Button weight="quiet" onclick={() => void show(o.item)}>{penWords.show}</Button>
                <Button weight="quiet" disabled={keeping !== null} onclick={() => void keep(o)}>
                  {keeping === o.item.id ? penWords.keeping : penWords.keep}
                </Button>
                <Button weight="bare" onclick={() => dismissOffer(o)}>{penWords.dismiss}</Button>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</Tile>

<!-- WHERE EVERY CHOICE ABOVE IS KEPT, SAID ONCE FOR THE AREA. It was under three sections, and the page's own footer
     said the opposite under a fourth. -->
<p class="kept">{navPrefs.kept ? copy.perPerson : copy.perDevice}</p>

{#if showing}
  {@const s = showing}
  {@const icon = iconOf(s.item)}
  <Sheet bind:open={sheetOpen} title={penWords.sheetTitle(s.item.title)}>
    <div class="pen-sheet">
      <p class="hint">{s.item.why}</p>
      {#if icon !== null}
        <p class="pen-glyph"><Icon name={icon} size="xl" /><span>{penWords.iconShown(s.item.title)}</span></p>
      {/if}
      {#if s.drawn === null}
        <p class="hint" role="status">{penWords.drawing}</p>
      {:else if s.drawn.from === 'refused'}
        <p class="hint">{s.drawn.fix}</p>
      {:else if s.drawn.from === 'live' && s.drawn.pages.length > 0}
        {#each s.drawn.pages as t (t.id)}
          <PageView slug={t.slug} got={t.got} mode="preview" was={t.was} />
        {/each}
      {:else if icon === null}
        <p class="hint">{penWords.noPage}</p>
      {/if}
    </div>
    {#snippet footer()}
      <div class="pen-acts">
        <Button
          weight="primary"
          disabled={keeping !== null}
          onclick={() => {
            sheetOpen = false;
            void keep({ from: 'change', item: s.item });
          }}>{penWords.keep}</Button
        >
        <Button weight="bare" onclick={() => dismissOffer({ from: 'change', item: s.item })}>{penWords.dismiss}</Button>
      </div>
    {/snippet}
  </Sheet>
{/if}

<style>
  /* THE FRAME OF A CHOICE SHOWN AS PICTURES (`.pictures`) IS `settings.css`'s, which every area shares; the drawing
     inside it is this file's. */
  /* THE PEN'S ONE ROW WHILE IT IS SHUT: its count, what it holds, and Show. */
  .pen-fold {
    display: grid;
    grid-template-columns: var(--well-l) minmax(0, 1fr) auto;
    align-items: center;
    column-gap: var(--sp-3);
    inline-size: calc(100% + 2 * var(--sp-2));
    min-block-size: var(--row-h-2);
    margin-inline: calc(-1 * var(--sp-2));
    padding: var(--sp-2);
    background: none;
    border: 0;
    border-block-start: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .pen-fold:hover {
      background: var(--hover);
    }
  }

  .pen-fold:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .pen-fold-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .pen-fold-title {
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 500;
    line-height: var(--lead-ui);
  }

  .pen-fold-line {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .pen-fold-go {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .hint {
    margin: 0 0 var(--sp-3);
    max-inline-size: 75ch;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  /* WHERE THE AREA'S CHOICES ARE KEPT, once, as the line under every area that keeps its own is drawn. */
  .kept {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .pen-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
  }

  .pen-glyph {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: 0 0 var(--sp-4);
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  /* AT 390 THE PEN IS A LIST OF FULL-WIDTH ROWS, the three presses on their own line under the why, each 44 tall so a
     thumb lands on the one it meant; and "Show it" is a whole screen, because a page drawn in a sheet two thirds tall
     is a page nobody can judge. */
  @media (width < 640px) {
    .pen-row .pen-acts {
      grid-column: 2 / -1;
      grid-row: 3;
      justify-content: flex-start;
      inline-size: 100%;
      padding-block-start: var(--sp-2);
    }

    .pen-acts :global(button) {
      min-block-size: 44px;
    }

    :global(dialog.sheet:has(.pen-sheet)) {
      block-size: calc(100dvh - var(--kb));
      max-block-size: 100dvh;
    }
  }
</style>
