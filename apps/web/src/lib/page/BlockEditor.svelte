<!--
  Edit a block in place: the sheet the Edit button on a block's bar opens while the page is arranged.

  IT EDITS WHAT THE RECORD STORES, NOT WHAT THE SCREEN DREW. The block is read through `sourceOf` (the same read "How
  this is built" makes), so a page made for each row of a list is edited as its template, with `{{field}}` where the
  row's name would be, and nothing the answer computed is ever written back. What leaves is a patch (`block-edit.ts`),
  laid over the stored block inside the one arrangement write, so Put back undoes an edit and a move together.

  ONE FILTER EDITOR. Which rows a block shows is edited with the query builder (`lib/query/QueryBuilder.svelte`),
  which draws the filter as rows and as a sentence and asks the record for its count through `previewPage`. There is no
  second editor of a `where` here, because two editors of one tree are two readings of it.

  AN ICON ON ANY BLOCK. The field shows the glyph the block wears and its name; Choose opens the picker
  (`GlyphPicker.svelte`, by a dynamic import) in place, by group, and the pick goes out in the same patch as every other
  edit. "No icon" takes the key off.

  A DESKTOP SURFACE, as arranging is (13 §10): the sheet opens only from the arranging bar, which is not drawn below
  900px. A phone changes a page by describing it.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Predicate } from '@braindog/where';
  import { page as route } from '$app/state';
  import { copy } from '$lib/copy.ts';
  import QueryBuilder from '$lib/query/QueryBuilder.svelte';
  import { readSentence, toWhere, type QueryField } from '$lib/query/tree.ts';
  import { spanLabel, stepsFor, type Area } from '$lib/record/arrange.ts';
  import {
    blockWords,
    countRows,
    draftOf,
    firstFits,
    whenFits,
    whenNothing,
    formOf,
    patchOf,
    readList,
    rolesFor,
    sortSaid,
    type Draft,
    type DraftColumn,
    type SortDir,
  } from '$lib/record/block-edit.ts';
  import type { LiveBlock } from '$lib/record/page-live.ts';
  import type { Patch } from '$lib/record/page-write.ts';
  import type { BlockBody } from '$lib/record/pages-live.ts';
  import { seedBlock } from '$lib/record/seed.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { apiBase } from '../at.ts';

  let {
    open = $bindable(false),
    slug,
    index,
    added,
    held = null,
    block,
    span,
    area,
    lists,
    every,
    onsave,
  }: {
    open?: boolean;
    /** The page's address, whose stored declaration the block is read from. */
    slug: string;
    /** The block's index in the declaration, which is how the arrangement write names it. */
    index: number;
    /** The block as declared in this session's arranging, when it was added and is not stored yet. */
    added: BlockBody | null;
    /**
     * The block as declared on a page the record does not hold yet (Today or Decide before their first Done,
     * `home-arrange.ts`), read from there because there is no stored one to read.
     */
    held?: BlockBody | null;
    /** The block as drawn, for its kind and its name while the stored one is read. */
    block: LiveBlock;
    /** The width it takes now, in twelfths. */
    span: number;
    /** The column it sits in, or `null` on a page with no rail. */
    area: Area | null;
    /** The lists a block on this page may show: the ones the page requires. */
    lists: readonly { id: string; name: string }[];
    /** The list whose every page this edits, when the page is one made for each row. */
    every: string | null;
    /** Writes the patch with the width and column, and answers whether it landed. */
    onsave: (patch: Patch, span: number, area: Area | null) => Promise<boolean>;
  } = $props();

  const uid = $props.id();

  /* ── the stored block ───────────────────────────────────────────────────── */

  let stored = $state<BlockBody | null>(null);
  let unread = $state<string | null>(null);
  let draft = $state<Draft | null>(null);
  let width = $state(12);
  let column = $state<Area>('main');

  /* READ ONCE PER OPENING, and the draft built from it, so reopening the sheet starts from what the record holds and a
     draft abandoned with Cancel is gone. */
  $effect(() => {
    if (!open) return;
    /* ONLY `open` STARTS A READ. The page redrawn under the sheet hands it a new `block` and `span`, and a draft that
       reset whenever that happened would lose what was being typed. */
    return untrack(() => begin());
  });

  function begin(): (() => void) | undefined {
    width = span;
    column = area ?? 'main';
    stored = null;
    draft = null;
    unread = null;
    touched = false;
    whereNow = undefined;
    iconNow = undefined;
    picking = false;
    const given = added ?? held;
    if (given) {
      stored = given;
      draft = draftOf(given);
      return undefined;
    }
    let live = true;
    void import('$lib/dog/read.ts')
      .then(({ sourceOf }) => sourceOf(apiBase(), slug))
      .then((got) => {
        if (!live) return;
        const found = 'fix' in got ? null : got.body.blocks;
        const raw = Array.isArray(found) ? found[index] : undefined;
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          unread = 'fix' in got ? got.fix : copy.recordNotReached;
          return;
        }
        const body = { ...(raw as Record<string, unknown>), kind: typeof (raw as { kind?: unknown }).kind === 'string' ? ((raw as { kind: string }).kind) : block.kind };
        stored = body;
        draft = draftOf(body);
      })
      .catch(() => {
        if (live) unread = copy.recordNotReached;
      });
    return () => {
      live = false;
    };
  }

  const kind = $derived(stored?.kind ?? block.kind);
  const kindName = $derived(copy.kindNames[kind] ?? blockWords.kindNames[kind] ?? kind);
  const title = $derived(blockWords.title(draft?.heading.trim() || block.heading || kindName));
  const form = $derived(formOf(kind));

  /* ── the list it shows, and that list's fields ─────────────────────────── */

  /** The list the block reads, when its source is one: `register.<id>` and nothing else is a list. */
  const register = $derived.by(() => {
    const source = draft?.source;
    return typeof source === 'string' && source.startsWith('register.') ? source.slice('register.'.length) : null;
  });
  let fields = $state<QueryField[] | null>(null);
  let fieldsFailed = $state(false);

  $effect(() => {
    const list = register;
    fields = null;
    fieldsFailed = false;
    if (!list) return;
    let live = true;
    void readList(apiBase(), list).then((got) => {
      if (!live) return;
      if (got) fields = got.fields;
      else fieldsFailed = true;
    });
    return () => {
      live = false;
    };
  });

  /** The lists offered in "What it shows": the page's own, and the one the block reads now if the page does not name it. */
  const choices = $derived.by(() => {
    const out = lists.map((l) => ({ id: l.id, name: l.name }));
    if (register && !out.some((l) => l.id === register)) out.unshift({ id: register, name: register.replace(/_/g, ' ') });
    return out;
  });

  /**
   * ANOTHER LIST IS ANOTHER SET OF FIELDS, so its filter and columns cannot carry over: the filter is taken off and the
   * columns are seeded afresh from the new list (`seed.ts`), the same first draft the picker would have given.
   */
  function showList(id: string) {
    if (!draft || id === register) return;
    draft.source = `register.${id}`;
    touched = true;
    whereNow = undefined;
    /* AND ITS SORT, whose field the new list may not have: one kept as written goes too, or the record refuses it. */
    draft.sortField = '';
    draft.sortKept = false;
    const seed = seedBlock(kind, id);
    draft.columns = (seed?.columns ?? []).map((c) => ({ field: c.field, label: c.label ?? '', as: c.as ?? '', rest: {} }));
  }

  /* ── the filter ─────────────────────────────────────────────────────────── */

  /** Whether the builder changed the filter. Until it does, the stored one goes back exactly as it was written. */
  let touched = $state(false);
  let whereNow = $state<Predicate | undefined>(undefined);

  /**
   * The stored filter as the builder's tree, or `kept` when it cannot be drawn as one.
   *
   * A SENTENCE IS READ BY THE RECORD'S OWN PARSER (`readSentence`). One that names the row a page is made for
   * (`client is {{client}}`) is not a filter until a row fills it, so it is kept as written and the builder is not drawn
   * over it: rows built from a guess would write the guess back.
   */
  const whereStored = $derived.by((): { tree: Predicate | undefined } | 'kept' | null => {
    if (!stored || !register || !fields) return null;
    const w = stored.where;
    if (w === undefined) return { tree: undefined };
    if (typeof w === 'object' && w !== null && !Array.isArray(w)) return { tree: w as Predicate };
    if (typeof w !== 'string' || w.includes('{{')) return 'kept';
    const read = readSentence(w, register, fields, route.data.now);
    return read.ok ? { tree: toWhere(read.root, register, fields) } : 'kept';
  });

  const whereValue = $derived(touched ? whereNow : whereStored && whereStored !== 'kept' ? whereStored.tree : undefined);

  function onwhere(next: Predicate | undefined) {
    touched = true;
    whereNow = next;
  }

  const count = (where: Predicate | undefined) => (register ? countRows(apiBase(), register, where) : Promise.resolve(null));

  /* ── the sort ───────────────────────────────────────────────────────────
     ONE FIELD AND ONE WAY, which is the sort a person means; a stored sort of several fields is kept as written
     (`block-edit.ts` `sortKept`). The way is asked only once a field is chosen, so the part is one select at rest. */

  /** The fields a block may be sorted by: the list's, and the one it sorts by now if the list no longer has it. */
  const sortChoices = $derived.by((): { id: string; name: string }[] => {
    const out = (fields ?? []).filter((f) => !f.retired).map((f) => ({ id: f.id, name: fieldName(f) }));
    const now = draft?.sortField ?? '';
    if (now && !out.some((f) => f.id === now)) out.unshift({ id: now, name: now.replace(/_/g, ' ') });
    return out;
  });

  const ways: readonly { dir: SortDir; said: string }[] = [
    { dir: 'asc', said: blockWords.sortUp },
    { dir: 'desc', said: blockWords.sortDown },
  ];

  /* ── columns ────────────────────────────────────────────────────────────── */

  const roles = $derived(rolesFor(kind));
  const fieldName = (f: QueryField): string => f.label ?? f.id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

  function addColumn() {
    if (!draft) return;
    const used = new Set(draft.columns.map((c) => c.field));
    const next = fields?.find((f) => !f.retired && !used.has(f.id))?.id ?? '';
    draft.columns = [...draft.columns, { field: next, label: '', as: '', rest: {} }];
  }

  function removeColumn(at: number) {
    if (draft) draft.columns = draft.columns.filter((_, n) => n !== at);
  }

  /** The fields a column may name: the list's, and the one it names now if the list no longer has it. */
  const fieldChoices = (c: DraftColumn): { id: string; name: string }[] => {
    const out = (fields ?? []).filter((f) => !f.retired).map((f) => ({ id: f.id, name: fieldName(f) }));
    if (c.field && !out.some((f) => f.id === c.field)) out.unshift({ id: c.field, name: c.field.replace(/_/g, ' ') });
    return out;
  };

  /* ── the icon ───────────────────────────────────────────────────────────── */

  /* THE FIELD'S OWN WORDS, here rather than in `glyph-pick.ts`, so the sheet does not load the set's names until the
     picker is opened. */
  const ICON_WORDS = { icon: 'Icon', none: 'No icon', choose: 'Choose', done: 'Done', loading: 'Getting the icons' } as const;

  /** What the sheet will write: `undefined` while untouched, `null` for "No icon", else the glyph picked. */
  let iconNow = $state<string | null | undefined>(undefined);
  let picking = $state(false);
  const iconStored = $derived(typeof stored?.icon === 'string' && stored.icon !== '' ? stored.icon : null);
  const icon = $derived(iconNow === undefined ? iconStored : iconNow);
  /* LOADED WHEN THE PICKER OPENS, a chunk of its own the browser keeps once fetched: the set's names and groups are not
     in the sheet's chunk. */
  const picker = $derived(picking ? import('./GlyphPicker.svelte') : null);

  /** The icon's part of the patch: nothing when it is what the record holds, `null` to take it off. */
  const iconPatch = (): Patch => (iconNow === undefined || iconNow === iconStored ? {} : { icon: iconNow });

  /* ── width ──────────────────────────────────────────────────────────────── */

  const steps = $derived(stepsFor(kind, draft?.columns.length ?? block.columns.length));

  /* ── save ───────────────────────────────────────────────────────────────── */

  const firstOk = $derived(!draft || firstFits(draft.first));
  const whenOk = $derived(!draft || draft.when === null || whenFits(draft.when));
  const shortOk = $derived(!draft || (draft.shortWhere.trim() === '') === (draft.shortLabel.trim() === ''));
  let saving = $state(false);

  async function save() {
    if (!stored || !draft || saving || !firstOk || !whenOk || !shortOk) return;
    saving = true;
    const patch = { ...patchOf(stored, draft, touched ? { value: whereNow } : undefined), ...iconPatch() };
    const landed = await onsave(patch, width, area === null ? null : column);
    saving = false;
    if (landed) open = false;
  }
</script>

<Sheet bind:open {title} subtitle={every ? blockWords.everyPageEdit(every) : kindName}>
  {#if unread}
    <p class="help" role="alert">{unread}</p>
  {:else if !draft}
    <p class="help">{blockWords.reading}</p>
  {:else}
    {#if added}<p class="help">{blockWords.added}</p>{/if}

    <div class="part">
      <label class="label" for="{uid}-heading">{blockWords.heading}</label>
      <div class="field"><input id="{uid}-heading" class="field-input" type="text" bind:value={draft.heading} autocomplete="off" /></div>
      <p class="help">{blockWords.headingHelp}</p>
    </div>

    <div class="part">
      <span class="label" id="{uid}-icon">{ICON_WORDS.icon}</span>
      <div class="icon-now" role="group" aria-labelledby="{uid}-icon">
        {#if icon}
          <span class="icon-well"><Icon name={icon as IconName} size="m" /></span>
          <span class="icon-name">{icon}</span>
        {:else}
          <span class="icon-name none">{ICON_WORDS.none}</span>
        {/if}
        <span class="icon-acts">
          <Button weight="quiet" aria-expanded={picking ? 'true' : 'false'} aria-controls="{uid}-picker" onclick={() => (picking = !picking)}>
            {picking ? ICON_WORDS.done : ICON_WORDS.choose}
          </Button>
          {#if icon}
            <Button weight="bare" onclick={() => { iconNow = null; picking = false; }}>{ICON_WORDS.none}</Button>
          {/if}
        </span>
      </div>
      {#if picker}
        <div id="{uid}-picker">
          {#await picker}
            <p class="help">{ICON_WORDS.loading}</p>
          {:then m}
            <m.default value={icon} onpick={(name: string) => (iconNow = name)} />
          {:catch}
            <p class="help" role="alert">{copy.recordNotReached}</p>
          {/await}
        </div>
      {/if}
    </div>

    {#if draft.source !== null}
      <div class="part">
        {#if register}
          <label class="label" for="{uid}-shows">{blockWords.shows}</label>
          <select id="{uid}-shows" class="choose" value={register} onchange={(e) => showList(e.currentTarget.value)}>
            {#each choices as list (list.id)}
              <option value={list.id}>{blockWords.shownList(list.name)}</option>
            {/each}
          </select>
        {:else}
          <span class="label">{blockWords.shows}</span>
          <p class="kept">{blockWords.figure}</p>
        {/if}
        <p class="help">{blockWords.showsHelp}</p>
      </div>
    {/if}

    {#if register}
      <section class="part" aria-labelledby="{uid}-filter">
        <h3 class="label" id="{uid}-filter">{blockWords.filter}</h3>
        {#if fieldsFailed}
          <p class="help">{blockWords.filterNone}</p>
        {:else if !fields || whereStored === null}
          <p class="help">{blockWords.filterLoading}</p>
        {:else if whereStored === 'kept' && !touched}
          <p class="kept">{String(stored?.where ?? '')}</p>
          <p class="help">{blockWords.filterKept}</p>
        {:else}
          <QueryBuilder value={whereValue} {fields} {register} onchange={onwhere} {count} now={route.data.now} />
        {/if}
      </section>

      <section class="part" aria-labelledby="{uid}-sort">
        <h3 class="label" id="{uid}-sort">{blockWords.sort}</h3>
        {#if draft.sortKept}
          <p class="kept">{sortSaid(stored?.order)}</p>
          <p class="help">{blockWords.sortKept}</p>
        {:else if fields}
          <label class="sr" for="{uid}-sort-field">{blockWords.sort}</label>
          <select id="{uid}-sort-field" class="choose" bind:value={draft.sortField}>
            <option value="">{blockWords.sortNone}</option>
            {#each sortChoices as f (f.id)}
              <option value={f.id}>{f.name}</option>
            {/each}
          </select>
          {#if draft.sortField}
            <Segmented role="group" aria-label={blockWords.sortDir}>
              {#each ways as way (way.dir)}
                <button
                  type="button"
                  class="segment"
                  data-on={draft.sortDir === way.dir ? '' : undefined}
                  aria-pressed={draft.sortDir === way.dir ? 'true' : 'false'}
                  onclick={() => draft && (draft.sortDir = way.dir)}>{way.said}</button
                >
              {/each}
            </Segmented>
          {/if}
          <p class="help">{blockWords.sortHelp}</p>
        {:else}
          <p class="help">{fieldsFailed ? blockWords.sortUnread : blockWords.filterLoading}</p>
        {/if}
      </section>

      <section class="part" aria-labelledby="{uid}-columns">
        <h3 class="label" id="{uid}-columns">{blockWords.columns}</h3>
        <p class="help">{blockWords.columnsHelp}</p>
        <ol class="columns">
          {#each draft.columns as col, n (n)}
            <li class="column">
              <label class="sr" for="{uid}-f{n}">{blockWords.field}</label>
              <select id="{uid}-f{n}" class="choose" bind:value={col.field}>
                {#each fieldChoices(col) as f (f.id)}
                  <option value={f.id}>{f.name}</option>
                {/each}
              </select>
              <label class="sr" for="{uid}-l{n}">{blockWords.label}</label>
              <div class="field column-label">
                <input id="{uid}-l{n}" class="field-input" type="text" bind:value={col.label} placeholder={blockWords.label} autocomplete="off" />
              </div>
              <label class="sr" for="{uid}-r{n}">{blockWords.role}</label>
              <select id="{uid}-r{n}" class="choose" bind:value={col.as}>
                <option value="">{blockWords.rolePlain}</option>
                {#each roles as role (role)}
                  <option value={role}>{blockWords.roles[role] ?? role}</option>
                {/each}
              </select>
              <button type="button" class="icon-btn" onclick={() => removeColumn(n)} aria-label={blockWords.removeColumn(n + 1)}>
                <Icon name="close" size="s" />
              </button>
            </li>
          {/each}
        </ol>
        <Button weight="quiet" onclick={addColumn}><Icon name="plus" size="s" />{blockWords.addColumn}</Button>
      </section>
    {/if}

    {#if form.flags.length || form.first || form.short}
      <section class="part" aria-labelledby="{uid}-form">
        <h3 class="label" id="{uid}-form">{blockWords.form}</h3>
        {#each form.flags as flag (flag)}
          <label class="check">
            <input type="checkbox" checked={draft.flags[flag] === true} onchange={(e) => draft && (draft.flags[flag] = e.currentTarget.checked)} />
            <span>{blockWords.flags[flag]?.[kind] ?? flag}</span>
          </label>
        {/each}
        {#if form.first}
          <label class="label" for="{uid}-first">{blockWords.first}</label>
          <div class="field narrow" data-bad={firstOk ? undefined : ''}>
            <input id="{uid}-first" class="field-input" type="text" inputmode="numeric" bind:value={draft.first} autocomplete="off" aria-describedby="{uid}-first-help" />
          </div>
          <p class="help" id="{uid}-first-help" data-bad={firstOk ? undefined : ''}>{firstOk ? blockWords.firstHelp : blockWords.firstBad}</p>
        {/if}
        {#if form.short}
          <label class="label" for="{uid}-sw">{blockWords.shortWhere}</label>
          <div class="field"><input id="{uid}-sw" class="field-input" type="text" bind:value={draft.shortWhere} autocomplete="off" /></div>
          <label class="label" for="{uid}-sl">{blockWords.shortLabel}</label>
          <div class="field"><input id="{uid}-sl" class="field-input" type="text" bind:value={draft.shortLabel} autocomplete="off" /></div>
          <p class="help" data-bad={shortOk ? undefined : ''}>{blockWords.shortHelp}</p>
        {/if}
      </section>
    {/if}

    <div class="part">
      {#if draft.when === null}
        <span class="label">{blockWords.when}</span>
        <p class="help">{blockWords.whenKept}</p>
      {:else}
        <label class="label" for="{uid}-when">{blockWords.when}</label>
        <div class="field"><input id="{uid}-when" class="field-input" type="text" bind:value={draft.when} autocomplete="off" /></div>
        <!-- AND THE ONE TEST A FIGURE WITH NO VALUE MEETS, offered as a choice so nobody has to know its words. -->
        <Button weight="quiet" disabled={whenNothing(draft.when) === null} onclick={() => { const said = whenNothing(draft!.when ?? ''); if (said) draft!.when = said; }}>{blockWords.whenNothing}</Button>
        <p class="help" data-bad={whenOk ? undefined : ''}>{whenOk ? blockWords.whenHelp : blockWords.whenBad}</p>
      {/if}
    </div>

    {#if draft.source !== null}
      <div class="part">
        <label class="label" for="{uid}-empty">{blockWords.empty}</label>
        <div class="field"><input id="{uid}-empty" class="field-input" type="text" bind:value={draft.empty} autocomplete="off" /></div>
        <p class="help">{blockWords.emptyHelp}</p>
      </div>
    {/if}

    <div class="part">
      <span class="label" id="{uid}-width">{blockWords.width}</span>
      <Segmented role="group" aria-labelledby="{uid}-width">
        {#each steps as step (step)}
          <button type="button" class="segment" data-on={width === step ? '' : undefined} aria-pressed={width === step ? 'true' : 'false'} onclick={() => (width = step)}>
            {spanLabel(step)}
          </button>
        {/each}
        {#if !steps.includes(width)}
          <span class="segment" data-on aria-current="true">{spanLabel(width)}</span>
        {/if}
      </Segmented>
    </div>

    {#if area !== null}
      <div class="part">
        <span class="label" id="{uid}-area">{blockWords.area}</span>
        <Segmented role="group" aria-labelledby="{uid}-area">
          <button type="button" class="segment" data-on={column === 'main' ? '' : undefined} aria-pressed={column === 'main' ? 'true' : 'false'} onclick={() => (column = 'main')}>
            {blockWords.areaMain}
          </button>
          <button type="button" class="segment" data-on={column === 'rail' ? '' : undefined} aria-pressed={column === 'rail' ? 'true' : 'false'} onclick={() => (column = 'rail')}>
            {blockWords.areaRail}
          </button>
        </Segmented>
      </div>
    {/if}
  {/if}

  {#snippet footer()}
    <div class="foot">
      <Button weight="bare" onclick={() => (open = false)}>{blockWords.cancel}</Button>
      <Button weight="primary" disabled={!draft || saving || !firstOk || !whenOk || !shortOk} onclick={() => void save()}>
        <Icon name="check" size="s" />{blockWords.save}
      </Button>
    </div>
  {/snippet}
</Sheet>

<style>
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .part + .part {
    margin-block-start: var(--sp-5);
  }

  /* A FIELD'S LABEL SITS ABOVE IT in the meta step and the second ink. */
  .label {
    margin: 0;
    color: var(--ink-2);
    font-family: var(--font-ui);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .help {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .help[data-bad] {
    color: var(--red);
  }

  .field[data-bad] {
    border-color: var(--red);
  }

  /* What the sheet keeps without a control for it, drawn as the words the record holds. */
  .kept {
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-pop);
    color: var(--ink-2);
    font-size: var(--fs-meta);
    overflow-wrap: anywhere;
  }

  .choose {
    min-block-size: var(--ctl-h);
    min-inline-size: 0;
    font-size: var(--fs-body);
  }

  .narrow {
    inline-size: 12ch;
  }

  .columns {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* ONE COLUMN, ONE LINE: which field, what it is called, and what it is on a card, with its remove at the end. */
  .column {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-2);
  }

  .column-label {
    min-inline-size: 0;
  }

  .check {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--ink);
    font-size: var(--fs-body);
    cursor: pointer;
  }

  .icon-btn {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: none;
    border: 0;
    border-radius: var(--r-pill, var(--r-ctl));
    color: var(--ink-3);
    cursor: pointer;
    transition:
      background var(--d-state) var(--ease-out),
      color var(--d-state) var(--ease-out);
  }

  .icon-btn:hover {
    background: var(--soft-fill, var(--hover));
    color: var(--ink);
  }

  /* THE ICON THE BLOCK WEARS, its name beside it, and the two ways to change it at the end of the line. */
  .icon-now {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
  }

  .icon-well {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    background: var(--tile-2);
    border-radius: var(--r-pill, var(--r-ctl));
    color: var(--ink);
  }

  .icon-name {
    color: var(--ink);
    font-size: var(--fs-body);
  }

  .icon-name.none {
    color: var(--ink-3);
  }

  .icon-acts {
    display: flex;
    gap: var(--sp-2);
    margin-inline-start: auto;
  }

  .foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  /* A LABEL FOR A SCREEN READER ONLY, where the column's own controls say what they are by their place in the row. */
  .sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (pointer: coarse) {
    .icon-btn {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }
</style>
