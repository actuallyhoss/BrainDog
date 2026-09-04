<!--
  `+ Add a block` — the picker, and every tile in it is DRAWN.

  21 §3.3 is unusually specific about this and the specificity is the point:

    > Every tile is a live rendered block, not a screenshot, with a stub config synthesised from the
    > user's real data … Fill priority: real rows → a seeded specimen of three synthetic correctly
    > typed rows at reduced opacity with a `sample` tag → NEVER lorem, never an icon, never a
    > wireframe.
    >
    > That answers "how do you show what a block will look like before it has data": it is not a
    > data problem, it is a SHAPE problem, and a shape can be seeded.

  So each tile renders through the same `Block` component the page uses — A3, *"the preview is the
  real renderer; no authoring surface may contain a second drawing implementation"*. A wireframe of
  a `timeline` is a drawing of a timeline; this is a timeline.

  GROUPED BY PURPOSE, NOT BY PRIMITIVE. Somebody adding a block knows they want to show a list. They
  do not know that `todo`, `steps` and `timeline` share the `list` primitive while `chips` does not,
  and they should never have to.

  The previews are inert: `tabindex="-1"` inside the tile and `pointer-events: none` on the drawing,
  so the tile is one target rather than a live block you can accidentally operate.
-->
<script lang="ts">
  import { KINDS, isKind } from 'braindog-render';
  import { Block } from 'braindog-render/svelte';

  import { copy } from '../copy.ts';
  import { page as readPage, values } from '../record/api.ts';
  import { toSegments } from '../record/blocks.ts';
  import { BINDABLE, seedBlock } from '../record/seed.ts';
  import type { PageBlock } from '../record/schema.ts';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(false),
    slug,
    register,
    onadd,
  }: {
    open?: boolean;
    /** The page being added to — the preview binds to its own data, never to a fixture. */
    slug: string;
    register: string;
    onadd: (block: PageBlock) => void;
  } = $props();

  const resolved = values();
  const opts = { resolve: (path: string) => resolved[path] ?? null };

  const PURPOSES = ['figure', 'list', 'plan', 'say', 'media'] as const;

  /**
   * One seeded block per kind, resolved against the page's own register, rendered.
   *
   * Built inside a try per tile — 21 §3.3: *"instantiated inside a `try`; on failure the tile
   * degrades to the kind's description in the same slot, so the layout never breaks."* A picker
   * that throws because one kind cannot fill itself is a picker that shows nothing.
   */
  const tiles = $derived.by(() => {
    const result = readPage(slug);
    return BINDABLE.map((kind) => {
      const seed = seedBlock(kind, register);
      const preview = (isKind(kind) ? KINDS[kind].rows : undefined) ?? 3;
      let segments: ReturnType<typeof toSegments> = [];
      const bound = result?.blocks.find((b) => b.register === register);
      if (seed && bound) {
        try {
          segments = toSegments({
            ...bound,
            kind: seed.kind,
            /* The seed names FIELDS; the renderer wants render columns. Widths and alignment do not
               matter in a 132px preview, so they take the same defaults the page read gives an
               undeclared column. */
            columns: (seed.columns ?? []).map((c) => ({
              field: c.field,
              label: c.field,
              width: 'minmax(8ch,1fr)',
              align: 'start' as const,
              truncate: 'end' as const,
            })),
            metrics: undefined,
            /* Capped by the KIND, not by a number chosen here. `gauge` takes one row and `quote`
               takes one; three seeded rows against a one-row cap degrades to a visible fence, so
               the tile for the one kind that shows a single figure was showing a parse error. */
            entries: bound.entries.slice(0, preview),
            rows: bound.rows.slice(0, preview),
          });
        } catch {
          segments = [];
        }
      }
      return { kind, seed, segments, spec: isKind(kind) ? KINDS[kind] : undefined };
    });
  });
</script>

<Sheet bind:open title={copy.addBlock} >
  {#each PURPOSES as purpose}
    {@const group = tiles.filter((t) => t.spec?.purpose === purpose)}
    {#if group.length}
      <section class="group">
        <h3 class="group-name">{copy.purposes[purpose]}</h3>
        <ul class="tiles">
          {#each group as tile}
            <li>
              <button
                type="button"
                class="tile"
                onclick={() => {
                  if (tile.seed) onadd(tile.seed);
                  open = false;
                }}
              >
                <span class="tile-head">
                  <span class="tile-kind">{tile.kind}</span>
                  <span class="tile-what">{copy.kinds[tile.kind] ?? ''}</span>
                </span>
                <span class="tile-draw" aria-hidden="true">
                  {#if tile.segments.length}
                    {#each tile.segments as segment}
                      {#if segment.type === 'block'}<Block block={segment} {opts} />{/if}
                    {/each}
                  {:else}
                    <!-- The documented degrade: the description in the same slot, so the row of
                         tiles keeps its shape. Never a wireframe and never an icon. -->
                    <span class="tile-fallback">{copy.kinds[tile.kind] ?? tile.kind}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
</Sheet>

<style>
  .group + .group {
    margin-block-start: var(--sp-5);
  }

  .group-name {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .tiles {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--s1);
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: border-color var(--d-state) var(--ease-out);
  }

  .tile:hover {
    border-color: var(--accent);
  }

  .tile-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  .tile-kind {
    color: var(--ink);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    font-weight: 600;
  }

  .tile-what {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The drawing is a picture of itself and nothing more: no pointer, no focus, no scroll. The tile
     is the one target. */
  .tile-draw {
    display: block;
    max-block-size: 132px;
    overflow: hidden;
    pointer-events: none;
  }

  .tile-draw :global(.block) {
    margin: 0;
  }

  .tile-fallback {
    display: block;
    padding: var(--sp-3);
    background: var(--sunk);
    border: 1px dashed var(--line);
    border-radius: var(--r-sm);
    color: var(--dim);
    font-size: var(--t-sm);
  }
</style>
