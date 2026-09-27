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

  The previews are inert, and that word is now the mechanism rather than a description of one: the
  comment here said `tabindex="-1"` inside the tile and there was no `tabindex` in the file at all,
  only the `pointer-events` half. CSS cannot take a thing out of the tab order, and three of the
  authored seeds draw primitives that put themselves INTO it: a `comparison` renders
  `<div class="table-region" tabindex="0">` and a `code` block renders `<pre tabindex="0">`. So
  tabbing through this sheet landed three times on an invisible strip that announces nothing, inside
  an element marked `aria-hidden`, inside a `<button>`. `inert` on the drawing
  so the tile is one target rather than a live block you can accidentally operate.
-->
<script lang="ts">
  import { KINDS, isKind } from 'braindog-render';
  import { Block, Degraded } from 'braindog-render/svelte';

  import { at } from '../at.ts';
  import { copy } from '../copy.ts';
  import { resolverOf, type LiveBlock } from '../record/page-live.ts';
  import { page as route } from '$app/state';
  import { REGISTERS } from '../record/held.ts';
  import { toSegments } from '../record/blocks.ts';
  import { bindableFor, seedBlock } from '../record/seed.ts';
  import type { PageBlock } from '../record/schema.ts';
  import Define from './Define.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(false),
    blocks,
    register,
    onadd,
  }: {
    open?: boolean;
    /**
     * THE PAGE'S OWN BLOCKS, AS THE RECORD ANSWERED THEM, which a preview binds to. It took the page's slug and read the
     * sample's page of that name, so every tile on a record previewed the sample's rows under the words "never to a
     * fixture". A page whose record answered no block of this list previews each kind from its description.
     */
    blocks: readonly LiveBlock[];
    register: string;
    onadd: (block: PageBlock) => void;
  } = $props();

  /* A `{{path}}` IS THE RECORD'S, answered on the block that carries it, and the first block that can answer it answers. */
  const resolve = (path: string): string | null => {
    for (const b of blocks) {
      const said = resolverOf(b.values)(path);
      if (said !== null) return said;
    }
    return null;
  };

  /* NOW IS THE RECORD'S CLOCK, not the browser's. `inline` defaults it to `Date.now()`, so every
     `{{ago:}}` in prose was formatted against the wall clock while every other date on the screen
     came from `NOW` — the Money page said an invoice was 6w overdue and the Home page said 5w, for
     the same row, two clicks apart. In production that reads differently on two devices and drifts
     a day further every day.

     AND THE RECORD'S CLOCK IS THE SHELL'S `now`, which `boot` answered with. It was the seed's `NOW`, so every
     preview's `{{ago:}}` was told against 3 September 2026 on a record read weeks later. */
  const opts = $derived({ resolve, now: route.data.now, href: at });

  const PURPOSES = ['figure', 'list', 'plan', 'say', 'media'] as const;

  /**
   * One seeded block per kind, resolved against the page's own register, rendered.
   *
   * Built inside a try per tile — 21 §3.3: *"instantiated inside a `try`; on failure the tile
   * degrades to the kind's description in the same slot, so the layout never breaks."* A picker
   * that throws because one kind cannot fill itself is a picker that shows nothing.
   */
  const tiles = $derived.by(() => {
    const decl = REGISTERS[register];
    /* THE ROWS A SEED IS PROPOSED FROM ARE THE ONES THIS PAGE DREW, and not the sample's rows of the list (`seed.ts`). */
    const bound = blocks.find((b) => b.register === register);
    return bindableFor(register).map((kind) => {
      const seed = seedBlock(kind, register, bound?.entries ?? []);
      const preview = (isKind(kind) ? KINDS[kind].rows : undefined) ?? 3;
      let segments: ReturnType<typeof toSegments> = [];
      /* An AUTHORED seed previews from its own rows and must not be handed a register — a block
         with both a source and authored rows is refused, so the preview would be the refusal. */
      if (seed?.authored) {
        try {
          segments = toSegments({
            ...(bound ?? {}),
            ...seed,
            register: undefined,
            columns: [],
            entries: [],
            matched: [],
            rows: [],
            metrics: undefined,
            refusals: [],
          } as never);
        } catch {
          segments = [];
        }
        return { kind, seed, segments, spec: isKind(kind) ? KINDS[kind] : undefined };
      }
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
              /* The register's own name, not the field id. A gauge takes its label from
                 `columns[0].label`, so `label: c.field` printed `what` on the tile — an id, in the
                 picker, which is the one screen where somebody is deciding what a kind even is. */
              label: c.label ?? decl?.name ?? c.field,
              width: 'minmax(8ch,1fr)',
              align: 'start' as const,
              truncate: 'end' as const,
            })),
            metrics: undefined,
            /* THE SEED'S TARGET, or a gauge previews as "— of —" and teaches somebody the kind is
               broken. `bound` is a real block off this page and carries no target, so spreading it
               and overriding only the kind loses the one field the seeded gauge added. */
            ...(seed.target === undefined ? {} : { target: seed.target }),
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
      /**
       * A PREVIEW THAT IS A REFUSAL IS NOT A PREVIEW.
       *
       * `table` is page-only, which `05 §2` and `36 §7` both specify as degrading to its fence like
       * an unknown kind, and until today nothing implemented that: the tile drew an empty grid, and
       * now the dialect answers honestly and the tile would draw the refusal sentence. Neither is a
       * picture of the kind. The tile already has the right fallback one branch down, which is the
       * kind's own DESCRIPTION in the same slot, "never a wireframe and never an icon", so a
       * preview made entirely of degradations falls through to it.
       *
       * IT IS NOT A TEST FOR `table`. Any kind whose seed the dialect cannot draw wants the same
       * answer, and naming the one that does it today is how this comes back.
       */
      if (segments.length > 0 && segments.every((s2) => s2.type === 'degraded')) segments = [];
      return { kind, seed, segments, spec: isKind(kind) ? KINDS[kind] : undefined };
    });
  });
</script>

<Sheet bind:open title={copy.addBlock} >
  <!-- `block` reaches a reader in exactly two places — this sheet and `/v/…`'s "Bind as a block",
       which is a button and cannot carry a clause. So it is defined here, once, above the sixteen
       kinds it is about to list.

       `{#if open}` IS LOAD-BEARING. A `<dialog>` renders its children whether or not it is showing,
       so without the guard the definition would be constructed — and spent — on every page a person
       opens, having never been on screen. A noun gets one chance and this is how you waste it. -->
  {#if open}
    <p class="sheet-define"><Define noun="block" /></p>
  {/if}

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
                  <span class="tile-kind">{copy.kindNames[tile.kind] ?? tile.kind}</span>
                  <span class="tile-what">{copy.kinds[tile.kind] ?? ''}</span>
                </span>
                <!-- `inert` AND NOT `aria-hidden`. It takes the subtree out of the tab order, out
                     of the accessibility tree and out of hit-testing in one attribute, which is
                     what "a picture of itself" means; `aria-hidden` alone did the third of those
                     and left focusable content behind it, which is the one arrangement axe calls a
                     serious violation in its own right. -->
                <span class="tile-draw" inert>
                  {#if tile.segments.length}
                    {#each tile.segments as segment}
                      {#if segment.type === 'block'}<Block block={segment} {opts} />{:else if segment.type === 'degraded'}<Degraded {segment} />{/if}
                    {/each}
                  {:else}
                    <!-- The documented degrade: the DESCRIPTION in the same slot, so the row of
                         tiles keeps its shape. Never a wireframe and never an icon.

                         IT PRINTED THE NAME, which the tile's own head prints two lines above — so a
                         tile that could not draw itself read `Bar chart / amounts side by side,
                         biggest first / Bar chart`. -->
                    <span class="tile-fallback">{copy.kinds[tile.kind] ?? ''}</span>
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
  /* Empty and gone after the first time, so it never leaves a gap above the first group. */
  .sheet-define:empty {
    display: none;
  }

  .sheet-define {
    margin: 0 0 var(--sp-3);
  }

  .group + .group {
    margin-block-start: var(--sp-5);
  }

  .group-name {
    margin-block-end: var(--sp-2);
    color: var(--dim);
    font-family: var(--font-ui);
    font-size: var(--t-sm);
    font-weight: 700;
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
    border-color: var(--ink2);
  }

  .tile-head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }

  /* The UI face, not the id face. It was monospace when it printed `bar` and `spec`, which was
     right for an identifier and wrong for "Bar chart" — a name set in code type reads as a value
     you must copy exactly rather than as a thing you can pick. */
  .tile-kind {
    color: var(--ink);
    font-size: var(--t-ui);
    font-weight: 600;
  }

  .tile-what {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The drawing is a picture of itself and nothing more: no pointer, no focus, no scroll. The tile
     is the one target, and `inert` on the element is what makes the second of those true. */
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
