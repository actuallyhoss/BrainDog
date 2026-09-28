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
  import { tick } from 'svelte';
  import { apiBase } from '../at.ts';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import type { Area } from '$lib/record/arrange.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { blockWords, readList } from '$lib/record/block-edit.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { InstalledKind } from '$lib/record/kinds.ts';
  import { may } from '$lib/record/may.ts';
  import { listName } from '$lib/record/names.ts';
  import type { LivePageDecl } from '$lib/record/page-live.ts';
  import type { Patch } from '$lib/record/page-write.ts';
  import type { BlockBody } from '$lib/record/pages-live.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import AddBlock from '$lib/ui/AddBlock.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import BlockEditor from './BlockEditor.svelte';
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

  /**
   * WHETHER THIS PERSON MAY CHANGE PAGES AT ALL. The arrangement is written with `setDeclaration`, which the record
   * guards as ADMIN, so a member without the owner's level would be offered Edit layout and Add a block and refused on
   * Done. The controls are absent for them instead, as every control that cannot act is (19 §6).
   */
  const mayChange = $derived(may(route.data as unknown as Shell, 'owner'));

  /**
   * THE LIST WHOSE EVERY PAGE THIS ARRANGES, on a page made for each row of one. Arranging it arranges the template
   * (`page-write.ts` `saveArrangement`), so the mode says so before anything is moved.
   */
  const every = $derived(page.for?.register ? listNamed(page.for.register) : null);

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

  /** A list's name as the record calls it, and `names.ts`'s spelling of its id where the shell does not list it. */
  function listNamed(id: string): string {
    const bare = id.startsWith('register.') ? id.slice('register.'.length) : id;
    return lists.find((l) => l.id === bare)?.name ?? listName(bare);
  }

  /* THE KINDS THE RECORD'S PACKS DECLARE, read with the bound list's schema, so the picker lists them beside its own. */
  let installed = $state<Record<string, InstalledKind>>({});
  $effect(() => {
    const list = bindTo;
    if (!list || !arranging) return;
    let live = true;
    void readList(apiBase(), list).then((got) => {
      if (live && got) installed = got.kinds;
    });
    return () => {
      live = false;
    };
  });

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
    await write(null);
  }

  /**
   * The arrangement write, with one block's edit in it when the editor saved.
   *
   * AN EDIT GOES THROUGH THE SAME WRITE AS A MOVE, so the draft in force (the order, widths and columns arranged so far,
   * and any block added) lands with it and Put back sets the whole body that was there before. After an edit the mode
   * stays open over the page as re-read, because the reader was in the middle of arranging it; after Done it closes.
   */
  async function write(edit: { i: number; patch: Patch; name: string } | null): Promise<boolean> {
    if (saving) return false;
    saving = true;
    const title = page.title;
    const m = await import('$lib/record/page-write.ts');
    const placed = arrangement.body.map((b) => ({
      i: b.block,
      span: b.span,
      ...(b.area ? { area: b.area } : {}),
      ...(edit && edit.i === b.block ? { edit: edit.patch } : {}),
    }));
    const out = await m.saveArrangement(apiBase(), slug, declared.length, placed, extra, undefined, page.declared_version);
    saving = false;
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    arrangement.commit();
    await reread();
    extra = [];
    arrangement.slots = null;
    const before = out.before;
    const said = edit ? blockWords.saved(edit.name) : out.template && every ? blockWords.arrangedEvery(every) : copy.arranged(title);
    toasts.push(said, {
      undo: () =>
        void m.setBody(apiBase(), before, undefined, out.version).then(async (back) => {
          if (back.from !== 'written') toasts.push(back.fix, { intent: 'warn' });
          await reread();
        }),
    });
    if (edit) {
      await tick();
      beginArrange();
    }
    return true;
  }

  /* ── the block editor ─────────────────────────────────────────────────── */

  /** The place being edited, and the block there, while the editor is open. */
  const editing = $derived.by(() => {
    const at = arrangement.editAt;
    const slot = at === null ? undefined : arrangement.slots?.[at];
    const block = slot ? all[slot.i] : undefined;
    return at !== null && slot && block ? { at, slot, block } : null;
  });

  /** The sheet is open while a place is being edited, and closing it clears the place, so the next Edit opens afresh. */
  const editorOpen = () => editing !== null;
  const setEditorOpen = (open: boolean) => {
    if (!open) arrangement.editAt = null;
  };

  /**
   * A block added in this session, as the record would be sent it: the picker's drawing hints (a column's width and
   * alignment) left off, as `declaredBlock` leaves them off in the write.
   */
  function addedBody(i: number): BlockBody | null {
    const b = i >= declared.length ? extra[i - declared.length] : undefined;
    if (!b) return null;
    const columns = b.columns?.map((c) => ({ field: c.field, ...(c.label ? { label: c.label } : {}), ...(c.as ? { as: c.as } : {}) }));
    return { ...(b as unknown as BlockBody), ...(columns ? { columns } : {}) };
  }

  /** The lists a block may show: the ones the page requires, or every list where the page names none. */
  const offered = $derived.by(() => {
    const required = (page.requires ?? []).filter((r) => r.startsWith('register.') || !r.includes('.'));
    return required.length ? required.map((r) => ({ id: r.replace(/^register\./, ''), name: listNamed(r) })) : lists.map((l) => ({ id: l.id, name: l.name }));
  });

  async function saveEdit(patch: Patch, span: number, area: Area | null): Promise<boolean> {
    const now = editing;
    if (!now) return false;
    arrangement.setSpan(now.at, span);
    if (area) arrangement.setArea(now.at, area);
    const name = now.block.heading || (copy.kindNames[now.block.kind] ?? blockWords.kindNames[now.block.kind] ?? now.block.kind);
    if (Object.keys(patch).length === 0 && !arrangement.dirty) return true;
    return write({ i: now.slot.i, patch, name });
  }
</script>

<!-- NOTHING HERE FOR A MEMBER WHO CANNOT CHANGE PAGES (`mayChange`): no Edit layout, no Add a block, no editor. -->
{#if arranging && mayChange}
  {#if every}<span class="arrange-every" role="status">{blockWords.everyPage(every)}</span>{/if}
  <Button weight="quiet" onclick={addBlock}>
    <Icon name="plus" size="s" />
    {copy.addBlock}
  </Button>
  <Button weight="bare" onclick={() => arrangement.cancel()}><Icon name="close" size="s" />{copy.arrangeCancel}</Button>
  <Button weight="primary" onclick={commitArrange}><Icon name="check" size="s" />{copy.arrangeDone}</Button>
{:else if !showSource && mayChange}
  <span class="arrange-slot">
    <Button weight="quiet" onclick={beginArrange}>
      <Icon name="grid" size="s" />
      {copy.arrange}
    </Button>
  </span>
{/if}

{#if bindTo && mayChange}
  <AddBlock bind:open={adding} blocks={declared} register={bindTo} onadd={add} {installed} />
{/if}

{#if editing && mayChange}
  <BlockEditor
    bind:open={editorOpen, setEditorOpen}
    {slug}
    index={editing.slot.i}
    added={addedBody(editing.slot.i)}
    block={editing.block}
    span={editing.slot.span}
    area={layout ? (editing.slot.area ?? 'main') : null}
    lists={offered}
    {every}
    onsave={saveEdit}
  />
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

  /* THE ONE LINE OF CONTEXT the mode carries on a template: quiet, beside the controls it is about. */
  .arrange-every {
    align-self: center;
    color: var(--dim);
    font-size: var(--t-sm);
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
