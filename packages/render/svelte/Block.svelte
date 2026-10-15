<!--
  One drawn block. Dispatches on its spec's primitive (`kindSpec`, with the kinds the host installed in `opts.kinds`) to
  one of the eight primitive components, which is why a kind a pack invented after this bundle shipped renders anyway. The few kinds with a drawer and a callback of their
  own (`inputs`, `calendar`, `lanes`, `link`, `gallery`, `embed` and `steps path`) are asked for by name first, below.

  The `<figure>` skeleton, its classes and its data attributes are the same as `toHTML`'s, so the
  two accessibility trees are equal BY CONSTRUCTION rather than by a promise the parity gate has to
  police afterwards (50 §2.7).
-->
<script lang="ts">
  import { TONES, captioned, inline, type Block, type RenderOptions, type Row } from '../src/index.ts';
  import { kindSpec } from '../src/kind-spec.ts';
  import { emptied } from '../src/html.ts';
  import Text from './Text.svelte';
  import Panel from './p/Panel.svelte';
  import Grid from './p/Grid.svelte';
  import Rows from './p/Rows.svelte';
  import Proportional from './p/Proportional.svelte';
  import InlineRun from './p/Inline.svelte';
  import List from './p/List.svelte';
  import type { RoadmapDrop } from './p/roadmap-drag.ts';
  import Table from './p/Table.svelte';
  import { comparisonPlan } from '../src/table.ts';
  import Media from './p/Media.svelte';
  import Inputs from './Inputs.svelte';
  import Calendar from './Calendar.svelte';
  import Form from './Form.svelte';
  import Lanes from './Lanes.svelte';
  import Links from './Links.svelte';
  import Gallery from './Gallery.svelte';
  import Embed from './Embed.svelte';
  import Path from './Path.svelte';
  import Actions from './Actions.svelte';
  import { actionLabels, tableSourceRow, type OnAct } from '../src/actions.ts';
  import type { OnCapture } from './types.ts';
  import type { OnInput } from '../src/inputs.ts';

  let {
    block,
    opts = {},
    onmove,
    ontick,
    onact,
    oncapture,
    onreschedule,
    oninput,
    onpath,
    cursor,
    onrowfocus,
    onopen,
    onmenu,
    onselect,
    selected,
    act,
    onmore,
  }: {
    block: Block;
    opts?: RenderOptions;
    /**
     * SOME DRAWERS CAN CHANGE A ROW AND THE REST CANNOT, so these callbacks cross this component and
     * reach exactly the ones that take them, each named beside its callback below.
     *
     * THEY ARE NOT ON `RenderOptions`. Every member of that type is a READ: a resolver, a link
     * builder, a clock. Putting a write callback on it would give `toHTML` a key it can never
     * honour, and the two renderers are equal by construction rather than by a promise.
     *
     * A PRIMITIVE WITH NO CALLBACK DRAWS NOTHING INTERACTIVE AT ALL, which is `19 §6`'s rule
     * applied one layer down: a control that cannot act is absent rather than greyed out. So an
     * embedder who wants a read-only board or a read-only checklist gets one by passing nothing,
     * and the markup is what it has always been.
     */
    onmove?: ((row: Row, to: string) => void) | undefined;
    ontick?: ((row: Row, done: boolean) => void) | undefined;
    /** The list primitive's other write: answering one of a queue's questions. */
    onact?: ((row: Row, option: string) => void) | undefined;
    /**
     * The panel's one write: a `capture`'s line. The register, the text as typed and trimmed, and what the
     * new row inherits from the block's `where:`, which the host writes as the row's fields beside the title.
     */
    oncapture?: OnCapture | undefined;
    /**
     * The list primitive's third write: a `roadmap` bar dropped on a new day. The row, and the drop, which carries the
     * gesture and `dragPatch` bound to it, because only the host holds the row as the record stores it.
     *
     * IT STOPPED HERE ONCE. The drawer took this callback and proved every bar a grip, and no bar in the app could be
     * dragged, because this component and `List` did not pass it on; `svelte/p/roadmap-reach.test.ts` goes in at this
     * layer so the two halves cannot come apart again unnoticed.
     */
    onreschedule?: ((row: Row, drop: RoadmapDrop) => void) | undefined;
    /**
     * The `rows` primitive's one write: a field of an `inputs` block changed, handed on with the row it was drawn
     * from and the text as it stands (`../src/inputs.ts`). Every keystroke; the pause before a write is the host's.
     */
    oninput?: OnInput | undefined;
    /**
     * A `steps path` stone pressed: the row and the state it now shows. Handed to `Path` alone, which draws each stone
     * as a 44px toggle only when this is passed and as a picture of one otherwise.
     */
    onpath?: ((row: Row, done: boolean) => void) | undefined;
    /** A list block's table asks for its next rows past the cursor its first page handed out (PGS-A16): the host reads them. */
    onmore?: ((block: Block) => void) | undefined;
    /**
     * THE ROW CURSOR (`../src/cursor.ts`), READS AND NOT WRITES, so a host can walk a page's rows with j/k across its
     * blocks: the key of the row it is on, drawn `data-focused`, and where it hears that focus moved into a row. Handed
     * to the list primitive, whose `todo`, `timeline`, `feed` and `queue` rows carry `data-row` in both renderers.
     */
    cursor?: string | null | undefined;
    onrowfocus?: ((key: string, row: Row) => void) | undefined;
    /**
     * A TASK'S TWO VERBS, READS OF THE HOST'S AND NOT WRITES: open the row (a docked panel), and its menu, anchored to
     * the control pressed. Handed to the list primitive, whose `todo` rows draw a title button and a quiet trailing
     * control only when each is passed, and to the grid, whose `board` cards draw the same two the same way.
     */
    onopen?: ((row: Row) => void) | undefined;
    onmenu?: ((row: Row, anchor: HTMLElement) => void) | undefined;
    /**
     * A QUEUE'S BULK CHOICE: a box on each question only when `onselect` is passed, and which questions the host holds
     * as chosen, by `rowKey`, where it holds them. Handed to the list primitive, which hands it to the queue alone.
     */
    onselect?: ((row: Row, on: boolean) => void) | undefined;
    selected?: readonly string[] | undefined;
    /**
     * A DECLARED ACTION PRESSED (PGS-A12): the action, the row it sat on, and a switch's or a choice's new value. Handed
     * to `Actions`, which draws the block's `actions` under it only when this is passed, and with the block's
     * `row_actions` to `List` (each row's end) and to a table's `Table` (a last column); a preview or the mirror passes
     * nothing and gets the block as it always was. The grid's cards and board are a later job.
     */
    act?: OnAct | undefined;
  } = $props();

  /* THE BLOCK'S DECLARED ACTIONS, as the page read handed them, cut to what this reader may press. Read loosely until
     the parsed `Block` type carries the key: a fence an author typed never has one. */
  const actions = $derived(block.actions);
  /* EACH ROW'S, the same way: handed to the list and the table only when `act` is, so a preview draws its rows as ever. */
  const rowActions = $derived(act ? block.row_actions : undefined);
  /* A TABLE'S PRESS IS HANDED ITS `TableRow`, whose key is its place under the head row (`comparisonPlan`), so the host
     gets back the row of the block it declared and not the drawer's copy of it. */
  /* THE QUIET LINE WITH NO HOST: the block's labels, then its rows', once each, the line `toHTML` prints. */
  const quiet = $derived(actionLabels([...(actions ?? []), ...(block.row_actions ?? [])]));
  const tableAct: OnAct = (action, row, value) => act?.(action, tableSourceRow(block.rows, row), value);

  /** The list this block draws through, so `choose` can reach its queue. */
  let list = $state<{ choose(i: number, key?: string | null): boolean } | undefined>(undefined);

  /**
   * A NUMBER KEY'S ANSWER: option `i` (0 is the first, which `1` presses) of the queue question under `key`, under the
   * cursor, or the first. False where this block is not a queue the host can answer.
   */
  export function choose(i: number, key?: string | null): boolean {
    return list?.choose(i, key) ?? false;
  }

  const PRIMITIVE = { panel: Panel, grid: Grid, rows: Rows, proportional: Proportional, inline: InlineRun, list: List, media: Media };

  /* THROUGH `kindSpec`, so a kind a pack declared is looked up in the installed ones the host passed (`opts.kinds`) and
     drawn by its primitive below like any first-party kind on it. `undefined` is a kind nobody installed. */
  const spec = $derived(kindSpec(block.kind, opts.kinds));
  const Draw = $derived(spec ? PRIMITIVE[spec.primitive as keyof typeof PRIMITIVE] : undefined);

  /* `comparison` builds its columns from its first row, which fixes the column count. The
     derivation is `comparisonPlan` in `../src/table.ts` rather than here, because `toHTML` has to
     reach the same columns: it used to write its own and spelled the same track list differently,
     so the two renderers differed on every table in the product. */
  const comparison = $derived(comparisonPlan(block.rows));
</script>

{#if !spec}
  <!-- A kind nobody installed, `toHTML`'s same one line: a label and what to do, never an empty figure. -->
  <figure class="block" data-kind={block.kind}><p class="needs-client">Block “{block.kind}” needs a newer client.</p></figure>
{:else if emptied(block, opts) !== null}
<figure
  class="block block-{spec.primitive}"
  data-kind={block.kind}
  data-form={block.form}
  data-primitive={spec.primitive}
  data-intent={block.tone}
>
  <!-- `captioned` is the same rule `toHTML` reads: a `code` heading is its language and a `section`
       heading is the section itself, so neither becomes a caption. -->
  {#if captioned(block)}
    <!-- The glyph and the words touch, as `toHTML` writes them: a line break between them was a
         leading space in the caption's text that the other renderer does not have. -->
    <figcaption class="block-head" data-intent={block.tone}
      >{#if block.tone}<span class="glyph" role="img" aria-label={TONES[block.tone].label}>{TONES[block.tone].glyph}</span
        >{/if}<Text nodes={inline(block.heading ?? '', opts)} {opts} /></figcaption
    >
  {/if}

  {#if spec.primitive === 'table'}
    {#if comparison}
      <!-- `rows.length` AND NOT `rows.length + 1`. `Table` counts its own header row into
           `aria-rowcount` now; this was the one caller of six that added the header itself, and
           the other five did not, so five surfaces announced one row too few and this one was
           right by hand. -->
      <Table columns={comparison.columns} rows={comparison.rows} total={comparison.rows.length} label={block.heading} href={opts.href} home={opts.home} {rowActions} act={act ? tableAct : undefined} onmore={onmore ? () => onmore(block) : undefined} />
    {/if}
  {:else if block.kind === 'inputs'}
    <!-- BY KIND, because the callback belongs to one kind on a primitive two others share: handed to `Rows`, a `spec`
         would take a write it can never make. -->
    <!-- AND NOT THROUGH `Rows` EVEN READ-ONLY: an inputs row is `field | label | type | value`, so `Rows` would print the
         field's id as its label and its label as its value. `Inputs` draws the spec itself, in `Rows`' classes. -->
    <Inputs {block} {opts} {oninput} />
  {:else if block.kind === 'form'}<Form {block} {opts} {act} />
  {:else if block.kind === 'calendar'}
    <!-- CALENDAR, LANES, LINK, GALLERY AND EMBED, EACH WITH A DRAWER OF ITS OWN, and the path, BY KIND AND BEFORE THE
         PRIMITIVES, for `inputs`' reason: each sits on a primitive other kinds share, and asking here keeps a
         primitive's component from learning a kind it has no callback for. A drawer that does not know one of these
         kinds falls back to its primitive, which is why each is on one. -->
    <Calendar {block} {opts} />
  {:else if block.kind === 'lanes'}
    <Lanes {block} {opts} />
  {:else if block.kind === 'link'}
    <Links {block} {opts} />
  {:else if block.kind === 'gallery'}
    <Gallery {block} {opts} />
  {:else if block.kind === 'embed'}
    <Embed {block} {opts} />
  {:else if block.kind === 'steps' && block.form === 'path'}
    <!-- Here and not through `List`, because the stone's write is the path's alone and `List` has three of its own. -->
    <Path {block} {opts} {onpath} />
  {:else if spec.primitive === 'grid'}
    <!-- BY NAME rather than through `Draw`, because the callback belongs to one primitive: handed
         to the union the other six are in, it is a prop none of them declares. -->
    <Grid {block} {opts} {onmove} {onopen} {onmenu} />
  {:else if spec.primitive === 'list'}
    <List bind:this={list} {block} {opts} {ontick} {onact} {onreschedule} {cursor} {onrowfocus} {onopen} {onmenu} {onselect} {selected} {rowActions} {act} />
  {:else if spec.primitive === 'panel'}
    <Panel {block} {opts} {oncapture} />
  {:else if Draw}
    <Draw {block} {opts} />
  {:else}
    <!-- An unknown primitive degrades to one line: a label and what to do. Not an explanation, not
         a metric — the reader cannot act on either (22 §3). -->
    <p class="needs-client">Block “{block.kind}” needs a newer client.</p>
  {/if}
  <!-- UNDER THE BLOCK AND INSIDE ITS FIGURE, the controls only when the host can press them. With no `act` (a preview,
       the mirror) the labels are one quiet line and nothing pressable, the line `toHTML` prints, so the two trees stay
       equal; a block with no actions draws neither. A row's actions join that line once, never one a row. -->
  {#if act && actions?.length}
    <Actions {actions} onact={act} />
  {:else if !act && quiet.length > 0}
    <p class="block-actions">{quiet.join(' · ')}</p>
  {/if}
</figure>
{/if}
