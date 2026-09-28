<!--
  Whoever acted, as a face: a person as a monogram on their own hue, you in ink, an automation or a
  rule as the automations glyph, Slash as its mark, and BrainDog as the mark in ink.

  A FACE, NOT A NAME TAG in the identifier font, so a list of agents and people reads as somebody
  passing through rather than as a log file. One component, so a writer is drawn one way wherever
  they turn up.

  BY KIND, NOT BY NAME (design.md SYS-7). `kind` is `actor(by).kind` from `lib/record/names.ts`,
  which knows what signed the write. A caller that hands a name alone still gets the right face for
  the words `names.ts` itself says (`faceKindOf`), and a monogram for any other name.

  AN INITIAL, NOT A PHOTO. `20 §6` refuses avatar stacks on a business record, and a letter in a
  disc is a face without inventing one. It is `aria-hidden` because the name always sits beside it.

  THREE SIZES, THE DESIGN BRIEF'S THREE (design-brief.md, `Face`): `s` is 20px, for an entry that
  is one line and not two (a row, a row's history), where a larger disc would set the line's
  height; `m` is 24px, a feed's; `l` is 32px, a person's own page. design.md SYS-7 gives 28 and 48
  for the last two, and the brief is the one every screen is drawn to.
-->
<script lang="ts">
  import type { ActorKind } from '../record/names.ts';
  import { faceKindOf, hueFor, initialOf, type RunLive } from './face.ts';
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
  } = $props();

  const drawn = $derived<ActorKind>(you ? 'you' : (kind ?? faceKindOf(name)));
  /* THE MARK A LITTLE UNDER HALF THE DISC, in the height `Mark` takes, so its width (which follows the artwork) stays inside it. */
  const markHeight = $derived(size === 's' ? 8 : size === 'l' ? 14 : 10);
</script>

<!-- AN AUTOMATION AND A RULE ARE NOT PEOPLE, SO THEY DO NOT WEAR AN INITIAL: they take the glyph the
     rail gives Automations, which is where a person goes to find them. Slash wears its own mark, a
     slash, and BrainDog the product's mark in ink, never in the brand's red, which a face repeated
     down a log would spend. AN AGENT IS `AgentFace` (AGT-13): its kind's glyph, in its run's hue where the caller
     names the run, at the size a line of text takes and the list size for a page's own. -->
{#if drawn === 'agent'}
  <AgentFace agent={name} run={run ?? ''} {live} size={size === 'l' ? 'm' : 's'} />
{:else}<span class="face" data-kind={drawn} data-size={size} style="--hue:{hue ?? hueFor(name)}" aria-hidden="true"
  >{#if drawn === 'automation' || drawn === 'rule'}<Icon name="refresh" size={size === 's' ? 's' : 'm'} />{:else if drawn === 'slash'}<svg
      class="face-slash"
      viewBox="0 0 24 24"><path d="M15.5 4.5 8.5 19.5" /></svg
    >{:else if drawn === 'system' || drawn === 'sample'}<Mark height={markHeight} tone="inherit" />{:else}{initialOf(name)}{/if}</span
  >{/if}

<style>
  .face {
    display: grid;
    flex: none;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    background: var(--hold-wash);
    border-radius: var(--r-pill);
    color: var(--ink2);
    font-size: var(--t-xs);
    font-weight: 600;
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

  /* A PERSON ON THEIR OWN HUE, as a project wears its mark: the theme's mark lightness and chroma at
     the person's hue, washed into the ground, with the letter in ink. The letter is never drawn in
     the hue itself, so it reads the same in both schemes whichever hue it sits on. */
  .face[data-kind='person'] {
    background: color-mix(in srgb, oklch(var(--mark-l) var(--mark-c) var(--hue)) 36%, var(--bg));
    color: var(--ink);
  }

  /* YOU ARE THE INK DISC, NOT THE ACCENT ONE. The brand colour is kept for a short list of places
     (DESIGN-SYSTEM 1.3), and a face repeated down a log is a badge, which is not one of them. */
  .face[data-kind='you'] {
    background: var(--ink2);
    color: var(--bg);
  }

  /* SLASH AND BRAINDOG IN INK on the neutral disc, so neither is mistaken for you. */
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
</style>
