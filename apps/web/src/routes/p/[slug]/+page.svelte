<!--
  A declared page: many bound queries, arranged. A page is a ROW, not a file — which is what makes
  "the Money page" something a freelancer never sees and a studio does (06).

  One request per page load, never one per block. The record object IS the query engine and storage
  is in-process, so N block queries cost N in-thread SQLite calls and ZERO network hops. Fanning out
  per block would be N round trips (22 §5).

  Per-block error boundaries: six queries, six independent failures, and one broken query never
  blanks a page. A block-level failure announces with `role="status"`, not `role="alert"` — ten
  simultaneous assertive announcements is a denial of service on a screen-reader user (19 §6).
-->
<script lang="ts">
  import { titleOf } from '$lib/title.ts';
  import { KINDS, holeLabel, isKind, type Row, type RowRef } from 'braindog-render';
  import { Block, Degraded, Markdown, Table } from 'braindog-render/svelte';
  import '$lib/blocks-charts.css';
  import { goto } from '$app/navigation';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import { covered, silenced, typing } from '$lib/a11y/keys.svelte.ts';
  import { NOW, REGISTERS, heldBy, homeCurrency, hueOf, iconFor, page as readPage, pages as readPages, values, type BlockResult } from '$lib/record/api.ts';
  import { symbolText } from '$lib/record/money.ts';
  import { draw, saidPlainly } from '$lib/record/blocks.ts';
  import { registerHref } from '$lib/record/where.ts';
  import type { PageBlock } from '$lib/record/schema.ts';
  import { PAGES } from '$lib/record/data.ts';
  import { dogName, dogText, saveDog, type DogPage } from '$lib/dog/source.ts';
  import PageHead from '$lib/ui/PageHead.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Empty from '$lib/ui/Empty.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import BlockBar from '$lib/ui/BlockBar.svelte';
  import AddBlock from '$lib/ui/AddBlock.svelte';
  import Actions from './Actions.svelte';
  import Reporting from './Reporting.svelte';
  import { words as actionWords } from '$lib/record/actions.ts';
  import { Arrangement } from '$lib/record/arrange.svelte.ts';
  import { COLUMNS, dropIndex, spanOf as declaredSpan } from '$lib/record/arrange.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { untrack } from 'svelte';
  import { pageReader, resolverOf, type LiveBlock, type LivePageDecl, type Opened } from '$lib/record/page-live.ts';
  import ActionRows from './ActionRows.svelte';
  import { closed, drew, opened } from '../../../lib/ui/screen.svelte.ts';

  const slug = $derived(route.params.slug ?? '');
  const showSource = $derived(route.url.searchParams.get('src') === '1');

  /**
   * WHERE THE PAGE CAME FROM: the record's `page` answer, the sample when there is no record here, the
   * record saying it has no such page, or the record's own sentence. Nothing draws until it answers.
   */
  let got = $state<Opened | null>(null);
  let reader: ReturnType<typeof pageReader> | null = null;

  async function readLive(asked: string) {
    const at = opened();
    got = null;
    reader ??= pageReader(location.origin);
    const out = await reader.read(asked);
    /* An answer for a page somebody has already left draws nothing. */
    if ((route.params.slug ?? '') !== asked) return closed(true, at);
    got = out;
    closed(out.from !== 'refused', at);
  }

  $effect(() => {
    const asked = slug;
    untrack(() => void readLive(asked));
  });

  const live = $derived(got?.from === 'live' ? got : null);

  /**
   * ON A LIVE PAGE A MOVED CARD AND A TICKED TASK ARE WRITES to the row each came from, named by the `ref` the page
   * answer carried. A refusal is the record's own sentence. A write that landed, or one that met a row changed first,
   * reads the page again without blanking it, so the card's mark goes once the row agrees with it. The sample keeps its
   * toasts.
   */
  async function reread() {
    const asked = slug;
    if (!reader) return;
    const out = await reader.read(asked);
    if ((route.params.slug ?? '') === asked && out.from === 'live') got = out;
  }

  async function writeRow(
    ref: RowRef | undefined,
    change: (m: typeof import('$lib/record/page-write.ts'), ref: RowRef, decl: import('$lib/record/page-write.ts').Declared | null) => Record<string, unknown> | null,
    title: string,
  ) {
    if (!ref) return void toasts.push(copy.pageRowUnknown, { intent: 'warn' });
    const m = await import('$lib/record/page-write.ts');
    /* THE REGISTER AS THE RECORD DECLARES IT, so a list a pack brought is ticked and moved by its own states. */
    const patch = change(m, ref, await m.schemaOf(location.origin, ref.register));
    if (!patch) return void toasts.push(copy.pageRowNoState, { intent: 'warn' });
    const out = await m.updateRow(location.origin, ref, patch, title);
    if (out.from !== 'written') toasts.push(out.fix, { intent: 'warn' });
    if (out.from === 'written' || out.from === 'conflict') await reread();
  }

  function moveCard(block: LiveBlock, row: Row, to: string) {
    const title = row.cells[1] ?? copy.cardFallback;
    if (!live) return void toasts.push(copy.cardMovedTo(title, to), { intent: 'warn' });
    const field = block.columns[0]?.field;
    void writeRow(row.ref, (m, ref, decl) => (field ? m.movePatch(ref, field, to, decl) : null), title);
  }

  function tickTask(row: Row, done: boolean) {
    const title = row.cells[0] ?? copy.cardFallback;
    if (!live) return void toasts.push(copy.taskTicked(title, done), { intent: 'warn' });
    void writeRow(row.ref, (m, ref, decl) => m.tickPatch(ref, done, decl), title);
  }
  /* A LIVE PAGE IS THE RECORD'S BLOCKS AND NOTHING ELSE; the sample is read only when there is no record. */
  const result = $derived<{ page: LivePageDecl; blocks: LiveBlock[] } | undefined>(
    got?.from === 'live' ? got.page : got?.from === 'sample' ? (readPage(slug) ?? undefined) : undefined,
  );
  const sampleValues = $derived<Record<string, string>>(got?.from === 'sample' ? values() : {});

  /* A `{{path}}` IS ANSWERED BY THE RECORD on the block's `values`, or by the sample's figures when
     there is no record; a missing value is `—`. `now` is the clock the rows were read against: the
     reader's for a live page, the sample's own `NOW` otherwise, so `{{ago:}}` agrees with the dates
     beside it. `hole` is what makes a hole pressable; this screen owns what pressing one does. On a
     live record a value the record cannot answer is not pressable: nobody can supply a declared
     figure from this screen, so it is marked and left alone. */
  const pressHole = (path: string | null) =>
    toasts.push(
      copy.notWritten(
        path ? `${holeLabel(path)} would be opened for whoever can supply it` : 'The unknown would be opened for whoever can supply it',
      ),
      { intent: 'warn' },
    );
  /* A FIGURE IN A SENTENCE READS AS MONEY, `£7,200.00` and not `GBP 7,200.00`, as the cells beside it do. */
  const said = (text: string | null): string | null => (text === null ? null : symbolText(text, homeCurrency()));
  const optsFor = (block: LiveBlock) => ({
    resolve: live ? (path: string) => said(resolverOf(block.values)(path)) : (path: string) => said(sampleValues[path] ?? null),
    now: live ? live.now : NOW,
    ...(live ? {} : { hole: pressHole }),
    /* A forecast's knobs and its readout: arithmetic over the walk already on the page, kept in memory. */
    scenario: true,
  });

  /**
   * The declared span, clamped to what the KIND can survive.
   *
   * A declaration arrives from a pack, and a pack is a thing a stranger wrote — so a `table` that
   * says `span: 2` is a table somebody will read as broken. The renderer's own table knows the
   * floor per kind (13 §4.1's three width classes), and the page honours it rather than drawing
   * eight columns in a sixth of a page. The ARRANGE control refuses below the floor instead of
   * clamping, because a control that silently corrects you teaches nothing; this clamp is for
   * declarations that never went through that control.
   */
  const spanOf = (block: BlockResult) => declaredSpan(block.kind, block.span, block.columns.length);

  /* ── arranging ─────────────────────────────────────────────────────────────
     A MODE, not an always-on affordance. Drag handles on a page you are reading are noise, and an
     accidental drag that rewrites a row is the kind of edit nobody can attribute later. */
  const arrangement = new Arrangement();
  const arranging = $derived(arrangement.editing);

  /**
   * The block's predicate, minus the clause that restates the page.
   *
   * A project page filters every block by the same project, so every block header repeated `thing
   * is Kiln` under a heading on the page called Kiln. It is the one clause the reader is certainly
   * not missing, and it was the longest.
   */
  /**
   * The predicate a reader sees, MINUS the clause that names the page they are already on.
   *
   * "thing is Kiln" under a heading on the Kiln page is the one fact the reader cannot be missing,
   * and the rest of the predicate has to stay or a block of four rows reads as the whole register.
   *
   * The clause is now identified rather than guessed. This used to drop any clause whose text ENDED
   * with the page title, which is a string heuristic standing in for a fact the declaration did not
   * carry — and it was the admission that the name should never have been typed into the predicate.
   * A resolved page knows its own parameter, so the comparison is exact.
   */
  /**
   * WHERE THE BLOCK'S ROWS LIVE, at the block's own predicate.
   *
   * The provenance link and the `o` key both went to `/r/<register>` bare. So a block headed
   * "Money", printing `Filter state is open, direction is owed to me` directly above the link, sent
   * you to all 214 obligations — the reader is shown a filter, told the list is a slice, and handed
   * a door to a different set of rows. The register reads exactly these chips from the URL and the
   * metric tiles have used the same builder for months; the page blocks were the surface that never
   * asked for it.
   *
   * `registerHref` returns the bare register when it could not read the predicate, which is the
   * honest answer: a URL narrowed by the half of a sentence that parsed is a list that looks
   * filtered and is not.
   */
  const openHref = (block: { register?: string | undefined; where?: string | undefined }): string | null =>
    block.register ? registerHref(block.register, block.where) : null;

  const param = $derived(result?.page.param);
  const whereOf = (block: { register?: string | undefined; where?: string | undefined }): string =>
    saidPlainly(
      block.register ?? '',
      (block.where ?? '')
        .split(',')
        .map((c) => c.trim())
        /* The page's own subject, in either spelling: by name through a `thing` ref, or by spoken id
           through an agent run's `project`. Printing either says the page's name back to it. */
        .filter(
          (c) =>
            c &&
            !(param && [`thing is ${param.title}`, `project is ${param.register}#${param.seq}`].some((s) => s.toLowerCase() === c.toLowerCase())),
        )
        .join(', '),
    );

  /**
   * The blocks in the order and at the widths currently in force, each carrying the index it had in
   * the declaration.
   *
   * `slot.span` is authoritative whether or not the mode is open — it falls back to the declared
   * span when there is no arrangement. The template read `arranging ? slot.span : spanOf(block)`
   * once, which meant Done kept the ORDER and silently threw away every width: the layout you
   * confirmed was not the layout you got.
   */
  const laid = $derived.by(() => {
    const blocks = all;
    const slots = arrangement.slots ?? blocks.map((b, i) => ({ i, span: spanOf(b) }));
    return slots
      .map((slot) => ({ slot, block: blocks[slot.i] }))
      .filter((x): x is { slot: { i: number; span: number }; block: LiveBlock } => Boolean(x.block));
  });

  function beginArrange() {
    arrangement.begin(all.map((b, i) => ({ i, span: spanOf(b) })));
  }

  /**
   * A block added here is resolved through the SAME page read as a declared one.
   *
   * `readPage` answers per block against live rows, so a seeded block gets real data the moment it
   * exists — which is what makes "already bound and already drawing" (21 §3.3) true rather than a
   * promise the picker makes and the page breaks.
   */
  function add(block: PageBlock) {
    extra = [...extra, block];
    arrangement.slots = [
      ...(arrangement.slots ?? (result?.blocks ?? []).map((b, i) => ({ i, span: spanOf(b) }))),
      { i: (result?.blocks.length ?? 0) + extra.length - 1, span: block.span ?? 12 },
    ];
    const named = copy.kindNames[block.kind] ?? block.kind;
    toasts.push(live ? copy.blockAddedLive(named) : copy.blockAdded(named), { intent: live ? undefined : 'warn' });
  }

  /**
   * ONE write, one event batch, one undo — even for four moves.
   *
   * 02 §8 makes an `edit` one event row per changed FIELD, all sharing one `batch` ULID, and undo is
   * a query over that batch. Committing per drag would put four unrelated lines in the audit log
   * for one act of tidying, and leave no single thing to undo.
   */
  let saving = false;
  async function commitArrange() {
    if (!arrangement.dirty) {
      arrangement.cancel();
      toasts.push(copy.arrangeNothing);
      return;
    }
    /* ON A LIVE PAGE DONE SETS THE DECLARATION, whole, and the page is read again from the record. A refusal leaves the
       mode open with the draft in it, so Cancel still means cancel. Undo sets the body that was there before. */
    if (live) {
      if (saving) return;
      saving = true;
      const title = result?.page.title ?? slug;
      const m = await import('$lib/record/page-write.ts');
      const placed = arrangement.body.map((b) => ({ i: b.block, span: b.span }));
      const out = await m.saveArrangement(location.origin, slug, result?.blocks.length ?? 0, placed, extra);
      saving = false;
      if (out.from !== 'written') return void toasts.push(out.fix, { intent: 'warn' });
      arrangement.commit();
      await reread();
      extra = [];
      arrangement.slots = null;
      const before = out.before;
      toasts.push(copy.arranged(title), {
        undo: () =>
          void m.setBody(location.origin, before).then(async (back) => {
            if (back.from !== 'written') toasts.push(back.fix, { intent: 'warn' });
            await reread();
          }),
      });
      return;
    }
    const undo = arrangement.commit();
    /* The layout STAYS. On a live page the branch above set the declaration; on the sample the
       toast says plainly that nothing was written, because a mock that pretends to have saved is a
       mock that will be believed. */
    toasts.push(copy.arrangedNotSaved(result?.page.title ?? slug), { intent: 'warn', undo });
  }

  /** Held while a handle is down, so the drop target knows what is moving. */
  let dragging = $state<number | null>(null);

  /* WHERE IT WILL LAND. A drag with no target shown is a drag you have to complete to find out
     what it did, and then undo. The block under the pointer takes an accent edge on the side the
     block will arrive, so the answer is on screen before the reader lets go.

     Which edge depends on the block's own width, not on a fixed axis. A full-width block stacks,
     so top and bottom are what "before" and "after" mean and the pointer's Y decides. A block
     sharing its row reads left to right, so X decides. Using one axis for both puts the line on
     the short edge of half the blocks on the page. */
  let over = $state<{ at: number; edge: 'before' | 'after' } | null>(null);

  function trackDrop(e: DragEvent, at: number, span: number) {
    if (!arranging || dragging === null) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const stacked = span >= COLUMNS;
    const past = stacked ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    over = { at, edge: past ? 'after' : 'before' };
  }

  function drop() {
    if (dragging !== null && over) arrangement.move(dragging, dropIndex(dragging, over.at, over.edge));
    dragging = null;
    over = null;
  }

  let adding = $state(false);

  /**
   * The block cursor, and the five page-scope keys the keymap has always advertised.
   *
   * `j k`, `↵ Esc`, `o`, `y` and `⇧E` are registered in `keys.svelte.ts` and printed on `?`, and
   * not one of them did anything — the `<Kbd>` chips beside the block bars were advertisements for
   * bindings that did not exist. A keymap that lists a key which does nothing is worse than one
   * that omits it: the reader tries it, nothing happens, and now they distrust the whole sheet.
   *
   * It starts at -1, meaning NOWHERE. A cursor drawn on the first block before anybody has pressed
   * a key is a selection state nobody chose, and every page opened with a red band down its first
   * figure.
   */
  let cursor = $state(-1);

  function onkeydown(e: KeyboardEvent) {
    /* THE ONE TEST FOR WHETHER SOMEBODY IS TYPING, rather than a narrower copy of it. This read
       INPUT and TEXTAREA only, so a bare key fired over an open select and inside a contenteditable
       block. `typing()` covers both, and it is the test `keys.svelte.ts` calls the only one. */
    if (typing()) return;
    if (e.metaKey || e.ctrlKey) return;

    /* AND NOT WHILE SOMETHING IS OPEN OVER THE PAGE. See `covered`: this is the handler the defect
       was found on, and it was one of six with the same hole. */
    if (covered()) return;

    /* ⇧E toggles the declaration. Shift, not a bare `e`, because bare `e` means edit-in-place
       inside a grid and a key's meaning must be a function of the object in focus rather than of
       the page you happen to be on. */
    if (e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      void goto(`?src=${showSource ? '0' : '1'}`, { replaceState: true, noScroll: true });
      return;
    }
    if (e.altKey || e.shiftKey || showSource || arranging) return;
    if (silenced(e)) return;

    const blocks = laid;
    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(cursor + 1, blocks.length - 1);
      focusBlock();
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(cursor - 1, 0);
      focusBlock();
    } else if (e.key === 'o') {
      const held = blocks[cursor]?.block;
      const to = held ? openHref(held) : null;
      if (to) {
        e.preventDefault();
        void goto(to);
      }
    } else if (e.key === 'y') {
      const slotIndex = blocks[cursor]?.slot.i;
      if (slotIndex !== undefined) {
        e.preventDefault();
        void copyBlockLink(slotIndex);
      }
    } else if (e.key === 'Enter') {
      /* ENTER THE BLOCK: move real focus inside it, so the block's own keys take over.
         
         This is the whole reason the two altitudes exist. `j`/`k` walk blocks and the letters are
         bare; once focus is inside a `role="grid"`, `j`/`k` walk ROWS and the same bare letters are
         the grid's. WCAG 2.1.4's focus exception is what makes bare single letters legal at all, and
         it is satisfied by focus actually being somewhere rather than by a variable saying it is. */
      const held = blocks[cursor];
      if (!held) return;
      e.preventDefault();
      enter(held.slot.i);
    } else if (e.key === 'Escape') {
      /* LEAVE IT. Focus returns to the document and the cursor stays where it was, so Escape is a
         step back out rather than a reset — a mode you leave by losing your place is a mode people
         stop entering. */
      const inside = document.activeElement;
      if (inside instanceof HTMLElement && inside !== document.body) {
        e.preventDefault();
        inside.blur();
      }
    }
  }

  /**
   * The first thing inside a block that can take focus.
   *
   * A `table` block's region is `tabindex="0"` and is the right target; a `bar`'s hole row is a
   * button; a `note` has nothing focusable at all and the block is simply scrolled to, because
   * moving focus to a paragraph and announcing it is worse than not moving.
   */
  function enter(slotIndex: number) {
    const section = document.getElementById(`b-${slotIndex + 1}`);
    /* The block's BODY, not its bar. The bar carries a link to the register, which is the first
       focusable descendant of the section — so an unscoped query put `↵` on "open the register",
       which is the `o` key's job and the opposite of entering. */
    const body = section?.querySelector<HTMLElement>('.block, .table-region');
    const target =
      body?.matches('[tabindex]:not([tabindex="-1"])') === true
        ? body
        : (body?.querySelector<HTMLElement>(
            '[role="grid"], a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
          ) ?? null);
    if (target) target.focus();
    else section?.scrollIntoView({ block: 'nearest' });
  }

  /** Scrolls the cursor into view under the sticky head. `.block-slot` already carries the margin. */
  function focusBlock() {
    const slot = laid[cursor]?.slot.i;
    if (slot !== undefined) document.getElementById(`b-${slot + 1}`)?.scrollIntoView({ block: 'nearest' });
  }

  async function copyBlockLink(slotIndex: number) {
    const url = `${route.url.origin}${route.url.pathname}#b-${slotIndex + 1}`;
    try {
      await navigator.clipboard.writeText(url);
      toasts.push(copy.copied(copy.blockLink));
    } catch {
      toasts.push(copy.copyRefused, { intent: 'warn' });
    }
  }

  /** The register the page is mostly about — what a new block binds to before you narrow it. */
  const primary = $derived(result?.blocks.find((b) => b.register)?.register ?? 'obligations');

  /** Blocks added in this session. They live beside the declared ones and index past them. */
  let extra = $state<PageBlock[]>([]);

  /** Declared, then added. One list, so ordering and spans do not care which is which. */
  const all = $derived([...(result?.blocks ?? []), ...extra.map((b) => resolveExtra(b))]);

  /** An added block, run through the page read so it carries rows rather than a declaration. */
  function resolveExtra(block: PageBlock): LiveBlock {
    const template = result?.blocks.find((b) => b.register === block.source?.replace('register.', ''));
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

  /**
   * THE DECLARATION THE RECORD HOLDS, AND THE APP'S ONLY WHERE THERE IS NO RECORD.
   *
   * This read `PAGES` — the web app's own built-in declarations — for every page, so somebody
   * opening "How this is built" on their own record was shown the demo's copy of it. A page the
   * record has and the app does not fell through to the resolved answer; a page they had both of
   * printed ours. Either way the screen labelled "source" was not the source of the page they have.
   *
   * SO A LIVE PAGE PRINTS THE RECORD'S ANSWER, which carries the declaration's own keys on the page
   * and on every block — `cells`, `columns`, `order`, `target`, `body` and `authored` included,
   * which is why printing `result.page` alone once dropped them.
   *
   * A PER-ROW PAGE IS STILL THE RECORD'S TEMPLATE. The record answers one page per row of the
   * register the template walks, so `for:` comes back with it and the `{{field}}`s arrive filled
   * with the row this page is about. That is the record's own declaration, read from the record;
   * the app's copy of the same template is not, and this no longer reaches for it.
   *
   * THE FALLBACK IS FOR A RECORD THAT GENUINELY HAS NONE: the sample, where `PAGES` IS the record,
   * and a live answer with nothing declared on it.
   */
  const recorded = $derived<DogPage | undefined>(
    live && live.page.blocks.length ? ({ ...live.page.page, blocks: live.page.blocks } as unknown as DogPage) : undefined,
  );
  const source = $derived<DogPage | undefined>(
    recorded ?? (result ? ((result.page.param ? PAGES[templateOf(result.page)] : PAGES[result.page.page]) ?? { ...result.page, blocks: result.blocks }) : undefined),
  );

  /** Which declaration a resolved page came from: the one template whose expansion produced it. */
  function templateOf(page: LivePageDecl): string {
    for (const [key, decl] of Object.entries(PAGES))
      if (decl.for && decl.for.register === page.param?.register) return key;
    return page.page;
  }

  const declaration = $derived(source ? dogText(source) : '');

  /** One page, one file, named as its first line names it. */
  const dogFile = $derived(source ? dogName(source.page) : '');

  /** The same bytes the screen is showing, as a file somebody can keep, diff, send and edit. */
  function saveSource() {
    saveDog(dogFile, declaration);
    toasts.push(copy.exported(dogFile), { intent: 'good' });
  }


  /**
   * DRAWN ONCE THE READ HAS ANSWERED, live, the sample, or a page the record does not have. The read is
   * bracketed by `opened()` and `closed()`, so a call still out takes `data-screen` away whatever this
   * says; `Empty` says `refused` for the state it draws.
   */
  $effect(() => {
    if (got && got.from !== 'refused') drew('ready');
  });
</script>

<svelte:head><title>{titleOf(result?.page?.title)}</title></svelte:head>

<svelte:window {onkeydown} />

{#if got === null}
  <!-- Bars until the record answers: a sample page drawn and then swapped is two pages. -->
  <Waiting head />
{:else if got.from === 'refused'}
  <div class="page said">
    <Empty kind="error" heading title={got.fix}>
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else if !result}
  <div class="page said">
    <!-- A URL NAMING SOMETHING THIS RECORD DOES NOT HAVE IS A REFUSAL, and the record already has
         the sentence for it. Nothing failed, so there is no request id to quote (`50 §13 D11`), and
         no filter ran, so "nothing matched" is about something that did not happen. It names the
         thing, says it is not here, and lists what is — `10 §7`'s fourth rule: the refusal is the
         teacher. -->
    <Empty
      kind="error"
      heading
      title={copy.noSuch('page', slug)}
      body={copy.theseExist('Pages', got.from === 'missing' ? got.titles : Object.values(readPages()).map((p) => p.title))}
    >
      {#snippet actions()}<Button href="/">{copy.home}</Button>{/snippet}
    </Empty>
  </div>
{:else}
  <!-- `define="page"`: the rail says "1 suggested page" on every screen and this is the first place
       somebody is looking at one. The clause carries `block` and `row` with it, which is `19 §642`'s
       own wording and deliberate — the two nouns it leans on are the two this product defines
       either side of it. -->
  <PageHead
    icon={iconFor(result.page.icon, 'doc')}
    hue={hueOf(result.page.identity)}
    kicker={result.page.nav?.section}
    title={result.page.title}
    define="page"
  >
    {#snippet actions()}
      {#if arranging}
        <Button weight="quiet" onclick={() => (adding = true)}>
          <Icon name="plus" size="s" />
          {copy.addBlock}
        </Button>
        <Button weight="bare" onclick={() => arrangement.cancel()}><Icon name="close" size="s" />{copy.arrangeCancel}</Button>
        <Button weight="primary" onclick={commitArrange}><Icon name="check" size="s" />{copy.arrangeDone}</Button>
      {:else}
        <!-- AUTHORING IS A DESKTOP SURFACE (13 §10), and this is the one that stayed. `Arrange` is
             hidden below 900px and the filter beside the source link is hidden with a comment
             calling it "a desktop affordance for the same reason the source link beside it is" —
             the source link itself never was. On four project pages it is the ONLY header control a
             phone gets, and what it opens is a 1,129px-wide YAML declaration in a 356px box that you
             drag sideways to read, line by line, with lines cut mid-token. -->
        <span class="source-slot">
          <Button weight="bare" href="?src={showSource ? '0' : '1'}">
            <Icon name="code" size="s" />
            <!-- `How this page is built` AND IT WAS `Source`. It sits top right on every page beside
                 `Edit layout`, and `Source` is a developer's word for the thing: a reader who does
                 not write code reads it as an origin or a supplier. Two literals in markup were
                 also the last two on this screen, so they move to `copy.ts` with everything else. -->
            {showSource ? copy.pageBack : copy.pageSource}
          </Button>
        </span>
        <!-- ARRANGING IS A DESKTOP SURFACE. 13 §10: "Authoring: read and approve, do not author. The
             page builder and pack builder are desktop surfaces." A drag-to-reorder mode on a phone
             is a mode where every gesture competes with the scroll, and the button is absent rather
             than disabled — a control that exists and refuses is worse than one that does not. -->
        {#if !showSource}
          <span class="arrange-slot">
            <Button weight="quiet" onclick={beginArrange}>
              <Icon name="grid" size="s" />
              {copy.arrange}
            </Button>
          </span>
        {/if}
      {/if}
    {/snippet}
  </PageHead>

  <!-- A LIST while arranging, and nothing while reading. The blocks become a reorderable list only
       in the mode where they are reorderable; announcing "list, 5 items" to somebody reading a page
       is describing the furniture. -->
  <div class="page" role={arranging ? 'list' : undefined}>
    {#if showSource}
      <!-- The declaration as diffable text. A page is a row, so this is the row (19 §2). -->
      <!-- `tabindex="0"`: it is a long scrolling code block, and a scrolling box a keyboard cannot
           focus is a box a keyboard cannot read. Named, so tabbing into it says what it is. -->
      <!-- THE SOURCE IS A FILE, not a box to read. A format nobody can hold is a viewer: this text
           could not be saved, diffed, sent to somebody or edited and applied, so the one thing a
           person could do with the page they wrote was look at it. The file is named as the
           declaration's own first line names it, and it is the same bytes the block below shows. -->
      <div class="source-file">
        <Button weight="quiet" onclick={saveSource}>
          <Icon name="download" size="s" />
          {copy.pageSourceSave(dogFile)}
        </Button>
      </div>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="source" tabindex="0" aria-label={copy.declarationOf(result.page.title)}><code
          >{declaration}</code></pre>
    {:else}
      {#each laid as { slot, block }, at (slot.i)}
        <!-- `drawn: false` means the server evaluated `when:` and said no. A page that shows a
             warning that does not apply teaches people to ignore warnings (06 §1). -->
        {#if block.drawn}
          <!-- WHAT THE BLOCK'S REGISTER HOLDS, when it holds nothing yet. 19 §6 names five empty
               states and says collapsing them into one is the failure; a filter that matched nothing
               and a register with nothing in it are different facts, and the second is the one
               somebody can act on. -->
          <!-- On a live page the register's size is known only when the block reads all of it. -->
          {@const held = block.register && !(live && block.where) ? REGISTERS[block.register] : undefined}
          {@const drawn = draw(
            block,
            held
              ? {
                  rows: live ? block.total : heldBy(block.register!),
                  name: held.name,
                  ...(held.holds ? { holds: held.holds } : {}),
                  /* WHERE THE FIRST ROW WOULD GO, and `19 §6` says the action for this state is
                     **Add one** rather than "go and look". `?new=1` opens the list's own create
                     form, so the button lands on the field somebody is about to type into instead
                     of on a list of nothing with a second button on it.

                     The block's own filter is deliberately NOT carried: the list is empty, and
                     narrowing an empty list is the last thing anybody needs. */
                  add: { href: `/r/${block.register}?new=1`, label: copy.addOne },
                }
              : undefined,
          )}
          <!-- A `div` that takes `region` or `listitem`, and NOT a `<section>`. A section is already
               a region landmark once it is named, and ARIA does not let one be a `listitem` — so
               while arranging, every block on the page carried a role its element could not have.
               `div` + an explicit role says the same thing in both modes and, unlike swapping the
               tag, does not tear the node down and drop focus when the mode changes. -->
          <div
            class="block-slot"
            id="b-{slot.i + 1}"
            aria-labelledby="h-{slot.i + 1}"
            style="--span:{slot.span}"
            data-arranging={arranging ? '' : undefined}
            data-cursor={!arranging && !showSource && at === cursor ? '' : undefined}
            role={arranging ? 'listitem' : 'region'}
            data-dragging={dragging === at ? '' : undefined}
            data-drop={over && over.at === at && dragging !== at ? over.edge : undefined}
            data-stacked={slot.span >= COLUMNS ? '' : undefined}
            draggable={arranging}
            ondragstart={() => (dragging = at)}
            ondragend={() => ((dragging = null), (over = null))}
            ondragover={(e) => trackDrop(e, at, slot.span)}
            ondrop={(e) => {
              e.preventDefault();
              drop();
            }}
            onkeydown={(e) => {
              /* `⌥↑` / `⌥↓` — WCAG 2.5.7's single-pointer alternative, and it calls the same
                 `move` the drag calls rather than re-implementing it.
                 
                 No `tabindex` on the section: keydown BUBBLES from whichever control inside it has
                 focus — the handle, a width button, Move up. A listitem that is itself a tab stop
                 puts a stop in the sequence that does nothing when you land on it. */
              if (!arranging || !e.altKey) return;
              if (e.key === 'ArrowUp') { e.preventDefault(); arrangement.move(at, at - 1); }
              if (e.key === 'ArrowDown') { e.preventDefault(); arrangement.move(at, at + 1); }
            }}
          >
            {#if arranging}
              <BlockBar
                kind={block.kind}
                span={slot.span}
                columns={block.columns.length}
                {at}
                count={laid.length}
                onmove={(to) => arrangement.move(at, to)}
                onspan={(span) => arrangement.setSpan(at, span)}
                onremove={() => arrangement.remove(at)}
              />
            {/if}
            <header class="block-bar">
              <!-- A BLOCK WITH NO AUTHORED `heading:` PRINTED ITS DIALECT ID: `spec`, `chips`, `gauge`,
                   `params`, `tree`. `kindNames` exists for this and says why in its own header — an id is
                   what an agent writes into a declaration, a name is what a person reads — and the two
                   screens where a READER rather than an author is looking were the two that skipped it. -->
              <h2 class="block-name" id="h-{slot.i + 1}">{block.heading ?? copy.kindNames[block.kind] ?? block.kind}</h2>
              {#if block.register}
                <!-- THE REGISTER'S NAME, not its id. This line is provenance a person reads, and
                     it was printing `obligations` where the rest of the product says Obligations —
                     the data model's spelling, on every block, on every page.

                     The predicate stays, because without it a reader has no way to know the list is
                     filtered and may take a block of four rows for the whole register. But the
                     clause that names the page you are already on is dropped: "thing is Kiln" under
                     a heading on the Kiln page is the one fact the reader cannot be missing. -->
                <a class="block-source tap" href={openHref(block) ?? `/r/${block.register}`} title={whereOf(block) || undefined}>
                  {REGISTERS[block.register]?.name ?? block.register}
                  <!-- AND IT SAYS THAT IT IS A FILTER. `/v/<view>` labels the identical string
                       `FILTER`, so the word existed and the page blocks did not use it — leaving an
                       unlabelled clause of machine grammar under a heading, which a reader can only
                       take for part of the title. -->
                  <!-- AS A GLYPH, AND THE CLAUSE IS STILL THERE (DESIGN-SYSTEM APPENDIX C5). Printed in full it
                       read as a debug line and pushed a two-word heading onto two lines; the filter glyph
                       says the list is narrowed, the tooltip and a screen reader get the whole clause. -->
                  {#if whereOf(block)}
                    <Icon name="filter" size="s" />
                    <span class="block-where"><span class="block-where-lead">{copy.filter}</span> {whereOf(block)}</span>
                  {/if}
                </a>
              {/if}
            </header>

            <!-- Never hidden and never centred: the page's shape is information, and a page that
                 silently shrinks teaches that blocks come and go (19 §6). ONE surface for all
                 sixteen kinds, so "nothing matched" and "this block is broken" are told apart. -->
            {#if block.cannot}
              <p class="block-cannot">{block.cannot}</p>
            {:else if block.actions?.length && !block.refusals.length}
              <ActionRows rows={block.actions} now={live?.now ?? NOW} />
            {:else if drawn.refusal}
              {@const act = drawn.refusal.action}
              <Empty
                compact
                kind={drawn.refusal.kind}
                title={drawn.refusal.title}
                body={drawn.refusal.body}
                lines={drawn.refusal.lines}
              >
                {#snippet actions()}
                  {#if act}<Button href={act.href}>{act.label}</Button>{/if}
                {/snippet}
              </Empty>
            {:else if block.kind === 'table'}
              <Table columns={block.columns} rows={block.rows} total={block.total} label={block.heading} />
            {:else}
              {#each drawn.segments as segment}
                <!-- A FIGURE IS A DOOR, and the address is the metric's own: `hrefFor` derives it
                     from the same predicate the figure is computed over, so a tile and the list it
                     opens cannot disagree. -->
                <!--
                  THE TWO PRIMITIVES A READER CAN CHANGE, GIVEN SOMEWHERE TO PUT THE ANSWER.

                  A friction pass ranked both: a board with fourteen cards across four columns and
                  no way to move one was fourth of ten, and a checkbox drawn beside a task that was
                  an `<img>` was fifth. Both had the same cause, one layer down: the primitive
                  refuses to draw an interactive control unless the host hands it a callback, and
                  no host ever did. So the capability was written, correct, and unreachable.

                  THE TOAST IS THE BACKUP AND THE MARK ON THE CARD IS THE ANSWER, which is how
                  `archive` works on the register list. Nothing is written: the record is not behind
                  this screen yet, and both primitives say so on the thing that moved rather than
                  only in a message at the other end of the screen.
                -->
                {#if segment.type === 'block'}<Block
                    block={segment}
                    opts={{ ...optsFor(block), cellHref: (i: number) => block.metrics?.[i]?.href ?? null }}
                    onmove={(row, to) => moveCard(block, row, to)}
                    ontick={(row, done) => tickTask(row, done)}
                  />{:else if segment.type === 'degraded'}<Degraded {segment} />{:else if segment.type === 'markdown'}<div class="document"><Markdown {segment} /></div>{/if}
              {/each}
            {/if}

            <!--
              AND IT SAYS THAT IT IS A SLICE.

              `limit:` cuts the rows a block draws and nothing rendered ever admitted it. Six blocks
              in the seed are cut today — `/p/marlow-co`'s Money shows 8 of that client's 12
              obligations, `/p/estate`'s timeline 8 of 11, `/p/work`'s steps 5 of 8 — each under a
              heading that reads as the complete answer to the question it asks. Invisible at nine
              rows and a lie at four hundred.

              ONE LINE FOR ALL SIXTEEN KINDS, and not the `table` primitive's own `cap` prop: four of
              the six cut blocks are `timeline`, `steps` and `spec`, so a fix inside `Table` would
              have covered a third of them and left the rest silent in a way that looks deliberate.

              IT IS A `status`, NOT AN ASIDE. The count changes when the rows do, and somebody who
              cannot see the list end short is exactly who needs to be told it did.
            -->
            <!-- THE SCHEDULED ACTIONS THIS PROJECT RUNS ON, under the agents pack's own "Runs on" heading and
                 above its keys, tools and skills. Not while arranging: a list that fetches is not a block to move. -->
            {#if block.kind === 'section' && block.heading === actionWords.runsOn && param && !arranging}
              <Actions project={param.title} />
              <!-- A PROJECT'S OWN KEY FOR ITS NUMBERS, beside what it runs on, when the record keeps a list of them. -->
              <Reporting register={param.register} seq={param.seq} title={param.title} />
            {/if}
            <!-- AN ORGANISATION'S "Send numbers here": the key its projects report with, and the line that uses it. -->
            {#if block.kind === 'section' && block.heading === copy.reportHeading && param && !arranging}
              <Reporting register={param.register} seq={param.seq} title={param.title} />
            {/if}
            {#if !drawn.refusal && !block.cannot && block.total > block.shown}
              {@const to = openHref(block)}
              <p class="block-slice" role="status">
                {block.source === 'forecast.runway'
                  ? copy.ofWhichWalked(block.shown, block.total, block.horizon ?? 180)
                  : copy.ofWhichDrawn(block.shown, block.total)}.{#if to}{' '}
                  <a class="tap" href={to}>{copy.openTheRest(REGISTERS[block.register!]?.name ?? block.register!)}</a>
                {/if}
              </p>
            {/if}
          </div>
        {/if}
      {/each}
    {/if}
  </div>

  <AddBlock bind:open={adding} {slug} register={primary} onadd={add} />
{/if}

<style>
  /* TWELVE COLUMNS, and `span` finally means something.
     
     The declaration has carried `span: 1–12, default 12` since 06 §1.1 and nothing has ever read
     it — every block rendered full width regardless. This is that key, rendered.

     A FLOW, not a canvas. Blocks fill the row and wrap; there is no x, no y and no hole. 21 §3.1
     rejected free placement on measured evidence — in Home Assistant's masonry a one-pixel height
     difference could move a card from the leftmost column to the rightmost, and people lost their
     spatial memory of where a control lived. A flow cannot do that: the order you declared is the
     order you get, at every width, forever.

     `align-items: start` so a half-width block beside a tall one keeps its own height instead of
     stretching to match — a stat tile stretched to the height of the table next to it is a stat
     tile with a hundred pixels of nothing under the figure. */
  /* THE CAP IS FOR THE PROSE, NOT FOR THE PAGE. It used to be 1180px flat, which fitted a 1440
     laptop exactly and then stopped: at 1920 it left 496px of the main column empty, and at 2560 it
     left 1136px — half the screen, on a page whose whole job is to put four things side by side.

     A limit is still right, because a twelfth of 2560px is not a column anybody scans, and a table
     row two and a half thousand pixels wide is a row the eye loses on the way back. But the thing
     that actually needs a measure is running text, and `.measure` already caps that at 72ch inside
     the block that has it. So the page gets the width a dashboard can use and prose keeps its own
     limit, rather than every block on every page paying for the one that reads like a paragraph. */
  /* The same weight and colour as the register grid's own cap line, because it is the same
     sentence about the same thing seen from the page rather than from the list. Left-aligned rather
     than centred: it sits under content of every shape here, and a centred line under a two-row
     `spec` block reads as a caption for it. */
  .block-cannot {
    margin: 0;
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .block-slice {
    margin: 0;
    padding-block-start: var(--sp-2);
    color: var(--dim);
    font-size: var(--t-sm);
  }

  .page {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: start;
    gap: var(--sp-7) var(--sp-6);
    padding: var(--sp-5) var(--gutter) var(--sp-9);
    max-inline-size: var(--page-max);
  }

  /* A PAGE THAT CANNOT BE DRAWN IS ONE SENTENCE, NOT A GRID. In the twelve columns the refusal took
     the first one, 90px at 1440, and wrapped a word to a line. */
  .page.said {
    display: block;
  }

  .block-slot {
    grid-column: span var(--span, 12);
    /* Required, not decorative: the tracks are `minmax(0, 1fr)` and a grid item without it refuses
       to shrink below its content, so one wide table pushes the whole row past the page. */
    min-inline-size: 0;
    /* The landing line is positioned against this. */
    position: relative;
  }

  /* NO RULE UNDER THE HEADER. The name at the section size is what says a block starts here, and
     a hairline under it was a second device doing the same job. The source link shares the name's
     baseline, which is what keeps the two halves of the header together. */
  .block-bar {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
    margin-block-end: var(--sp-3);
  }

  /* A BLOCK NAME IS A HEADING AND SHOULD LOOK LIKE ONE. At `--t-ui` and weight 500 in `--ink2` it
     was the same size, weight and colour as the body text underneath it, so a page of six blocks
     read as one undifferentiated column and the eye had nothing to jump between. It is the second
     level of the page's hierarchy — under the page title, over everything in the block — and now
     it takes the size `Section` gives every other heading at that level. */
  /* Section size, not page size: 20px belongs to the page title alone (DESIGN-BRIEF 4.8). */
  .block-name {
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--t-base);
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  /* Every block header names its source, and `o` opens that register PRE-FILTERED to the block's
     own `where:`. That is the down half of the two-altitude ladder, and nothing may break it. */
  .block-source {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--sp-1);
    margin-inline-start: auto;
    color: var(--dim);
    font-size: var(--t-xs);
    text-decoration: none;
  }

  .block-source:hover {
    color: var(--ink);
  }

  /* TWO ALTITUDES, BUILT UPWARD FROM THE FLOOR. The register name is the louder half and the
     predicate the quieter one, and the obvious way to say that — `--dim` on both, then
     `opacity: 0.8` on the predicate — put it under the contrast floor in light. `--dim` is solved
     to CLEAR that floor, so any opacity on top of it spends the whole margin the theme just
     bought; the theme was right and this call site was wrong. Raising the register name says the
     same thing and costs nothing, because the ceiling has room and the floor does not. */
  .block-where {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The word, quieter than the clause it introduces: it is a label and the clause is the fact. */
  .block-where-lead {
    color: var(--dim);
    font-size: var(--t-sm);
  }

  /* The file sits above its own text, on the leading edge of nothing else, so it reads as an action
     ON the source rather than as part of the page the source describes. Full width for the reason
     the `pre` below it is: neither is a block and neither has a declared span. */
  .source-file {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    min-inline-size: 0;
  }

  .source {
    /* THE WHOLE WIDTH, because it is not a block. Every other child of `.page` is a block with a
       declared span; this is the page's own source, and with no span it took one column of twelve —
       103 pixels of `page: m` / `title: ` / `nav: { ` clipped down the left edge with fourteen
       hundred beside it. `minmax(0, 1fr)` on the tracks is what lets a `pre` scroll instead of
       stretching them, so the two rules are one decision. */
    grid-column: 1 / -1;
    min-inline-size: 0;
    margin: 0;
    padding: var(--sp-4);
    background: var(--s1);
    border-radius: var(--r-md);
    color: var(--ink2);
    font-family: var(--font-id);
    font-size: var(--t-sm);
    line-height: 1.7;
    overflow-x: auto;
  }

  /* `#b-4` must not scroll underneath the sticky header. Paid once, per anchor. */
  .block-slot {
    scroll-margin-block-start: calc(var(--sticky) + var(--sp-4));
  }

  /* The figure's own bottom margin is the LIST's spacing, and the grid already provides it. Both
     were applying, so every gap on a declared page was 48px where the token says 24. */
  .block-slot :global(.block) {
    margin-block-end: 0;
  }

  /* The cursor is a BAND on the leading edge, not a box around the block. A block is already a
     bordered card; a second border around it reads as two nested boxes rather than as "this one".
     The same 2px inset the register grid uses for its focused row, for the same reason. */
  .block-slot[data-cursor] {
    outline: 2px solid var(--accent);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
  }

  /* ── arranging ────────────────────────────────────────────────────────────
     The block is outlined rather than lifted. A card that grows a shadow the moment a mode opens
     tells you the mode changed the page; an outline tells you the mode changed what you can do TO
     the page, which is the true thing. */
  .block-slot[data-arranging] {
    outline: 1px dashed var(--edge);
    outline-offset: var(--sp-2);
    border-radius: var(--r-sm);
    cursor: grab;
  }

  /* THE LANDING LINE. A 3px accent bar on the edge the held block will arrive at, drawn with an
     outline-style pseudo-element so it sits over the block's own border rather than moving it —
     a border that appears on hover reflows the grid under the pointer, which makes a drag feel
     like it is fighting you. `inset-inline` / `inset-block` so it mirrors under rtl for free. */
  /* `--z-raise`, WHICH IS THE STEP THIS NEEDED AND DID NOT HAVE. It was a bare 1, because the
     four names under it are a global overlay ORDER and this is not one: it is a pseudo-element
     clearing its own sibling, `.block-slot`s border, inside one local stacking context. Naming
     it `--z-sheet` would have put a drag-and-drop hairline at the tier of an actual bottom
     sheet. The token now says what it is, above its own sibling and below every overlay. */
  .block-slot[data-drop]::after {
    content: '';
    position: absolute;
    z-index: var(--z-raise);
    background: var(--accent);
    border-radius: 999px;
    pointer-events: none;
  }

  /* Side by side: a vertical line on the leading or trailing edge. */
  .block-slot[data-drop='before']::after,
  .block-slot[data-drop='after']::after {
    inset-block: calc(var(--sp-2) * -1);
    inline-size: 3px;
  }

  .block-slot[data-drop='before']::after {
    inset-inline-start: calc(var(--sp-3) * -1);
  }

  .block-slot[data-drop='after']::after {
    inset-inline-end: calc(var(--sp-3) * -1);
  }

  /* Full width: it stacks, so the line goes across the top or the bottom instead. */
  .block-slot[data-stacked][data-drop='before']::after,
  .block-slot[data-stacked][data-drop='after']::after {
    inset-inline: calc(var(--sp-2) * -1);
    inset-block: auto;
    inline-size: auto;
    block-size: 3px;
  }

  .block-slot[data-stacked][data-drop='before']::after {
    inset-block-start: calc(var(--sp-3) * -1);
  }

  .block-slot[data-stacked][data-drop='after']::after {
    inset-block-end: calc(var(--sp-3) * -1);
  }

  /* The one moving. Half-visible rather than hidden, so the row you are dragging out of does not
     collapse and re-lay-out under the pointer. */
  .block-slot[data-dragging] {
    opacity: 0.45;
    outline-style: solid;
    outline-color: var(--accent);
  }

  /* A page being arranged is a page whose content is not the point, and the obvious way to say so —
     `opacity: 0.65` on the block — put every word in it under the contrast floor. In a mode a
     person is actively working in, for as long as they are in it.

     It is the same mistake as `.block-where`, and the same fix: build the hierarchy by RAISING the
     controls rather than sinking the content through the floor. The block recedes onto the sunk
     surface, its own borders soften, and the control bar above it keeps full contrast — so the
     blocks read as objects being moved rather than as text you are meant to be reading, and the
     text stays readable, which it has to be to know which block you are holding.

     The gate only caught this once transitions were killed. Before that, axe kept measuring the
     opacity mid-transition and reporting a pass, which is a gate agreeing with itself. */
  .block-slot[data-arranging] :global(.block) {
    pointer-events: none;
  }

  .block-slot[data-arranging] :global(.block) > :global(*) {
    background: var(--sunk);
    border-color: color-mix(in srgb, var(--line) 55%, transparent);
  }

  /* ONE COLUMN below 900px, in declaration order.
     
     The corpus never wrote this rule down, so here it is with its reason. 13 §10 has two
     breakpoints and 05 §6 allows width to change LAYOUT but never size. Collapsing to one column
     keeps the only thing a span was ever encoding — which block comes after which — and that is
     precisely the property masonry lost. There is no second stored layout for narrow, because a
     second layout is a second thing to keep in sync and nobody ever does. */
  @media (width < 900px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      padding: var(--sp-4) var(--gutter) var(--sp-8);
    }

    .block-slot {
      grid-column: auto;
    }

    /* Both of them, for one reason. `13 §10`: "Authoring: read and approve, do not author. The page
     builder and pack builder are desktop surfaces." */
  @media (width < 900px) {
    .source-slot {
      display: none;
    }
  }

  .arrange-slot {
      display: none;
    }

    /* The query a block was drawn from is PROVENANCE, and on a phone it is two lines of monospace
       above every block competing with the block's own heading. It is a desktop affordance for the
       same reason the source link beside it is. */
    .block-where {
      display: none;
    }
  }

  /* A stat's cells are declared, so the block cannot infer how many to draw (05 §4) — but the HOST
     may restack what it was given, and three figures across a 358px phone breaks `GBP 4,050.00`
     into two lines. A board on a phone stacks its lanes, which is what this still does for one. */
  @media (width < 640px) {
    .block-slot :global(.grid) {
      grid-template-columns: minmax(0, 1fr);
    }

    /**
     * AND A STAT GOES TWO-UP, BECAUSE THE REASON ABOVE STOPPED BEING TRUE OF THE PAGE IT CITED.
     *
     * The comment over this rule used to end "Home already does this for its own stat", and Home
     * stacked its three figures one per row until today. It no longer does: its strip is two
     * columns with the lead figure spanning both, because one-per-row put the question list off
     * the first screen. `/p/money` kept stacking and paid for it the way Home had: four figures at
     * about a hundred and ten pixels each, measured at 390 as cells 356 wide stacked from y 288 to
     * y 716, so "Where it sits" started below the fold and the page read as four cards and nothing
     * else.
     *
     * TWO COLUMNS, AND THE FIRST SPANS WHEN THE COUNT IS ODD, which is Home's shape generalised:
     * four figures are a two-by-two, three are a lead with two beneath, one is one. The count is
     * still the declaration's; `:first-child:nth-last-child(odd)` only reads it.
     *
     * `:has(> .cell)` SO A BOARD IS NOT CAUGHT. Board and stat both render `class="grid"`, and a
     * board's lanes two-up on a phone are two columns of cards at 170px, which is a different
     * decision from this one and nobody has taken it.
     *
     * NO HAIRLINES BETWEEN THEM. Space separates figures (DESIGN-BRIEF 4.6), on a phone as on a
     * desktop.
     */
    .block-slot :global(.grid:has(> .cell)) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* No rules between the figures on a phone either; the grid's gap separates them. */
    .block-slot :global(.grid:has(> .cell)) {
      gap: var(--sp-4) var(--sp-5);
    }

    .block-slot :global(.grid:has(> .cell) > .cell:first-child:nth-last-child(odd)) {
      grid-column: 1 / -1;
    }

    /* A step down so `GBP 28,320.00` stays one line in half a phone, which is the rule Home's strip
       already follows for the same width. */
    .block-slot :global(.grid:has(> .cell) .cell-figure) {
      font-size: var(--t-lg);
      /* ONE AMOUNT NEVER BREAKS, because its code sits on a no-break space; a figure in several currencies breaks
         between them rather than running out of half a phone. */
      white-space: normal;
    }

    /* THE LEAD FIGURE STAYS THE SCREEN'S HERO on a phone, a step above the figures beside it. */
    .block-slot :global(.block[data-form='lead'] .grid > .cell:first-child) {
      grid-column: 1 / -1;
    }

    .block-slot :global(.block[data-form='lead'] .grid > .cell:first-child .cell-figure) {
      font-size: var(--t-2xl);
      /* A HERO IN SEVERAL CURRENCIES BREAKS BETWEEN THEM, never inside an amount, which keeps its code on a no-break space. */
      white-space: normal;
    }

    /* A LEAD AND THREE OR MORE FIGURES: the rest are rows under it, the label on the left and the figure
       at the right edge with its note beneath, so the last of them is not left alone on a row of its own
       and none of them wraps its label to fit a third of a phone. */
    .block-slot :global(.block[data-form='lead'] .grid:has(> .cell:nth-child(4))) {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--sp-3);
    }

    .block-slot :global(.block[data-form='lead'] .grid:has(> .cell:nth-child(4)) > .cell:not(:first-child)) {
      grid-template-areas:
        'label glyph figure'
        'note note figure';
      /* THE LABEL KEEPS A FLOOR, so a figure in several currencies, which is long, does not squeeze it to a word a line. */
      grid-template-columns: minmax(min(14ch, 45%), max-content) minmax(0, 1fr) minmax(0, auto);
      column-gap: var(--sp-2);
    }

    .block-slot :global(.block[data-form='lead'] .grid:has(> .cell:nth-child(4)) > .cell:not(:first-child) .cell-figure) {
      font-size: var(--t-md);
      text-align: end;
      /* AND THE FIGURE BREAKS BETWEEN ITS AMOUNTS, never inside one: each keeps its code on a no-break space. */
      white-space: normal;
    }
  }
</style>
