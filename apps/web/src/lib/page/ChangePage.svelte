<!--
  The page menu in a declared page's head: one "⋯" beside Share, holding "Change this page", Pin this or Unpin, "How
  this is built" and Edit layout.

  PIN THIS KEEPS THE PAGE AS IT IS DRAWN (a composition is a proposal the person can pin, change or undo,
  and his pins always win): every block in its place, as the person's own look (`look.ts`), so the engine stops
  arranging it. Unpin lets the engine arrange it again. Either says what it did with an Undo. Under them, in a quiet
  line, how the page came to look as it does: "Slash arranged · Mara kept", or that it is pinned. Only the owner pins,
  as only the owner sets a declaration.

  ONE MENU AT EVERY WIDTH. The head drew four controls side by side from 900px up (How this is built, Share, Change this
  page, Edit layout), which is chrome a reader meets on every page and uses on few (fewer things on
  screen). Share stays out in the row, because it is the one a reader reaches for; the rest are one press away here.
  Edit layout is offered from 900px only, since authoring is a desktop surface (13 §10); a phone still changes a page
  by describing it, and still reads how it is built.

  ON A HOME (Today, Decide) THE SAME MENU, with what that home can take: Edit layout and Change this page always, and How
  this is built once the record holds the page, at the page's own address since a home draws no source. CHANGE THIS
  PAGE ON A HOME THE RECORD HOLDS NONE OF YET drafts from the body the screen built (`built`), and keeping a
  draft is the page's first write, with an Undo that retires it so the built one is drawn again.
  A menu with nothing to offer is not drawn.

  ITS OWN FILE, NOT LINES IN `PageView.svelte`, which several units write: the head's actions region there is one line
  that mounts this, and the styles for the trigger and the menu live here with them.
-->
<script lang="ts">
  import { at } from '$lib/at.ts';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { MediaQuery } from 'svelte/reactivity';
  import { copy } from '$lib/copy.ts';
  import { changeWords as words } from '$lib/record/slash.ts';
  import Icon, { type IconName } from '$lib/ui/Icon.svelte';
  import Menu from '$lib/ui/Menu.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { apiBase } from '$lib/at.ts';
  import type { LiveLook } from '$lib/record/page-live.ts';
  import { describeAsked, opensDescribe, withoutDescribe } from './change-open.ts';
  import {
    bodyOf,
    hiddenOf,
    historyOf,
    isPinned,
    keptHere,
    lookPage,
    offerKey,
    pinBody,
    putBack,
    putBackSaid,
    putBackWords,
    retireLook,
    showBody,
    writeLook,
    type Hidden,
    type Headed,
  } from './look.ts';
  import { words as pageWords } from './words.ts';
  import { CHANGE_PAGE_EVENT } from './slash-entry.ts';
  import { answerVerbs } from '$lib/things/page-verbs.ts';
  import type { SayBlock, SayIn, SayList } from './say-page.ts';

  let {
    slug,
    title,
    showSource,
    reread,
    onarrange = null,
    source = 'here',
    change = true,
    look = null,
    keys = () => [],
    heads = () => [],
    extra = [],
    built = null,
    board = null,
    here = null,
  }: {
    /**
     * THE SETTINGS THAT DECIDE HOW THIS PAGE READS, changed here (`SettingHere.svelte`): Money's currency on Money's
     * pages, a list's name on its page. `null` offers none.
     */
    here?: { currency?: string | null | undefined; list?: { id: string; name: string } | undefined } | null;
    /**
     * Whether this page can be laid out as a board, and whether it is one now (`page-boards.svelte.ts`): a project's
     * page and Money's home. `null` offers no board.
     */
    board?: { on: boolean; keys: () => readonly string[] } | null;
    /**
     * Entries the page offers first, above its own: a link (a project's "Edit details", proj F7, VERIFY H13), or a
     * press the screen handles (Needs you's Ask a question and Select, so that home has one "⋯" and not two stacked).
     * `checked` makes a press a checkbox item, which leaves the menu open.
     */
    extra?: readonly { label: string; icon: IconName; href?: string | undefined; onclick?: (() => void) | undefined; checked?: boolean | undefined }[];
    /** The page's address, which the description is about. */
    slug: string;
    /** The page's title, which names the menu for a screen reader. */
    title: string;
    /** Whether the page is drawn as how it is built (`?src=1`), which the menu's second entry toggles. */
    showSource: boolean;
    /** Reads the page again once a change is kept, so it is drawn as it now stands. */
    reread: () => Promise<void>;
    /** Opens Edit layout, or `null` where this reader may not arrange the page or it is drawn as its source. */
    onarrange?: (() => void) | null;
    /** Where How this is built is drawn: `here` toggles it in place, an address goes there, and `null` offers none. */
    source?: 'here' | string | null;
    /** Whether Change this page is offered, for a page the record holds. */
    change?: boolean;
    /** How the engine arranged the page, as the record answered it, or `null` where it sent none. */
    look?: LiveLook | null;
    /** The page's blocks by key, in the order they are drawn now, which Pin this keeps. */
    keys?: () => readonly string[];
    /** The page's blocks by key with their headings, which Hidden names what the look hides by. */
    heads?: () => readonly Headed[];
    /**
     * The body a home is built from while the record holds none (`home-arrange.ts` `previewedBody`), which Change this
     * page drafts over; `null` for a page the record holds.
     */
    built?: (() => Promise<unknown>) | null;
  } = $props();

  let open = $state(false);
  let menu = $state(false);
  /* THE BOARD'S TWO WORDS, here so the menu draws them before the board's code is asked for. */
  const boardOn = 'Lay out as a board';
  const boardOff = 'Back to a plain page';
  /** A line Slash handed this page ("move Bills up"), sent once as the sheet opens; each one opens a fresh sheet. */
  let line = $state<string | undefined>(undefined);
  let lines = $state(0);

  /* THE SAME FACT THE PALETTE'S SLASH ROW STANDS ON: whether this host has a model behind Slash. */
  const model = $derived(page.data.slash === true);

  /* ONLY AN OWNER MAY ASK SLASH TO DRAFT, as the record's `slashDraft` holds, so a member is not offered a press that
     is always refused. A reader of the sample has no person, and is shown it, since the sheet says why nothing drafts. */
  const mayChange = $derived((change || built !== null) && page.data.me?.owner !== false);

  /**
   * A DRAFT KEPT ON A HOME THE RECORD HELD NONE OF is the page's first write: the shell is read again so the screen draws
   * the kept page, and the toast's Undo retires it, which draws the built one again (`home-arrange.ts` `unkeep`).
   */
  async function keptFirst() {
    const { reboot, unkeep } = await import('./home-arrange.ts');
    await reboot();
    toasts.push(pageWords.homeKept(title), {
      undo: () =>
        void unkeep(apiBase(), slug).then(async (out) => {
          if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
          await reboot();
          toasts.push(pageWords.homeBack(title));
        }),
    });
  }

  /* A PAGE JUST MADE OPENS ON ITS DESCRIBE FIELD: the palette opens it at `?describe=1`, and this reads the
     mark once. The sheet opens when this reader may change the page and the host has a model; with none the page opens
     as it always did. Either way the mark leaves the address, replaced and not pushed, so Back and a reload do not open
     the sheet again. `answered` is the address already dealt with, so nothing here runs twice while the address turns. */
  let answered = '';
  $effect(() => {
    if (!describeAsked(page.url) || answered === page.url.href) return;
    answered = page.url.href;
    if (opensDescribe({ asked: true, mayChange, model })) open = true;
    /* THROUGH `at()`, which hands back an address already under the app as it is (`at-sites.test.ts`). */
    void goto(at(withoutDescribe(page.url)), { replaceState: true, noScroll: true, keepFocus: true });
  });

  /* A LINE ABOUT THE WHOLE PAGE FROM SLASH (`Arrange.svelte` hands it over when no block is in focus): the sheet opens on
     it and reads it at once, by the rules first and the model only where they cannot. Taken, so it is not also held. */
  $effect(() => {
    if (!mayChange) return;
    const on = (e: Event) => {
      const said = (e as CustomEvent<{ line?: unknown }>).detail?.line;
      if (typeof said !== 'string' || said.trim() === '') return;
      e.preventDefault();
      line = said.trim();
      lines += 1;
      open = true;
    };
    addEventListener(CHANGE_PAGE_EVENT, on);
    return () => removeEventListener(CHANGE_PAGE_EVENT, on);
  });

  /**
   * WHAT THE RULES READ A LINE AGAINST (`say-page.ts`), read as the line is sent and not before: the page's own body as
   * the record stores it, its blocks in the order they are drawn, his look, and the lists with their fields. A home the
   * record holds none of yet is the model's alone, since there is no body to change.
   */
  async function sayCtx(): Promise<Omit<SayIn, 'text'> | null> {
    if (!change) return null;
    const [{ authoredOf }, { REGISTERS }] = await Promise.all([import('$lib/record/page-write.ts'), import('$lib/record/held.ts')]);
    const read = await authoredOf(apiBase(), slug);
    if ('from' in read) return null;
    const order = keys();
    const all = heads() as readonly (Headed & { kind?: string; register?: string | null; source?: string; drawn?: boolean; area?: string })[];
    const rank = (k: string) => {
      const n = order.indexOf(k);
      return n < 0 ? order.length + 1 : n;
    };
    const blocks: SayBlock[] = [...all]
      .sort((a, b) => rank(a.key) - rank(b.key))
      .map((b) => ({
        key: b.key,
        kind: b.kind ?? '',
        heading: b.heading ?? null,
        register: b.register ?? null,
        source: b.source,
        drawn: order.includes(b.key) && b.drawn !== false,
        area: b.area === 'rail' ? 'rail' : 'main',
      }));
    /* EACH LIST BY THE NAME THIS PERSON SEES IT BY (the shell's, with his words), with the fields the record declared. */
    const seen = new Map(((page.data as { index?: { registers?: { id: string; name: string }[] } }).index?.registers ?? []).map((r) => [r.id, r.name]));
    const lists: SayList[] = Object.values(REGISTERS).map((r) => ({
      id: r.id,
      name: seen.get(r.id) ?? r.name,
      one: r.one,
      title: r.title,
      state: r.state,
      done: r.done,
      fields: r.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, values: (f as { values?: readonly string[] }).values })),
    }));
    for (const [id, name] of seen) if (!lists.some((l) => l.id === id)) lists.push({ id, name, fields: [] });
    const counts = new Map<string, number>();
    for (const b of blocks) if (b.register) counts.set(b.register, (counts.get(b.register) ?? 0) + 1);
    const current = blocks.find((b) => b.register && slug.replace(/^r[-/]/u, '') === b.register)?.register ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { slug: under, body: read.body, version: read.version, mine: read.mine, blocks, look, lists, current, now: Date.now() };
  }

  /* EDIT LAYOUT FROM 900px, the width the arranging mode is drawn for. Read as the menu is drawn, so a window narrowed
     with the menu shut offers it no more. */
  const wide = new MediaQuery('(width >= 900px)', false);

  /* THE SOURCE KEEPS THE REST OF THE ADDRESS, as ⇧E does, so on /?work it stays on Work, filters and all. */
  function toggle(on: boolean) {
    const q = new URLSearchParams(page.url.searchParams);
    q.set('src', on ? '1' : '0');
    void goto(`?${q}`, { replaceState: true, noScroll: true });
  }

  function toSource() {
    open = false;
    if (source === 'here') toggle(true);
    else if (source) void goto(at(source));
  }

  /* ── the pin ───────────────────────────────────────────────────────────────
     THE OWNER'S, as setting any declaration is, and only on a page the record holds. */
  const mayPin = $derived(change && page.data.me?.owner === true);
  const pinned = $derived(isPinned(look));
  /** The page the look is written under: the declaration it is laid over, which a template's pages share. */
  const under = $derived(lookPage(slug, look));
  /* READ AGAIN AS THE MENU OPENS, so an arrangement kept a moment ago in this tab says who kept it (`keptHere`). */
  const history = $derived((void menu, historyOf(look, look ? (keptHere.get(offerKey(under, look)) ?? null) : null)));
  let pinning = false;

  /** Writes the pin, or takes it away, reads the page as it now stands, and says so with the way back. */
  async function pin(on: boolean) {
    if (pinning) return;
    pinning = true;
    const was = look;
    try {
      const at = under;
      const out = on ? await writeLook(apiBase(), pinBody(at, was, keys())) : await retireLook(apiBase(), at);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(on ? pageWords.pinned(title) : pageWords.unpinned(title), {
        /* THE WAY BACK IS THE LOOK AS IT WAS: the one stored before written again, Slash's or the person's, or none where
           the rules arranged the page, since the rules' look is worked out and never stored. The person's comes back
           without the headline and next action the engine filled in around their pins (`mergeLook`), or putting it back
           would freeze the engine's line of that moment as theirs. */
        undo: () =>
          void restore(at, was),
      });
    } finally {
      pinning = false;
    }
  }

  /** Writes the look as it was before a pin or a Show, or retires it where the rules arranged the page, and reads again. */
  async function restore(at: string, was: LiveLook | null) {
    const back = await (was && was.by !== 'rule'
      ? writeLook(apiBase(), bodyOf(at, was.by === 'owner' ? { ...was, headline: null, next: null } : was))
      : retireLook(apiBase(), at));
    if (!back.ok) toasts.push(back.fix, { intent: 'warn' });
    await reread();
  }

  /* ── put back and hidden ───────────────────────────────────────────────────
     PUT BACK IS ONE STEP BACK WHOEVER WROTE THE LOOK, any day after its toast has gone: named by whose look it
     takes off and the day it was written, when the record says (`look.at`). The owner's, as the pin is. */
  const backLine = $derived(putBackWords(look, look?.at));
  /* WHAT THE LOOK HIDES, read again as the menu opens, offered back one by one. */
  const hidden = $derived((void menu, hiddenOf(look, heads())));
  let hiddenOpen = $state(false);
  let writing = false;

  async function putBackNow() {
    if (writing) return;
    writing = true;
    try {
      const out = await putBack(apiBase(), under);
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(putBackSaid(title, out.restored));
    } finally {
      writing = false;
    }
  }

  /** Shows one hidden block as the person's own look, and says so with the way back. */
  async function show(h: Hidden) {
    if (writing) return;
    writing = true;
    const was = look;
    try {
      const at = under;
      const out = await writeLook(apiBase(), showBody(at, was, h.key));
      if (!out.ok) return void toasts.push(out.fix, { intent: 'warn' });
      await reread();
      toasts.push(`${h.heading} is shown on ${title} again.`, { undo: () => void restore(at, was) });
    } finally {
      writing = false;
    }
  }

  /* ── the board ─────────────────────────────────────────────────────────────
     LAY OUT AS A BOARD: his own arrangement of this page, kept as his (`page-boards.svelte.ts`), and its editor opens on
     it at once. Back to a plain page takes it away. Each with an Undo. */
  async function toBoard(on: boolean) {
    const { boardSlug, boardWords, pageBoards } = await import('./page-boards.svelte.ts');
    if (on) pageBoards.fresh = boardSlug(slug);
    const out = await pageBoards.put(slug, on ? { order: [], sizes: {} } : null);
    if (!out.ok) {
      pageBoards.fresh = null;
      return void toasts.push(out.fix, { intent: 'warn' });
    }
    const before = out.before;
    toasts.push(on ? boardWords.onSaid(title) : boardWords.offSaid(title), { undo: () => void pageBoards.put(slug, before) });
  }

  /* ── a setting, changed where it shows ── */
  let setting = $state<{ kind: 'currency'; code: string | null } | { kind: 'list'; id: string; name: string } | null>(null);
  let settingOpen = $state(false);
  function changeSetting(what: NonNullable<typeof setting>) {
    setting = what;
    settingOpen = true;
  }

  /* THE SAME VERBS, ASKED FROM A LINK TO THIS PAGE (`things/menu-of.ts`): pressed on a right-click elsewhere, done here. */
  $effect(() =>
    answerVerbs({
      change: mayChange ? () => (open = true) : null,
      keepLayout: mayPin ? () => void pin(!pinned) : null,
      source: source === 'here' ? () => toggle(!showSource) : source ? toSource : null,
      arrange: onarrange,
      board: board && mayPin ? () => void toBoard(!board.on) : null,
      currency: here && mayPin && here.currency !== undefined ? () => changeSetting({ kind: 'currency', code: here.currency ?? null }) : null,
    }),
  );

  /** Whether the menu holds anything at this width; one that would open on nothing is not drawn. */
  const offers = $derived(extra.length > 0 || mayChange || mayPin || source !== null || (onarrange !== null && wide.current) || (board !== null && mayPin) || (here !== null && mayPin));
</script>

<!-- `page-more` and `data-arrange` NAME THE WAY INTO EDIT LAYOUT for a gate, which opened it from its own button. -->
{#if offers}
<span class="page-more">
<Menu label={words.more(title)} align="end" bind:open={menu}>
  {#snippet trigger()}
    <span class="change-more"><Icon name="more" size="s" /><span class="change-vh">{words.more(title)}</span></span>
  {/snippet}
  {#each extra as x (x.href ?? x.label)}
    {#if x.href}<a class="mi" role="menuitem" href={at(x.href)}><Icon name={x.icon} size="s" />{x.label}</a>
    {:else if x.checked !== undefined}<button type="button" class="mi" role="menuitemcheckbox" aria-checked={x.checked} onclick={() => x.onclick?.()}><Icon name={x.icon} size="s" />{x.label}</button>
    {:else}<button type="button" class="mi" role="menuitem" onclick={() => { menu = false; x.onclick?.(); }}><Icon name={x.icon} size="s" />{x.label}</button>{/if}
  {/each}
  {#if mayChange}<button type="button" class="mi" role="menuitem" onclick={() => (open = true)}><Icon name="ask" size="s" />{words.change}</button>{/if}
  {#if mayPin}
    <!-- THE PIN, NAMED BY HOW THE PAGE CAME TO LOOK AS IT DOES, which is drawn under it as a quiet line and said to a
         screen reader as the group's name. -->
    <div role="group" aria-label={history ?? undefined}>
      <button type="button" class="mi" role="menuitem" onclick={() => void pin(!pinned)}
        ><Icon name={pinned ? 'lock-open' : 'lock'} size="s" />{pinned ? pageWords.unpin : pageWords.pin}</button
      >
      {#if history}<p class="change-history" aria-hidden="true">{history}</p>{/if}
    </div>
    {#if backLine}<button type="button" class="mi" role="menuitem" onclick={() => void putBackNow()}><Icon name="history" size="s" />{backLine}</button>{/if}
    {#if hidden.length > 0}
      <!-- A CHECKABLE ITEM, so opening the short list leaves the menu open; each Show is a verb and closes it. -->
      <button type="button" class="mi" role="menuitemcheckbox" aria-checked={hiddenOpen} onclick={() => (hiddenOpen = !hiddenOpen)}
        ><Icon name="eye" size="s" />Hidden ({hidden.length})</button
      >
      {#if hiddenOpen}
        <div role="group" aria-label="Hidden">
          {#each hidden as h (h.key)}
            <button type="button" class="mi change-hidden" role="menuitem" aria-label={`Show ${h.heading}`} onclick={() => void show(h)}
              ><Icon name="eye" size="s" /><span class="change-hidden-name">{h.heading}</span><span class="change-show" aria-hidden="true">Show</span></button
            >
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
  {#if source === 'here'}
    <button type="button" class="mi" role="menuitem" onclick={() => toggle(!showSource)}
      ><Icon name="code" size="s" />{showSource ? copy.pageBack : copy.pageSource}</button
    >
  {:else if source}
    <button type="button" class="mi" role="menuitem" onclick={toSource}><Icon name="code" size="s" />{copy.pageSource}</button>
  {/if}
  {#if onarrange && wide.current && !board?.on}
    <button type="button" class="mi" role="menuitem" data-arrange onclick={() => onarrange?.()}><Icon name="grid" size="s" />{copy.arrange}</button>
  {/if}
  {#if here && mayPin && here.currency !== undefined}
    <button type="button" class="mi" role="menuitem" onclick={() => changeSetting({ kind: 'currency', code: here.currency ?? null })}
      ><Icon name="money" size="s" />{here.currency ? `Counted in ${here.currency}` : 'Money’s currency'}<span class="change-show" aria-hidden="true">Change</span></button
    >
  {/if}
  {#if here && mayPin && here.list}
    {@const list = here.list}
    <button type="button" class="mi" role="menuitem" onclick={() => changeSetting({ kind: 'list', id: list.id, name: list.name })}
      ><Icon name="edit" size="s" />{`Called ${list.name}`}<span class="change-show" aria-hidden="true">Change</span></button
    >
  {/if}
  {#if board && mayPin}
    <button type="button" class="mi" role="menuitem" onclick={() => void toBoard(!board.on)}
      ><Icon name={board.on ? 'rows' : 'board'} size="s" />{board.on ? boardOff : boardOn}</button
    >
  {/if}
</Menu>
</span>
{/if}

{#if setting}
  {#await import('./SettingHere.svelte') then { default: SettingHere }}<SettingHere bind:open={settingOpen} what={setting} onchanged={reread} />{/await}
{/if}

{#if mayChange}
  <Sheet bind:open title={words.change} onclose={() => (line = undefined)}>
    <!-- KEYED BY THE PAGE, because the reader is kept across pages and a draft for the last page is not this one's; and by
         each line Slash hands over, so a second line is read afresh. -->
    {#key `${slug}:${lines}`}
      {#await import('./AskPage.svelte') then { default: AskPage }}
        {#if built !== null && !change}<AskPage page={slug} {model} onsource={toSource} onkept={keptFirst} {built} ask={line} />
        {:else}<AskPage page={slug} {model} onsource={toSource} onkept={reread} say={sayCtx} ask={line} />{/if}
      {/await}
    {/key}
  </Sheet>
{/if}

<style>
  .page-more {
    display: contents;
  }

  /* A CIRCLE THE TOOLBAR'S HEIGHT, with no fill of its own: the quiet end of the row, beside Share. The wash says it
     can be pressed once the pointer is on it. */
  .change-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--ctl-h);
    min-block-size: var(--ctl-h);
    /* A GLASS CIRCLE (ops 4.1, 3 Nov). */
    background: var(--g-fill);
    -webkit-backdrop-filter: var(--g-bf);
    backdrop-filter: var(--g-bf);
    box-shadow: inset 0 0 0 0.5px var(--g-line);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  @media (hover: hover) and (pointer: fine) {
    .page-more :global(.menu-trigger:hover > .change-more) {
      background: var(--g-fill-hover);
      color: var(--ink);
    }
  }

  .page-more :global(.menu-trigger[aria-expanded='true'] > .change-more) {
    background: var(--g-fill-hover);
    color: var(--ink);
  }

  /* HOW THE PAGE CAME TO LOOK AS IT DOES: a caption under the pin, in the menu's quiet ink, never a control. */
  .change-history {
    margin: 0;
    padding: 0 var(--sp-3) var(--sp-2) calc(var(--sp-3) + 16px + var(--sp-2));
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: 1.45;
  }

  /* WHAT THE LOOK HIDES, one line each under Hidden, set in as the history line is, with Show at the trailing edge in
     the working accent, since it is the verb. */
  .page-more .change-hidden {
    padding-inline-start: calc(var(--sp-3) + 16px + var(--sp-2));
  }

  .change-hidden-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ONE LINE: the menu is as wide as its longest row, so "Counted in USD" never wraps beside Change. */
  .mi:has(> .change-show) {
    white-space: nowrap;
  }

  .change-show {
    margin-inline-start: auto;
    padding-inline-start: var(--sp-3);
    color: var(--ink);
  }

  .change-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
