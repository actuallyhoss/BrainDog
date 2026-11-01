<!--
  Edit layout: the head's arranging controls, the block picker, and the one write that sets the page's order, widths
  and columns. `PageBody.svelte` draws the blocks being moved; this is where arranging begins, where a block is added
  and where Done writes it.

  A MODE, NOT AN ALWAYS-ON AFFORDANCE. Drag handles on a page you are reading are noise, and an accidental drag that
  rewrites a row is the kind of edit nobody can attribute later.

  ARRANGING IS A DESKTOP SURFACE. 13 §10: "Authoring: read and approve, do not author. The page builder and pack builder
  are desktop surfaces." A drag-to-reorder mode on a phone is a mode where every gesture competes with the scroll, so
  the way in is absent below 900px rather than disabled: a control that exists and refuses is worse than one that does
  not. The way in is an entry in the head's page menu (`ChangePage.svelte`), handed `entry()` from here.
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
  import { goto } from '$app/navigation';
  import { apiBase } from '../at.ts';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import type { Area } from '$lib/record/arrange.ts';
  import type { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { blockWords, readList } from '$lib/record/block-edit.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { navPrefs } from '$lib/nav-prefs.svelte.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import type { InstalledKind } from '$lib/record/kinds.ts';
  import { may } from '$lib/record/may.ts';
  import { listName } from '$lib/record/names.ts';
  import type { LivePageDecl } from '$lib/record/page-live.ts';
  import type { Patch } from '$lib/record/page-write.ts';
  import type { BlockBody, PageBody } from '$lib/record/pages-live.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import type AddBlockView from '$lib/ui/AddBlock.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import type BlockEditorView from './BlockEditor.svelte';
  import { composeWords, type Composed } from './compose.ts';
  import type MakeComponentView from './MakeComponent.svelte';
  import { askedIn, CHANGE_EVENT, CHANGE_PAGE_EVENT, holdLine, keyInFocus, slashEntryWords, withoutEntry } from './slash-entry.ts';
  import { listOf, shelfWords, type Declared, type Shelved } from './shelf.ts';
  import type { LookUndo } from '$lib/record/arrange-look.ts';
  import { layoutOf, slotOf } from './layout.ts';
  import { retireLook, writeLook } from './look.ts';
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
    install = null,
    reopen = null,
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
    /**
     * The body a page drawn but not yet kept is installed as on its first write: Today or Decide, previewed by their
     * screens and arranged through `home-arrange.ts`. `null` for a page the record holds, which is arranged in place.
     */
    install?: PageBody | null;
    /**
     * Opens the mode again after an edit, where the page is arranged from a read of its own rather than from the blocks
     * drawn (a home, `home-arrange.ts`). `null` re-opens it over `all`.
     */
    reopen?: (() => void) | null;
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
   * THE WAY IN, FOR THE HEAD'S PAGE MENU (`ChangePage.svelte`), which holds Edit layout beside Change this page now that
   * the head draws one "⋯" rather than a row of buttons. `null` where this reader may not arrange or the page is drawn as
   * its source, so the menu offers nothing that would be refused or has nothing to move.
   */
  export const entry = (): (() => void) | null => (mayChange && !showSource && !arranging ? beginArrange : null);

  /**
   * THE LIST A NEW BLOCK SHOWS: the page's own first list, or, on a page that shows none, the one the reader chooses.
   *
   * IT WAS `obligations` WHEREVER THE PAGE SHOWED NO LIST, which is a list only a record with Money has: every other
   * record was offered blocks over rows it does not hold. A page's blocks say what the
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

  function add(block: PageBlock, quiet = false) {
    extra = [...extra, block];
    arrangement.slots = [
      ...(arrangement.slots ?? declared.map((b, i) => slotOf(b, i, layout))),
      { i: declared.length + extra.length - 1, span: block.span ?? 12 },
    ];
    if (quiet) return;
    const named = copy.kindNames[block.kind] ?? blockWords.kindNames[block.kind] ?? block.kind;
    toasts.push(copy.blockAddedLive(named));
  }

  /* MAKE A COMPONENT AND THE SHELF. A composed block is added like a picked one, so it is drawn on the
     page at once and written only by Done; `draft` is the one added block still awaiting Keep, Shelf or Throw away. */
  let making = $state(false);
  /* A "Make ..." LINE FROM SLASH (the palette): the composer opens on it and draws it at once. */
  let startLine = $state('');

  /* THE LINE IS READ ONCE AND TAKEN OUT OF THE ADDRESS, so Back and a reload never repeat it. A make goes to the composer;
     a change goes to the block in focus, or is held until the person opens the menu of the block they mean. */
  let entered = '';
  $effect(() => {
    const got = askedIn(route.url.search);
    if (!got || entered === route.url.href || !mayChange) return;
    entered = route.url.href;
    void goto(withoutEntry(route.url), { replaceState: true, noScroll: true, keepFocus: true });
    if (got.verb === 'make') {
      startLine = got.line;
      making = true;
      return;
    }
    const key = keyInFocus(document.activeElement);
    if (key !== null) return void window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, line: got.line } }));
    /* NO BLOCK IN FOCUS: THE LINE IS ABOUT THE PAGE ("move Bills up", "show only open ones"), and the page's ⋯ menu opens
       its Change sheet on it (`ChangePage.svelte`). Only where no menu took it is it held for a block's Change this. */
    const page = new CustomEvent(CHANGE_PAGE_EVENT, { detail: { line: got.line }, cancelable: true });
    if (!window.dispatchEvent(page)) return;
    holdLine(got.line);
    toasts.push(slashEntryWords.which);
  });
  let draft = $state<{ i: number; name: string; said: string; block: Declared } | null>(null);

  function drawn(c: Composed) {
    add(c.block as unknown as PageBlock, true);
    draft = { i: declared.length + extra.length - 1, name: c.name, said: c.said, block: c.block };
  }

  function keepDraft() {
    draft = null;
    toasts.push(composeWords.kept);
  }

  /* THROWN AWAY LEAVES NOTHING: the block and its place go, and the ones added after it close up. */
  function throwDraft() {
    const d = draft;
    if (!d) return;
    draft = null;
    extra = extra.filter((_, k) => k !== d.i - declared.length);
    arrangement.slots = (arrangement.slots ?? []).filter((s) => s.i !== d.i).map((s) => (s.i > d.i ? { ...s, i: s.i - 1 } : s));
    toasts.push(composeWords.thrown);
  }

  async function shelveDraft() {
    const d = draft;
    if (!d) return;
    const out = await navPrefs.shelve(d.name, d.block);
    toasts.push(out.from === 'refused' ? out.fix : shelfWords.saved(d.name), out.from === 'refused' ? { intent: 'warn' } : undefined);
  }

  /* A SHELF ITEM IS PLACED AS A COPY, over the list it names, which may be gone from this record. */
  function place(item: Shelved) {
    const list = listOf(item.block);
    if (list !== null && !REGISTERS[list]) return void toasts.push(shelfWords.gone, { intent: 'warn' });
    /* A JSON COPY, NOT `$state.snapshot`: a shelf item is a declaration the record keeps as JSON, and the clone
       `$state.snapshot` brings sits in the Svelte chunk every screen loads, which put the entry over its debt. */
    add(JSON.parse(JSON.stringify(item.block)) as PageBlock, true);
    toasts.push(shelfWords.placed(item.name));
  }

  async function unshelve(item: Shelved) {
    await navPrefs.unshelve(item.id);
    toasts.push(shelfWords.removed(item.name));
  }

  /* LEAVING THE MODE ENDS THE DRAFT: Cancel and Done both settle what was added. */
  $effect(() => {
    if (!arranging) draft = null;
  });

  /**
   * ONE write, one event batch, one undo, even for four moves.
   *
   * 02 §8 makes an `edit` one event row per changed FIELD, all sharing one `batch` ULID, and undo is a query over that
   * batch. Committing per drag would put four unrelated lines in the history for one act of tidying, and leave no single
   * thing to undo.
   *
   * DONE KEEPS A MOVE, A WIDTH OR A COLUMN AS THE PERSON'S OWN LOOK (`asLook`), and only what a look cannot say (a block
   * added or edited, a block moved under another heading) SETS THE DECLARATION, whole; either way the page is read again from the record. A refusal leaves the mode open with
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
    if (install) return keep(install, edit);
    const looked = !edit && extra.length === 0 ? await asLook() : null;
    if (looked !== null) return looked;
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
      if (reopen) reopen();
      else beginArrange();
    }
    return true;
  }

  /**
   * DONE AS THE PERSON'S OWN LOOK (`arrange-look.ts`): the order, widths and columns by block key, laid by the record over
   * the page as read, so a page an add-on wrote or added a block to is arranged too and keeps taking its updates. `null`
   * where a look cannot say the arrangement (a block moved under another heading, a block with no key of its own), which
   * goes the old way. Undo writes the look before, or retires this one, at any time the line is on screen.
   */
  async function asLook(): Promise<boolean | null> {
    /* A ROW'S PAGE WHOSE LOOK NAMES NO TEMPLATE has no declaration to lay one over that this page knows: the old way. */
    if (every && !page.look?.page) return null;
    saving = true;
    const [m, a, r] = await Promise.all([import('$lib/record/page-write.ts'), import('$lib/record/arrange-look.ts'), import('./recompose.ts')]);
    const keys = r.blockKeys(all);
    const laidOf = (i: number, span: number, area: Area | undefined) => ({
      key: keys[i] ?? '',
      span,
      ...(layout ? { area: area ?? 'main' } : {}),
      drawn: all[i]?.drawn !== false,
      kind: all[i]?.kind ?? '',
    });
    const laid = arrangement.body.map((b) => laidOf(b.block, b.span, b.area));
    const read = all.map((b, i) => slotOf(b, i, layout)).map((s) => laidOf(s.i, s.span, s.area));
    if (!a.byLook(laid, read)) {
      saving = false;
      return null;
    }
    const kept = new Set(arrangement.body.map((b) => b.block));
    const removed = read.filter((_, i) => !kept.has(i)).map((b) => b.key);
    const placed = arrangement.body.map((b) => ({ i: b.block, span: b.span, ...(b.area ? { area: b.area } : {}) }));
    const live = page.look ?? null;
    const out = await m.saveLayout(apiBase(), slug, live, laid, { drawn: declared.length, placed, seen: page.declared_version ?? null, removed }, undefined);
    saving = false;
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    arrangement.commit();
    await reread();
    arrangement.slots = null;
    const undo = 'undo' in out ? () => void putBack(out.undo) : () => void m.setBody(apiBase(), out.before, undefined, out.version).then(afterBack);
    toasts.push(every ? blockWords.arrangedEvery(every) : copy.arranged(page.title), { undo });
    return true;
  }

  /** Undo of a look: the person's look before it written again, or this one retired. */
  async function putBack(undo: LookUndo) {
    const back = 'write' in undo ? await writeLook(apiBase(), undo.write) : await retireLook(apiBase(), undo.retire);
    await afterBack(back.ok ? { from: 'written' } : { from: 'refused', fix: back.fix });
  }

  async function afterBack(back: { from: string; fix?: string }) {
    if (back.from !== 'written' && back.fix) toasts.push(back.fix, { intent: 'warn' });
    await reread();
  }

  /**
   * THE FIRST WRITE ON A PAGE NOT KEPT YET INSTALLS IT, laid out as arranged and with the edit in it, and Put back
   * retires it (`home-arrange.ts`). The shell is read again, so the screen reads the page it now holds before its preview.
   * The mode closes after an edit too, since the page it was arranging now has an address of its own to be arranged at.
   */
  async function keep(body: PageBody, edit: { i: number; patch: Patch; name: string } | null): Promise<boolean> {
    saving = true;
    const [m, h] = await Promise.all([import('$lib/record/page-write.ts'), import('./home-arrange.ts')]);
    const placed = arrangement.body.map((b) => ({
      i: b.block,
      span: b.span,
      ...(b.area ? { area: b.area } : {}),
      ...(edit && edit.i === b.block ? { edit: edit.patch } : {}),
    }));
    const laid = declared.length === body.blocks.length ? m.arrangedBody(body, placed, extra) : null;
    const out = laid ? await m.setBody(apiBase(), laid) : { from: 'refused' as const, fix: copy.arrangeMoved };
    saving = false;
    if (out.from !== 'written') {
      toasts.push(out.fix, { intent: 'warn' });
      return false;
    }
    arrangement.commit();
    await h.reboot();
    await reread();
    extra = [];
    arrangement.slots = null;
    toasts.push(edit ? blockWords.saved(edit.name) : copy.arranged(page.title), {
      undo: () =>
        void h.unkeep(apiBase(), body.page).then(async (back) => {
          if (!back.ok) toasts.push(back.fix, { intent: 'warn' });
          await h.reboot();
          await reread();
        }),
    });
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

  /**
   * THE THREE SHEETS ARRIVE WHEN THEY ARE OPENED, never with the page. Arranging is something an owner does now and
   * then, and the editor, the picker and Make a component carry block grammar, lists and composing that a page being
   * read never runs. Each is asked for the first time its sheet is wanted, and draws open when it lands.
   */
  let BlockEditor = $state<typeof BlockEditorView | null>(null);
  let AddBlock = $state<typeof AddBlockView | null>(null);
  let MakeComponent = $state<typeof MakeComponentView | null>(null);
  $effect(() => {
    if (editing !== null && BlockEditor === null) void import('./BlockEditor.svelte').then((m) => (BlockEditor = m.default));
  });
  $effect(() => {
    if (adding && AddBlock === null) void import('$lib/ui/AddBlock.svelte').then((m) => (AddBlock = m.default));
  });
  $effect(() => {
    if (making && MakeComponent === null) void import('./MakeComponent.svelte').then((m) => (MakeComponent = m.default));
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
  {#if draft}
    <span class="arrange-draft" role="status">{draft.said} {composeWords.draft}</span>
    <Button weight="primary" onclick={keepDraft}>{composeWords.keep}</Button>
    <Button weight="quiet" onclick={() => void shelveDraft()}>{shelfWords.save}</Button>
    <Button weight="bare" onclick={throwDraft}>{composeWords.away}</Button>
  {/if}
  <Button weight="bare" onclick={() => arrangement.cancel()}><Icon name="close" size="s" />{copy.arrangeCancel}</Button>
  <Button weight="primary" onclick={commitArrange}><Icon name="check" size="s" />{copy.arrangeDone}</Button>
{/if}

{#if bindTo && mayChange}
  <AddBlock
    bind:open={adding}
    blocks={declared}
    register={bindTo}
    onadd={add}
    {installed}
    shelf={navPrefs.shelf}
    onmake={() => (making = true)}
    onplace={place}
    onremove={(item) => void unshelve(item)}
  />
{/if}

{#if mayChange}
  <MakeComponent
    bind:open={making}
    {slug}
    current={bindTo}
    start={startLine}
    ondraft={(c) => {
      /* A DRAFT FROM SLASH ARRIVES OUTSIDE EDIT LAYOUT, so the mode begins first and the block is added once it is on. */
      if (!arranging) beginArrange();
      void tick().then(() => drawn(c));
    }}
    onmodel={async () => {
      arrangement.cancel();
      await reread();
    }}
  />
{/if}

{#if editing && mayChange}
  <BlockEditor
    bind:open={editorOpen, setEditorOpen}
    {slug}
    index={editing.slot.i}
    added={addedBody(editing.slot.i)}
    held={install && editing.slot.i < declared.length ? (install.blocks[editing.slot.i] ?? null) : null}
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
  /* THE ONE LINE OF CONTEXT the mode carries on a template: quiet, beside the controls it is about. */
  .arrange-every {
    align-self: center;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* THE DRAFT'S ONE LINE, quiet beside its three buttons. */
  .arrange-draft {
    align-self: center;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .bind-why {
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
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
