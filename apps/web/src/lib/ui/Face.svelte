<!--
  Whoever acted, as a face: a person as a monogram on their own hue, you in ink, an automation or a
  rule as the automations glyph, Slash as its mark, and BrainDog as the mark in ink.

  A FACE, NOT A NAME TAG in the identifier font, so a list of agents and people reads as somebody
  passing through rather than as a log file. One component, so a writer is drawn one way wherever
  they turn up.

  BY KIND, NOT BY NAME. `kind` is `actor(by).kind` from `lib/record/names.ts`,
  which knows what signed the write. A caller that hands a name alone still gets the right face for
  the words `names.ts` itself says (`faceKindOf`), and a monogram for any other name.

  A PERSON IS THEIR SLOT: their hue picks one of the eight category slots, the disc
  is its tint and the letter its colour.

  AN INITIAL, NOT A PHOTO. `20 §6` refuses avatar stacks on a business record, and a letter in a
  disc is a face without inventing one. It is `aria-hidden` because the name always sits beside it.

  THREE SIZES: `s` is 20px, for an entry that
  is one line and not two (a row, a row's history), where a larger disc would set the line's
  height; `m` is 24px, a feed's; `l` is 32px, a row's leading mark and a person's own page.

  TWO SHAPES. People and agents are circles; projects and records are rounded squares
  with their initials. `of="project"` or `of="record"` draws the square for a thing that is not an
  actor at all, and BrainDog, the record itself, wears the square too.
-->
<script lang="ts">
  import type { ActorKind } from '../record/names.ts';
  import { faceKindOf, hueFor, initialOf, initialsOf, slotOf, type RunLive } from './face.ts';
  import AgentFace from './AgentFace.svelte';
  import Icon from './Icon.svelte';
  import Mark from './Mark.svelte';

  let {
    name,
    you = false,
    size = 'm',
    kind,
    hue,
    run = null,
    live = 'stopped',
    of,
  }: {
    name: string;
    you?: boolean | undefined;
    size?: 's' | 'm' | 'l' | undefined;
    /** What acted, as `actor(by).kind` says it; absent, the name decides as far as it can. */
    kind?: ActorKind | undefined;
    /** A person's hue where the caller holds one; absent, one kept from their name, so it is the same on every screen. */
    hue?: number | null | undefined;
    /** The run an agent wrote as (`runOf(by)` in `face.ts`), which its face is coloured by and links to. */
    run?: string | null | undefined;
    /** Where that run is, which its ring says; a line in a log does not know, so it is drawn as stopped. */
    live?: RunLive | undefined;
    /** A project or a record, which is a thing and not an actor: its rounded square with its initials, in its hue. */
    of?: 'project' | 'record' | undefined;
  } = $props();

  const drawn = $derived<ActorKind | 'project' | 'record'>(of ?? (you ? 'you' : (kind ?? faceKindOf(name))));
  /* THE SQUARE FOR A THING, THE CIRCLE FOR WHOEVER ACTS. BrainDog is the record speaking, so it is a thing's shape. */
  const square = $derived(drawn === 'project' || drawn === 'record' || drawn === 'system' || drawn === 'sample');
  /* A PERSON'S, A PROJECT'S OR A RECORD'S SLOT: the category its hue snaps to, the same on every screen. */
  const slot = $derived(slotOf(hue ?? hueFor(name)));
  /* THE MARK A LITTLE UNDER HALF THE DISC, in the height `Mark` takes, so its width (which follows the artwork) stays inside it. */
  const markHeight = $derived(size === 's' ? 8 : size === 'l' ? 14 : 10);
</script>

<!-- AN AUTOMATION AND A RULE ARE NOT PEOPLE, SO THEY DO NOT WEAR AN INITIAL: they take the glyph the
     rail gives Automations, which is where a person goes to find them. Slash wears its own mark, a
     slash, and BrainDog the product's mark in ink, never in the brand's red, which a face repeated
     down a log would spend. AN AGENT IS `AgentFace`: its maker's mark, or its kind's glyph in its run's hue, where the caller
     names the run, at the size a line of text takes and the list size for a page's own. -->
{#if drawn === 'agent'}
  <AgentFace agent={name} run={run ?? ''} {live} size={size === 'l' ? 'm' : 'xs'} />
{:else}<span class="face" data-kind={drawn} data-size={size} data-shape={square ? 'square' : 'circle'} data-slot={slot} aria-hidden="true"
  >{#if drawn === 'automation' || drawn === 'rule'}<Icon name="refresh" size={size === 's' ? 's' : 'm'} />{:else if drawn === 'slash'}<svg
      class="face-slash"
      viewBox="0 0 24 24"><path d="M15.5 4.5 8.5 19.5" /></svg
    >{:else if drawn === 'system' || drawn === 'sample'}<Mark height={markHeight} tone="inherit" />{:else if drawn === 'project' || drawn === 'record'}{initialsOf(name)}{:else}{initialOf(name)}{/if}</span
  >{/if}

<style>
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--tile-2);
    border-radius: var(--r-round);
    /* A 1px RING OF THE INK AT 8% (ops 4.25), so a face reads as a disc on white and on the ground. */
    box-shadow: inset 0 0 0 1px var(--sep);
    color: var(--ink-2);
    font-size: var(--fs-cap);
    font-weight: var(--fw-semi);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .face[data-size='s'] {
    inline-size: 20px;
    block-size: 20px;
  }

  .face[data-size='l'] {
    inline-size: 32px;
    block-size: 32px;
    font-size: var(--fs-meta);
  }

  /* A THING'S SQUARE: the corner a small well has at each size, so a project's face and an icon well beside it are
     one family of shape. */
  .face[data-shape='square'] {
    border-radius: var(--r-xs);
  }

  .face[data-shape='square'][data-size='l'] {
    border-radius: var(--r-ctl);
  }

  /* A PERSON, A PROJECT OR A RECORD IN ITS SLOT: the slot's tint for the disc and its
     colour for the letter, a pair solved to 4.5:1 in light and in dark. */
  .face:is([data-kind='person'], [data-kind='project'], [data-kind='record']) {
    background: var(--ph-tint);
    color: var(--ph);
  }

  .face[data-slot='blue'] {
    --ph: var(--cat-blue, var(--ink));
    --ph-tint: var(--cat-blue-tint, var(--tile-2));
  }

  .face[data-slot='violet'] {
    --ph: var(--cat-violet, var(--ink));
    --ph-tint: var(--cat-violet-tint, var(--tile-2));
  }

  .face[data-slot='pink'] {
    --ph: var(--cat-pink, var(--ink));
    --ph-tint: var(--cat-pink-tint, var(--tile-2));
  }

  .face[data-slot='teal'] {
    --ph: var(--cat-teal, var(--ink));
    --ph-tint: var(--cat-teal-tint, var(--tile-2));
  }

  .face[data-slot='sky'] {
    --ph: var(--cat-sky, var(--ink));
    --ph-tint: var(--cat-sky-tint, var(--tile-2));
  }

  .face[data-slot='yellow'] {
    --ph: var(--cat-yellow, var(--ink));
    --ph-tint: var(--cat-yellow-tint, var(--tile-2));
  }

  .face[data-slot='lime'] {
    --ph: var(--cat-lime, var(--ink));
    --ph-tint: var(--cat-lime-tint, var(--tile-2));
  }

  .face[data-slot='slate'] {
    --ph: var(--cat-slate, var(--ink));
    --ph-tint: var(--cat-slate-tint, var(--tile-2));
  }

  /* YOU ARE THE INK DISC, NOT THE RED ONE. The red is kept for the mark and "needs you", and a face repeated down a log
     is a badge, which is neither. */
  .face[data-kind='you'] {
    background: var(--ink);
    color: var(--tile);
  }

  /* SLASH AND BRAINDOG IN INK on the neutral fill, so neither is mistaken for you. */
  .face[data-kind='slash'],
  .face[data-kind='system'],
  .face[data-kind='sample'] {
    color: var(--ink);
  }

  .face-slash {
    inline-size: 60%;
    block-size: 60%;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  @media (forced-colors: active) {
    .face {
      border: 1px solid CanvasText;
    }
  }
</style>
