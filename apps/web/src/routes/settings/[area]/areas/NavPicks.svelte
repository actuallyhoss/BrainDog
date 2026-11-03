<!--
  Three of the five settings, drawn under Theme and Density in Appearance: Navigation (the top bar or one menu button),
  the phone bar (the pages after Today), and Words (a row to the area that names lists and the currency).

  FIVE SETTINGS, AND EVERYTHING ELSE SAID ON THE PAGE. Theme, density, navigation, the phone bar and words are what a
  person sets here; the rest is said where it shows, with a preview and an undo. The side rail is no longer a shape:
  a rail an older build kept reads as no choice, and the top bar is drawn (`nav-prefs.svelte.ts`).

  EACH IS THE PERSON'S OWN ON A RECORD (`nav.shape`, `nav.tabs`), kept by `navPrefs`, so a choice on the laptop holds on
  the phone; the shell redraws from the same field the moment it is set.
-->
<script lang="ts">
  import { copy } from '$lib/copy.ts';
  import { arrange, flatNav, listCounts, tabsOf, workOf } from '$lib/nav.ts';
  import { railOf } from '$lib/nav/rail.ts';
  import { said as voiced } from '$lib/voice.svelte.ts';
  import { navPrefs, type NavShape, type Saved } from '$lib/nav-prefs.svelte.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { Shell } from '$lib/record/boot-live.ts';

  let { shell }: { shell: Shell } = $props();

  const words = {
    nav: 'Navigation',
    navLine: 'On a laptop',
    bar: 'Top bar',
    menu: 'One button',
    phone: 'Phone bar',
    phoneLine: (most: number) => `Today, then up to ${most} more`,
    usual: 'Back to the usual',
    full: (most: number) => `Only ${most} besides Today. Take one off first.`,
  };

  /* TODAY, THEN THREE: the shell draws `tabsOf(places, 4, tabs)`, Today and three more, then Menu. */
  const MOST = 3;

  const said = (saved: Saved) => {
    if (saved.from === 'refused') toasts.push(saved.fix, { intent: 'warn' });
  };

  function pickShape(next: NavShape) {
    if (navPrefs.shape === next) return;
    const before = navPrefs.chosen;
    void navPrefs.setShape(next).then((saved) => {
      if (saved.from === 'refused') return said(saved);
      toasts.push(next === 'bar' ? 'The top bar is back.' : 'Your pages are behind one button now.', {
        undo: () => void navPrefs.setShape(before).then(said),
      });
    });
  }

  /* THE PLACES THE PHONE BAR CAN HOLD, read the way the shell reads them (`+layout.svelte`): the nav less what is hidden,
     in the person's order, under their names, each section once. */
  const places = $derived.by(() => {
    const views = new Set(shell.index.registers.flatMap((r) => (r.views ?? []).map((v) => v.href)));
    const nav = navPrefs.relabel(shell.nav.filter((n) => !n.cut && !views.has(n.href) && !navPrefs.isHidden(n.href)));
    const flat = flatNav(arrange(nav, navPrefs.order), 1, { today: copy.today, activity: copy.audit, decide: voiced('decide') }, { work: workOf(shell.index.registers), counts: listCounts(shell.index.registers) });
    return railOf(flat, voiced('decide')).places;
  });
  /* WHAT THE PHONE BAR DRAWS NOW, Today first and left out of the picks: it is always there. */
  const drawn = $derived(tabsOf(places, MOST + 1, navPrefs.tabs).slice(1));
  const pickable = $derived(places.slice(1));
  const onBar = (href: string): boolean => drawn.some((t) => t.href === href);

  function flip(href: string) {
    const now = drawn.map((t) => t.href);
    const next = now.includes(href) ? now.filter((h) => h !== href) : [...now, href];
    if (next.length > MOST) return void toasts.push(words.full(MOST), { intent: 'warn' });
    void navPrefs.setTabs(next).then(said);
  }
</script>

<div class="choice">
  <span class="choice-name" id="choice-nav">{words.nav}</span>
  <span class="choice-line">{words.navLine}</span>
  <Segmented full role="group" aria-labelledby="choice-nav">
    {#each [['bar', words.bar, 'rows'], ['menu', words.menu, 'more']] as const as [v, label, icon] (v)}
      <button type="button" class="segment" aria-pressed={navPrefs.shape === v} data-on={navPrefs.shape === v ? '' : undefined} onclick={() => pickShape(v)}
        ><Icon name={icon} size="s" />{label}</button
      >
    {/each}
  </Segmented>
</div>

{#if pickable.length > 0}
  <div class="choice">
    <span class="choice-name" id="choice-phone">{words.phone}</span>
    <span class="choice-line">{words.phoneLine(MOST)}</span>
    <div class="picks" role="group" aria-labelledby="choice-phone">
      {#each pickable as p (p.href)}
        {@const on = onBar(p.href)}
        <button type="button" class="pick" aria-pressed={on} data-on={on ? '' : undefined} onclick={() => flip(p.href)}
          >{#if on}<Icon name="check" size="s" />{/if}{p.label}</button
        >
      {/each}
    </div>
    {#if navPrefs.tabs.length > 0}
      <button type="button" class="usual" onclick={() => void navPrefs.setTabs([]).then(said)}>{words.usual}</button>
    {/if}
  </div>
{/if}

<!-- NO "WORDS" ROW HERE (G8): it opened Time and money, which the Settings index already lists. -->

<style>
  /* THE TRACK HUGS ITS TWO OPTIONS, as the scheme and density beside it do; on a phone `full` takes the row. */
  .choice {
    display: grid;
    justify-items: start;
    gap: var(--sp-2);
  }

  @media (width < 640px) {
    .choice {
      justify-items: stretch;
    }
  }

  /* THE SAME LABEL AS APPEARANCE'S OWN CHOICES above it: 14/20 at 500, its line 4 under it. */
  .choice-name {
    font-weight: 500;
    color: var(--ink);
    line-height: var(--lead-ui);
  }

  .choice-line {
    margin-block-start: calc(var(--sp-1) - var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lead-meta);
  }

  .segment {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
  }

  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  /* A PAGE ON THE BAR CARRIES A TICK AS WELL AS ITS FILL, so the state is never colour alone. */
  /* A CAPSULE EACH (ops 4.8): the soft fill at rest, the chosen tint with the ink at 600 and a tick when it is on the
     bar. An ink slab per chosen page was the heaviest thing on the screen. */
  .pick {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    min-block-size: var(--ctl-panel, 28px);
    padding-inline: var(--ctl-pad-sm);
    background: var(--soft-fill, var(--tile-2));
    border: 0;
    border-radius: var(--r-pill, 999px);
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-ctl);
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out),
      scale var(--d-press-out, 190ms) var(--spring-press, ease-out);
  }

  .pick:active {
    scale: 0.97;
  }

  .pick[data-on] {
    background: var(--chosen-2);
    color: var(--ink);
    font-weight: 600;
  }

  @media (hover: hover) and (pointer: fine) {
    .pick:not([data-on]):hover {
      background: var(--soft-fill-hover, var(--hover));
      color: var(--ink);
    }
  }

  @media (pointer: coarse) {
    .pick {
      min-block-size: var(--tap);
    }
  }

  .usual {
    justify-self: start;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink-3);
    font: inherit;
    font-size: var(--fs-meta);
    text-decoration: underline;
    cursor: pointer;
  }

</style>
