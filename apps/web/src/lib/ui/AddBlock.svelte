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
  import { KINDS, isKind, kindSpec } from 'braindog-render';
  import { Block, Degraded } from 'braindog-render/svelte';

  import { at } from '../at.ts';
  import { copy } from '../copy.ts';
  import { resolverOf, type LiveBlock } from '../record/page-live.ts';
  import { page as route } from '$app/state';
  import { REGISTERS } from '../record/held.ts';
  import { display, homeCurrency } from '../record/api.ts';
  import { toSegments } from '../record/blocks.ts';
  import { bindableFor, notOfferedLine, seedBlock, seedPackBlock, seedStrip } from '../record/seed.ts';
  /* ALREADY IN THIS CHUNK: `blocks.ts` reaches it through the drawers' registry (`page/kinds/index.ts`), so the form's
     tile is drawn by the form's own reading of an answer and nothing new loads with the menu. */
  import { formOfAnswer } from '../page/kinds/form.ts';
  import { blockWords } from '../record/block-edit.ts';
  import type { InstalledKind } from '../record/kinds.ts';
  import type { PageBlock } from '../record/schema.ts';
  import { composeWords } from '../page/compose-words.ts';
  import { shelfWords, type Shelved } from '../page/shelf.ts';
  import Button from './Button.svelte';
  import Define from './Define.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(false),
    blocks,
    register,
    onadd,
    installed = {},
    shelf = [],
    onmake,
    onplace,
    onremove,
  }: {
    open?: boolean;
    /**
     * THE KINDS THE RECORD'S PACKS DECLARE (`installedKinds`), listed under their own group beside this build's.
     * Each is seeded over the list like any other; its tile draws its title, because this build has no drawing of a kind
     * it did not ship and a tile never draws a wireframe.
     */
    installed?: Readonly<Record<string, InstalledKind>>;
    /**
     * THE PAGE'S OWN BLOCKS, AS THE RECORD ANSWERED THEM, which a preview binds to. It took the page's slug and read the
     * sample's page of that name, so every tile on a record previewed the sample's rows under the words "never to a
     * fixture". A page whose record answered no block of this list previews each kind from its description.
     */
    blocks: readonly LiveBlock[];
    register: string;
    onadd: (block: PageBlock) => void;
    /** THE PERSON'S SHELF, drawn components they kept, placed from here like a block (`page/shelf.ts`). */
    shelf?: readonly Shelved[] | undefined;
    /** Opens "Make a component", which composes a block from a line. Absent where it cannot be made. */
    onmake?: (() => void) | undefined;
    onplace?: ((item: Shelved) => void) | undefined;
    onremove?: ((item: Shelved) => void) | undefined;
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
  const opts = $derived({ resolve, now: route.data.now, href: at, home: homeCurrency() });

  const PURPOSES = ['figure', 'list', 'plan', 'say', 'media'] as const;

  /** The strip's own id in the menu: a calendar, seeded as the next five weeks (`seedStrip`). */
  const STRIP = 'calendar-weeks';

  /**
   * THE MENU'S WORDS FOR WHAT NEITHER SHARED TABLE NAMES YET (`copy.kindNames`, `blockWords.kindNames`), so a tile says a
   * name and never an id. The shared tables win wherever they name one.
   */
  const MENU: Readonly<Record<string, { name: string; what: string }>> = {
    [STRIP]: { name: 'Next five weeks', what: 'this week and the four after it, a line of days each' },
  };

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
    /* THE STRIP IS A SECOND SEED OF THE CALENDAR, offered beside it wherever a calendar is, so an offer is keyed by its
       own id and not by its kind alone. */
    const offers = bindableFor(register).flatMap((kind) => {
      const seed = seedBlock(kind, register, bound?.entries ?? []);
      const strip = kind === 'calendar' ? seedStrip(register, bound?.entries ?? []) : null;
      return [{ id: kind, kind, seed }, ...(strip ? [{ id: STRIP, kind, seed: strip as PageBlock }] : [])];
    });
    return offers.map(({ id, kind, seed }) => {
      const preview = (isKind(kind) ? KINDS[kind].rows : undefined) ?? 3;
      let segments: ReturnType<typeof toSegments> = [];
      /* A FORM IS DRAWN FROM AN ANSWER, never from rows (`page/kinds/form.ts`), so its tile is the seed read as the
         record answers a form, through the same reading the page's form takes. With no `act` the drawer draws it as a
         preview: its questions, the boxes shown and not pressable. */
      if (seed?.kind === 'form') {
        const spec = formOfAnswer({ form: seed });
        if (spec) {
          const raw = ['```form', ...(spec.fields as { label: string }[]).map((f) => f.label), String(spec.submit), '```'].join('\n');
          segments = [{ type: 'block', kind: 'form', rows: [], raw, start: 0, end: raw.length, form_spec: spec } as ReturnType<typeof toSegments>[number]];
        }
        return { id, kind, seed, segments, spec: kindSpec(kind, installed) };
      }
      /* WHAT CHANGED IS THE RECORD'S LOG, which this sheet does not read, and a list's rows drawn as a log would be a
         picture of something else. The tile says what the block is, the documented degrade. */
      if (seed?.kind === 'feed') return { id, kind, seed, segments, spec: kindSpec(kind, installed) };
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
        return { id, kind, seed, segments, spec: kindSpec(kind, installed) };
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
            /* THE ROWS IN THE SEED'S OWN COLUMNS. They were the page block's rows, cut by that block's columns, so a heat
               seeded `day | value` over a page whose table led with the name read each name as a day. Each cell is said
               as the page's reader says it (`display`), which is what every kind is drawn from on the page. */
            rows: bound.rows.slice(0, preview).map((r, i) => ({
              ...r,
              cells: (seed.columns ?? []).map((c) => display(register, c.field, bound.entries[i]?.fields[c.field], route.data.now) ?? ''),
            })),
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
      return { id, kind, seed, segments, spec: kindSpec(kind, installed) };
    });
  });

  /** A kind's name and its one line, from the shared table first, then this component's words for the kinds it adds. */
  const nameOf = (kind: string): string =>
    kind === STRIP ? MENU[kind]!.name : (copy.kindNames[kind] ?? blockWords.kindNames[kind] ?? MENU[kind]?.name ?? installed[kind]?.title ?? kind);
  const whatOf = (kind: string): string => (kind === STRIP ? MENU[kind]!.what : (copy.kinds[kind] ?? blockWords.kinds[kind] ?? MENU[kind]?.what ?? ''));

  /* WHAT THIS LIST CANNOT FILL, said once under the groups: a kind with no field to stand on is not a tile, and the
     menu says which and why rather than leaving a person to wonder where the heat map went. */
  const notOffered = $derived(notOfferedLine(register, nameOf));

  /* THE RECORD'S OWN KINDS, each seeded over the list, left out where the list cannot fill it. No segments: the tile
     draws the kind's title in the description's slot, the documented degrade. */
  const packTiles = $derived(
    Object.entries(installed).flatMap(([kind, spec]) => {
      const seed = seedPackBlock(kind, spec, register);
      return seed ? [{ id: kind, kind, seed: seed as PageBlock | null, segments: [] as ReturnType<typeof toSegments>, spec: spec as { purpose: string } | undefined }] : [];
    }),
  );
  const allTiles = $derived([...tiles, ...packTiles]);
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

  <!-- AND THE TILES BEHIND THE SAME GUARD: each is a block drawn as a picture of itself, so a closed sheet held every
       kind's sample (a code block's `pre` among them) on every page, built for nobody and found by a page's own keys. -->
  {#if open}
  {#if onmake}
    <section class="group">
      <Button weight="quiet" onclick={() => { open = false; onmake(); }}>{composeWords.make}</Button>
    </section>
  {/if}
  {#if shelf.length > 0}
    <section class="group">
      <h3 class="group-name">{shelfWords.title}</h3>
      <ul class="shelf">
        {#each shelf as item (item.id)}
          <li>
            <Button weight="quiet" onclick={() => { onplace?.(item); open = false; }}>{item.name}</Button>
            {#if onremove}<Button weight="bare" onclick={() => onremove(item)}>{shelfWords.remove}</Button>{/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  {#each PURPOSES as purpose}
    {@const group = allTiles.filter((t) => t.spec?.purpose === purpose)}
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
                  <span class="tile-kind">{nameOf(tile.id)}</span>
                  <span class="tile-what">{whatOf(tile.id)}</span>
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
                    <span class="tile-fallback">{whatOf(tile.id) || nameOf(tile.id)}</span>
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/each}
  {#if notOffered}<p class="not-offered">{notOffered}</p>{/if}
  {/if}
</Sheet>

<style>
  /* Empty and gone after the first time, so it never leaves a gap above the first group. */
  .sheet-define:empty {
    display: none;
  }

  .sheet-define {
    margin: 0 0 var(--sp-3);
  }

  /* THE SHELF'S ITEMS AS ROWS: a name to place and a quiet way to take it off. */
  .shelf {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .shelf li {
    display: flex;
    gap: var(--sp-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .group + .group {
    margin-block-start: var(--sp-5);
  }

  /* A META HEADING over each group, as the palette's are, and at 500: the weights are 400 to 600. */
  .group-name {
    margin-block: 0 var(--sp-2);
    color: var(--ink-3);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
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
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-pop);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background var(--d-state) var(--ease-out);
  }

  /* A CHOICE ON THE SHEET, NOT A TILE IN IT (a tile never holds a tile, and a tile has no border): the `--tile-2`
     fill, and one step deeper under the pointer. */
  @media (hover: hover) and (pointer: fine) {
    .tile:hover {
      background: var(--tile-2);
    }
  }

  /* UNDER FORCED COLOURS the fill is gone, so each choice keeps an edge. */
  @media (forced-colors: active) {
    .tile {
      border: 1px solid CanvasText;
    }
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
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .tile-what {
    color: var(--ink-3);
    font-size: var(--fs-meta);
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

  /* ONE LINE, AND READ: what this list cannot fill and why, under the groups, at body size. */
  .not-offered {
    margin: var(--sp-5) 0 0;
    color: var(--ink-3);
    font-size: var(--fs-body);
  }

  .tile-fallback {
    display: block;
    padding: var(--sp-3);
    background: var(--tile);
    border-radius: var(--r-xs);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }
</style>
