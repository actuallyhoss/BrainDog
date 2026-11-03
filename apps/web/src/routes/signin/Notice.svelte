<!--
  @component
  A line that says what just happened, inside an entry sheet (sign in, sign up, the check that you are a person).

  ONE SHAPE FOR EVERY STATUS ON THESE SCREENS (UI pass, 3 Nov). They were grey sentences dropped between the title and
  the form, an icon well with a heading of its own above the field, or a red line squeezed beside a button: four looks
  for one job. Now each is this: the column's full width, radius 12, a tint by what it means, an 18px glyph on the first
  line, an optional bold first line and the words in 14/20. `bad` is `--red-tint` (it did not work), `warn` is
  `--warn-tint` (paused or down), `good` is `--good-tint` (it worked), `note` is the soft fill (it tells and asks nothing).
  An action, when one helps (Try again), sits at the end of the line, never as a second line that says the same.

  `role` is `alert` for a failure the person just caused and `status` otherwise. The title takes focus by script when a
  press changed the screen (`land` in `+page.svelte` looks for `.notice-title`).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';

  let {
    tone = 'note',
    icon,
    title,
    role = 'status',
    children,
    action,
  }: {
    tone?: 'bad' | 'warn' | 'good' | 'note';
    icon?: IconName | undefined;
    title?: string | undefined;
    role?: 'status' | 'alert';
    children?: Snippet | undefined;
    action?: Snippet | undefined;
  } = $props();

  const glyph = $derived(icon ?? (tone === 'good' ? 'check' : tone === 'note' ? 'info' : 'alert'));
</script>

<div class="notice" data-tone={tone} {role}>
  <span class="notice-glyph" aria-hidden="true"><Icon name={glyph} size="m" /></span>
  <div class="notice-words">
    {#if title}<p class="notice-title">{title}</p>{/if}
    {#if children}<p class="notice-body" data-alone={title ? undefined : ''}>{@render children()}</p>{/if}
  </div>
  {#if action}<span class="notice-action">{@render action()}</span>{/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    min-inline-size: 0;
    padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-3);
    border-radius: var(--r-field);
    background: var(--soft-fill);
    color: var(--ink);
  }

  .notice[data-tone='bad'] {
    --notice-glyph: var(--red);
    background: var(--red-tint);
  }

  .notice[data-tone='warn'] {
    --notice-glyph: var(--warn);
    background: var(--warn-tint);
  }

  .notice[data-tone='good'] {
    --notice-glyph: var(--good);
    background: var(--good-tint);
  }

  /* THE GLYPH SITS ON THE FIRST LINE'S MIDDLE: a box one line tall, the 16px glyph centred in it. */
  .notice-glyph {
    display: flex;
    flex: none;
    align-items: center;
    block-size: var(--lead-ui);
    color: var(--notice-glyph, var(--ink-2));
  }

  .notice-words {
    display: grid;
    flex: 1;
    gap: 2px;
    min-inline-size: 0;
  }

  .notice-title,
  .notice-body {
    margin: 0;
    font-size: var(--fs-body);
    line-height: var(--lead-ui);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  .notice-title {
    color: var(--ink);
    font-weight: 600;
  }

  .notice-body {
    color: var(--ink-2);
  }

  .notice-body[data-alone] {
    color: var(--ink);
  }

  .notice-title:focus:not(:focus-visible) {
    /* focus-ok: the title takes focus only by script, as a step changes, so a reader hears it; a ring would read as a control. */
    outline: none;
  }

  /* THE ACTION AT THE LINE'S END, one line tall where it can be: a small capsule on the tint, in the tile's own colour. */
  .notice-action {
    display: flex;
    flex: none;
    align-items: center;
    align-self: center;
  }

  .notice .notice-action :global(.btn) {
    --btn-fill: var(--tile);
    inline-size: auto;
    min-block-size: var(--btn-h-sm);
  }

  @media (forced-colors: active) {
    .notice {
      outline: 1px solid CanvasText;
    }
  }
</style>
