<!--
  Whoever acted, as a face: a person as a monogram on their own hue, you in ink, an automation or a
  rule as the automations glyph, Slash as its mark, and BrainDog as the mark in ink.

  A FACE, NOT A NAME TAG in the identifier font, so a list of agents and people reads as somebody
  passing through rather than as a log file. One component, so a writer is drawn one way wherever
  they turn up.

  BY KIND, NOT BY NAME. `kind` is `actor(by).kind` from `lib/record/names.ts`,
  which knows what signed the write. A caller that hands a name alone still gets the right face for
  the words `names.ts` itself says (`faceKindOf`), and a monogram for any other name.

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
  import { faceKindOf, hueFor, initialOf, initialsOf, type RunLive } from './face.ts';
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
  /* THE MARK A LITTLE UNDER HALF THE DISC, in the height `Mark` takes, so its width (which follows the artwork) stays inside it. */
  const markHeight = $derived(size === 's' ? 8 : size === 'l' ? 14 : 10);
</script>

<!-- AN AUTOMATION AND A RULE ARE NOT PEOPLE, SO THEY DO NOT WEAR AN INITIAL: they take the glyph the
     rail gives Automations, which is where a person goes to find them. Slash wears its own mark, a
     slash, and BrainDog the product's mark in ink, never in the brand's red, which a face repeated
     down a log would spend. AN AGENT IS `AgentFace`: its maker's mark, or its kind's glyph in its run's hue, where the caller
     names the run, at the size a line of text takes and the list size for a page's own. -->
{#if drawn === 'agent'}
  <AgentFace agent={name} run={run ?? ''} {live} size={size === 'l' ? 'm' : 's'} />
{:else}<span class="face" data-kind={drawn} data-size={size} data-shape={square ? 'square' : 'circle'} style="--hue:{hue ?? hueFor(name)}" aria-hidden="true"
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
    background: var(--s1);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
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
    font-size: var(--t-sm);
  }

  /* A THING'S SQUARE: the corner a small well has at each size, so a project's face and an icon well beside it are
     one family of shape. */
  .face[data-shape='square'] {
    border-radius: var(--r-sm);
  }

  .face[data-shape='square'][data-size='l'] {
    border-radius: var(--r-well);
  }

  /* A PERSON, A PROJECT OR A RECORD ON ITS OWN HUE: the theme's mark lightness and chroma at that hue, washed into the
     tile, with the letters in ink. The letters are never drawn in the hue itself, so they read the same in both
     schemes whichever hue they sit on. */
  .face:is([data-kind='person'], [data-kind='project'], [data-kind='record']) {
    background: color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--hue)) 36%, var(--bg));
    color: var(--ink);
  }

  /* YOU ARE THE INK DISC, NOT THE ACCENT ONE. The brand colour is kept for the mark and "needs you", and a face
     repeated down a log is a badge, which is neither. */
  .face[data-kind='you'] {
    background: var(--ink);
    color: var(--on-ink);
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
