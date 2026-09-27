<!--
  Edit layout: the head's arranging controls, the block picker, and the one write that sets the page's order, widths
  and columns. `PageBody.svelte` draws the blocks being moved; this is where arranging begins, where a block is added
  and where Done writes it.

  A MODE, NOT AN ALWAYS-ON AFFORDANCE. Drag handles on a page you are reading are noise, and an accidental drag that
  rewrites a row is the kind of edit nobody can attribute later.

  ARRANGING IS A DESKTOP SURFACE. 13 §10: "Authoring: read and approve, do not author. The page builder and pack builder
  are desktop surfaces." A drag-to-reorder mode on a phone is a mode where every gesture competes with the scroll, so
  the button is absent below 900px rather than disabled: a control that exists and refuses is worse than one that does
  not.
-->
<script lang="ts" module>
  import type { BlockResult } from '$lib/record/api.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import type { PageBlock } from '$lib/record/schema.ts';

  /**
   * A block added while arranging, run through the page read so it carries rows rather than a declaration.
   *
   * RESOLVED THROUGH THE SAME PAGE READ AS A DECLARED ONE. The record's page answer carries live rows per block, so a
   * block over a list the page already reads gets that list's rows the moment it exists, which is what makes "already
   * bound and already drawing" (21 §3.3) true rather than a promise the picker makes and the page breaks.
   */
  export function added(block: PageBlock, declared: readonly LiveBlock[]): LiveBlock {
    const template = declared.find((b) => b.register === block.source?.replace('register.', ''));
    return {
      ...(template ?? { rows: [], entries: [], matched: [], shown: 0, total: 0, drawn: true, stale_at: '' }),
      ...block,
      columns: (block.columns ?? []).map((c) => ({
        field: c.field,
        label: c.label ?? c.field,
        width: c.width ?? 'minmax(12ch,1fr)',
        align: c.align ?? ('start' as const),
        truncate: 'end' as const,
      })),
      metrics: undefined,
      register: block.source?.replace('register.', ''),
      drawn: true,
    } as BlockResult;
  }
</script>

<script lang="ts">
  import { apiBase } from '../at.ts';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { LivePageDecl } from '$lib/record/page-live.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import AddBlock from '$lib/ui/AddBlock.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { layoutOf, slotOf } from './layout.ts';
  import { words } from './words.ts';

  let {
    arrangement,
    slug,
    page,
    declared,
    all,
    extra = $bindable(),
    showSource,
    reread,
  }: {
    arrangement: Arrangement;
    /** The page's address, which the arrangement is written against. */
    slug: string;
    page: LivePageDecl;
    /** The blocks the record answered, which a new block's rows are read from. */
    declared: readonly LiveBlock[];
    /** Declared, then added: every block the page draws. */
    all: readonly LiveBlock[];
    /** Blocks added in this session. They live beside the declared ones and index past them. */
    extra: PageBlock[];
    /** Whether the declaration is drawn in place of the blocks, when there is nothing to arrange. */
    showSource: boolean;
    /** Reads the page again once the arrangement is written. */
    reread: () => Promise<void>;
  } = $props();

  const layout = $derived(layoutOf(page));
  const arranging = $derived(arrangement.editing);

  function beginArrange() {
    arrangement.begin(all.map((b, i) => slotOf(b, i, layout)));
  }

  /**
   * THE LIST A NEW BLOCK SHOWS: the page's own first list, or, on a page that shows none, the one the reader chooses.
   *
   * IT WAS `obligations` WHEREVER THE PAGE SHOWED NO LIST, which is a list only a record with Money has: every other
   * record was offered blocks over rows it does not hold (`loop/finish/shell.md` USE-2). A page's blocks say what the
   * page is about, and where they say nothing the reader is asked rather than handed a guess.
   */
  const primary = $derived(declared.find((b) => b.register)?.register ?? null);
  let chosen = $state<string | null>(null);
  const bindTo = $derived(primary ?? chosen);

  /* EVERY LIST THE RECORD HOLDS, the empty ones too, to choose from. `index.registers` is the rail's and leaves out a
     list with no row yet, so a record whose lists were all still empty would have been told it had no list at all,
     and a block over an empty list is a block that draws its "Add one" (`boot-live.ts` `lists`). */
  const lists = $derived((route.data as unknown as Partial<Shell>).lists ?? []);

  let adding = $state(false);
  let asking = $state(false);

  function addBlock() {
    if (bindTo) adding = true;
    else asking = true;
  }

  function choose(list: string) {
    chosen = list;
    asking = false;
    adding = true;
  }

  function add(block: PageBlock) {
    extra = [...extra, block];
    arrangement.slots = [
      ...(arrangement.slots ?? declared.map((b, i) => slotOf(b, i, layout))),
      { i: declared.length + extra.length - 1, span: block.span ?? 12 },
    ];
    const named = copy.kindNames[block.kind] ?? block.kind;
    toasts.push(copy.blockAddedLive(named));
  }

  /**
   * ONE write, one event batch, one undo, even for four moves.
   *
   * 02 §8 makes an `edit` one event row per changed FIELD, all sharing one `batch` ULID, and undo is a query over that
   * batch. Committing per drag would put four unrelated lines in the history for one act of tidying, and leave no single
   * thing to undo.
   *
   * DONE SETS THE DECLARATION, whole, and the page is read again from the record. A refusal leaves the mode open with
   * the draft in it, so Cancel still means cancel. Undo sets the body that was there before. EACH BLOCK'S COLUMN GOES
   * WITH ITS PLACE, through the one write every page uses.
   */
  let saving = false;
  async function commitArrange() {
    if (!arrangement.dirty) {
      arrangement.cancel();
      toasts.push(copy.arrangeNothing);
      return;
    }
    if (saving) return;
    saving = true;
    const title = page.title;
    const m = await import('$lib/record/page-write.ts');
    const placed = arrangement.body.map((b) => ({ i: b.block, span: b.span, ...(b.area ? { area: b.area } : {}) }));
    const out = await m.saveArrangement(apiBase(), slug, declared.length, placed, extra, undefined, page.declared_version);
    saving = false;
    if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
    arrangement.commit();
    await reread();
    extra = [];
    arrangement.slots = null;
    const before = out.before;
    toasts.push(copy.arranged(title), {
      undo: () =>
        void m.setBody(apiBase(), before, undefined, out.version).then(async (back) => {
          if (back.from !== 'written') toasts.push(back.fix, { intent: 'warn' });
          await reread();
        }),
    });
  }
</script>

{#if arranging}
  <Button weight="quiet" onclick={addBlock}>
    <Icon name="plus" size="s" />
    {copy.addBlock}
  </Button>
  <Button weight="bare" onclick={() => arrangement.cancel()}><Icon name="close" size="s" />{copy.arrangeCancel}</Button>
  <Button weight="primary" onclick={commitArrange}><Icon name="check" size="s" />{copy.arrangeDone}</Button>
{:else if !showSource}
  <span class="arrange-slot">
    <Button weight="quiet" onclick={beginArrange}>
      <Icon name="grid" size="s" />
      {copy.arrange}
    </Button>
  </span>
{/if}

{#if bindTo}
  <AddBlock bind:open={adding} blocks={declared} register={bindTo} onadd={add} />
{/if}

<!-- ASKED ONLY ON A PAGE THAT SHOWS NO LIST: which list the new block draws from, before the picker opens over it. -->
<Sheet bind:open={asking} title={words.bindTitle}>
  {#if lists.length > 0}
    <p class="bind-why">{words.bindWhy}</p>
    <ul class="bind-lists">
      {#each lists as list (list.id)}
        <li><Button weight="quiet" onclick={() => choose(list.id)}>{list.name}</Button></li>
      {/each}
    </ul>
  {:else}
    <p class="bind-why">{words.bindNone}</p>
  {/if}
</Sheet>

<style>
  /* AUTHORING IS A DESKTOP SURFACE (13 §10), so the way in is not drawn below 900px. */
  @media (width < 900px) {
    .arrange-slot {
      display: none;
    }
  }

  .bind-why {
    margin: 0 0 var(--sp-3);
    color: var(--ink2);
    font-size: var(--t-base);
  }

  /* THE LISTS AS ROWS OF CHOICES, one under another, with no box around them. */
  .bind-lists {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
