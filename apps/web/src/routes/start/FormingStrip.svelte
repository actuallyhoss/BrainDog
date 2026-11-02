<!--
  YOUR BRAINDOG, FORMING, ON A PHONE (skills pass 3, 2 Nov). Under 900px the build tile stands under the whole
  conversation, so while she answers the BrainDog formed out of sight and only BrainDog's line ("That adds People and
  Money") said so. This is the build held at the top of the conversation: one compact line that stays in view as the
  talk grows, each part a small icon and its name, in the order they were heard, as the tile has them.

  IT LIGHTS UP AS THE ANSWERS ADD TO IT, with the desk tile's motion: before a word the usual places are greyed; a greyed
  place an answer turns on keeps its chip and comes up to full ink where it stands (`--form-in` on `--ease-out`); a new
  part rises in on the spring (`arrive`, 320ms, 35ms apart, three at most) with the arrival wash held 1.5s, and the rest
  make room (`animate:flip`, `--form-settle`). The newest is brought into view when the line is longer than the screen.
  Under reduced motion each is a short fade and the line jumps to the newest.

  A PRESS OPENS THE WHOLE BUILD AS A SHEET (the page's `onopen`), where a part can be taken out or put back. The line is
  one button: its name says what the BrainDog is called, what it holds so far, and that it opens.

  NOT A LIVE REGION: the conversation says what each answer added, once. Never drawn from 900px up, where the tile
  stands beside the talk.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { arrive, depart, springy, still } from '$lib/motion';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import type { TransitionConfig } from 'svelte/transition';
  import type { Part as PartOf } from './building.ts';

  let {
    parts,
    ghost = false,
    title = null,
    open = false,
    onopen,
  }: {
    /** The parts that will be made, in the order they were heard (`stepsOf`), as the build tile has them. */
    parts: readonly PartOf[];
    /** Nothing said yet: the usual places, greyed. */
    ghost?: boolean;
    /** What the record will be called, where a name was heard. */
    title?: string | null;
    /** Whether the sheet it opens is open. */
    open?: boolean;
    onopen: () => void;
  } = $props();

  const words = {
    title: 'Your BrainDog',
    show: 'Show it',
  };

  /* THE SAME GREYED PLACES AS THE TILE (`Forming.svelte`), keyed by the part's id, so the one an answer turns on is the
     same chip. */
  const GHOSTS: readonly { id: string; name: string; icon: IconName }[] = [
    { id: 'money-core', name: 'Money', icon: 'money' },
    { id: 'people', name: 'People', icon: 'people' },
    { id: 'portfolio', name: 'Projects', icon: 'projects' },
  ];

  type Chip = { key: string; name: string; icon: IconName; ghost: boolean };
  const chips = $derived<Chip[]>(ghost ? GHOSTS.map((g) => ({ key: g.id, name: g.name, icon: g.icon, ghost: true })) : parts.map((p) => ({ key: p.id, name: p.name, icon: p.icon, ghost: false })));

  /* WHAT JUST ARRIVED, in the order it came, for the stagger and the wash; the first drawing is not an arrival. */
  let fresh = $state.raw<string[]>([]);
  let seen: Set<string> | null = null;
  let fading: ReturnType<typeof setTimeout> | undefined;
  let line = $state<HTMLSpanElement | undefined>(undefined);
  $effect(() => {
    const now = parts.map((p) => p.id);
    const was = seen;
    seen = new Set(now);
    if (was === null) return;
    const came = now.filter((id) => !was.has(id));
    if (came.length === 0) return;
    fresh = came;
    clearTimeout(fading);
    fading = setTimeout(() => (fresh = []), 1500);
    /* THE NEWEST IN VIEW: a line longer than the screen is carried to the first part that came. */
    void tick().then(() => {
      const el = line?.querySelector<HTMLElement>(`[data-key="${CSS.escape(came[0] ?? '')}"]`);
      if (!line || !el) return;
      /* BY ITS BOX, so a right-to-left line is carried the other way: past the fade at the line's end, never further. */
      const a = el.getBoundingClientRect();
      const box = line.getBoundingClientRect();
      const rtl = getComputedStyle(line).direction === 'rtl';
      const by = rtl ? Math.min(0, a.left - box.left - FADE) : Math.max(0, a.right - box.right + FADE);
      if (by !== 0) line.scrollBy({ left: by, behavior: still() ? 'auto' : 'smooth' });
      edges();
    });
  });
  $effect(() => () => clearTimeout(fading));

  /** The fade at an end with more past it (`.chips` mask), which a chip carried into view clears. */
  const FADE = 24;

  /** 35ms apart, three at most, as the tile's rows. */
  const delayOf = (key: string): number => Math.min(Math.max(0, fresh.indexOf(key)), 3) * 35;

  /** A chip leaving, by its opacity alone (the tile's `leave`): `animate:flip` holds it where it stood. */
  const leave = (node: Element): TransitionConfig => ({ ...depart(node), css: (t: number) => `opacity:${t}` });

  /* WHICH END OF THE LINE HAS MORE PAST IT, so only that end fades. */
  let more = $state<{ start: boolean; end: boolean }>({ start: false, end: false });
  function edges(): void {
    if (!line) return;
    const at = Math.abs(line.scrollLeft);
    more = { start: at > 1, end: at + line.clientWidth < line.scrollWidth - 1 };
  }
  $effect(() => {
    void chips.length;
    if (!line) return;
    const ro = new ResizeObserver(edges);
    ro.observe(line);
    return () => ro.disconnect();
  });
</script>

<div class="strip-wrap">
  <!-- ITS NAME IS WHAT IT SHOWS, in the order it shows it (the parts' names are its visible words), after what the
       BrainDog is called and before what a press does: "Your BrainDog: People, Money. Show it". -->
  <button type="button" class="strip" aria-haspopup="dialog" aria-expanded={open} onclick={onopen}>
    <span class="home" aria-hidden="true"><Icon name="home" size="s" /></span>
    <span class="sr">{title ?? words.title}:</span>
    <span class="chips" bind:this={line} data-more-start={more.start ? '' : undefined} data-more-end={more.end ? '' : undefined} onscroll={edges}>
      {#each chips as c, i (c.key)}
        <span
          class="chip"
          data-key={c.key}
          data-ghost={c.ghost ? '' : undefined}
          data-arrived={!c.ghost && fresh.includes(c.key) ? '' : undefined}
          in:arrive={{ delay: delayOf(c.key), rise: 8 }}
          out:leave
          animate:flip={springy()}
        >
          <Icon name={c.icon} size="s" />{c.name}<span class="sr">{i < chips.length - 1 ? ',' : '.'}</span>
        </span>
      {/each}
    </span>
    <span class="sr">{words.show}</span>
    <span class="go" aria-hidden="true"><Icon name="chevron" size="s" /></span>
  </button>
</div>

<style>
  /* HELD AT THE TOP OF THE CONVERSATION TILE, edge to edge across it: the tile's own fill, its top corners, and one
     hairline under it so the talk passes beneath. */
  .strip-wrap {
    position: sticky;
    inset-block-start: 0;
    z-index: var(--z-raise);
    margin-block-start: calc(-1 * var(--tile-pad-lead));
    margin-inline: calc(-1 * var(--tile-pad-lead));
    padding: var(--sp-2) calc(var(--tile-pad-lead) - var(--sp-2));
    background: var(--tile);
    border-start-start-radius: var(--r-tile);
    border-start-end-radius: var(--r-tile);
    box-shadow: inset 0 -1px 0 var(--rule);
  }

  @media (width >= 900px) {
    .strip-wrap {
      display: none;
    }
  }

  /* ONE BUTTON, 44 TALL, the home mark, the parts, and the chevron that says it opens. */
  .strip {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
    inline-size: 100%;
    min-block-size: var(--tap, 44px);
    padding: 0 var(--sp-2);
    border: 0;
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color var(--d-press, 70ms) var(--ease-out);
  }

  .strip:active {
    background: var(--hover);
  }

  @media (hover: hover) {
    .strip:hover {
      background: var(--hover);
    }
  }

  .home,
  .go {
    display: inline-grid;
    place-items: center;
    color: var(--ink-2);
  }

  .home {
    inline-size: 28px;
    block-size: 28px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
  }

  .go {
    color: var(--ink-3);
  }

  /* THE PARTS ON ONE LINE, as many as fit; past that the line is carried to the newest, and the end with more past it
     fades. Room above and below for a chip rising in. */
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .chips {
    display: flex;
    gap: 6px;
    margin: -8px 0;
    padding: 8px 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .chips[data-more-end] {
    mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  }

  .chips[data-more-start] {
    mask-image: linear-gradient(to right, transparent, #000 24px);
  }

  .chips[data-more-start][data-more-end] {
    mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  }

  /* MIRRORED, right to left: the end is on the left. */
  .chips:dir(rtl)[data-more-end] {
    mask-image: linear-gradient(to left, #000 calc(100% - 24px), transparent);
  }

  .chips:dir(rtl)[data-more-start] {
    mask-image: linear-gradient(to left, transparent, #000 24px);
  }

  .chips:dir(rtl)[data-more-start][data-more-end] {
    mask-image: linear-gradient(to left, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  }

  .go:dir(rtl) {
    transform: scaleX(-1);
  }

  .chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    block-size: 28px;
    padding: 0 var(--sp-2) 0 6px;
    border-radius: var(--r-ctl);
    background: var(--tile-2);
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
    line-height: 1;
    transition:
      color var(--form-in) var(--ease-out),
      box-shadow 1500ms var(--ease-out);
  }

  .chip :global(.icon) {
    color: var(--ink-2);
    transition: opacity var(--form-in) var(--ease-out);
  }

  /* GREYED UNTIL HEARD, in the quiet ink (4.5:1 on the well), the icon faded back, as the tile's greyed rows. */
  .chip[data-ghost] {
    color: var(--ink-3);
  }

  .chip[data-ghost] :global(.icon) {
    opacity: 0.5;
  }

  /* JUST HEARD: lit by an edge in the strong rule, let go over 1.5s. The tile's wash (`--arrived`) is the chip's own
     well colour, so on a chip it showed nothing. */
  .chip[data-arrived] {
    box-shadow: inset 0 0 0 1px var(--ink-3);
    transition: color var(--form-in) var(--ease-out);
  }

  @media (forced-colors: active) {
    .chip {
      border: 1px solid CanvasText;
    }

    .strip-wrap {
      border-block-end: 1px solid CanvasText;
    }
  }
</style>
