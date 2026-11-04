<!--
  THE INSPECTOR (widgets plan §5.4, batch W4): tap a widget while editing, or its ⋯, and it opens as one sentence with
  parts you can press, like an automation: "Show money out for Food over this month as a list." On the laptop the
  drawer at the end, on the phone the bottom sheet (`Sheet.svelte`).

  WHAT IT HOLDS, TOP TO BOTTOM: the widget drawn as it will be, read by the record as it changes; its size, the five
  pictures; the sentence, each part offering the record's own choices (its categories, its projects, its windows), never
  a field's id; Show as, the kinds that can draw the same rows; its name, edited in place; Hide on phone; Change it by
  saying it, which tries the rules (`change-this.ts`) and asks the model only when they cannot (`widgetCompose` with
  `from`), saying what that cost; and Remove.

  NOTHING IS WRITTEN UNTIL DONE. Done hands the board what changed, the block through `onchange(key, block)` and the size
  through `onsize(key, size)`, and the board writes one version with Undo (the widgets-board lane's `boardSteps`). Closing
  without Done changes nothing.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { kindsFor, WIDGET_SIZES, type WidgetSize } from 'braindog-render';
  import { apiBase } from '$lib/at.ts';
  import { homeCurrency } from '$lib/record/api.ts';
  import { REGISTERS } from '$lib/record/held.ts';
  import { listName } from '$lib/record/names.ts';
  import { schemaOf, withPatch } from '$lib/record/page-write.ts';
  import { askedOf, type AskField } from '$lib/page/change-this.ts';
  import Sheet from '$lib/ui/Sheet.svelte';
  import Button from '$lib/ui/Button.svelte';
  import WidgetTile from './WidgetTile.svelte';
  import { composeOn } from './compose.ts';
  import { sheetWords } from './widget-read.ts';
  import { WINDOWS, dayFieldOf, kindSaid, orderChoices, sentenceOf, withChoice, withOrder, withWindow, type Block, type FieldSaid, type Part, type WindowId } from './sentence.ts';

  let {
    open = $bindable(false),
    widget,
    sizes = [...WIDGET_SIZES],
    phoneHidden = false,
    onchange,
    onsize,
    onremove,
    onhidephone,
    home = homeCurrency(),
  }: {
    open?: boolean;
    /** The widget on the board: its key, its block as stored, and its size. */
    widget: { key: string; block: Block; size: WidgetSize };
    /** The sizes its kind can take (`kinds/sizes.ts`); the rest are greyed with a reason. */
    sizes?: readonly WidgetSize[];
    phoneHidden?: boolean;
    onchange: (key: string, block: Block) => unknown;
    onsize?: ((key: string, size: WidgetSize) => unknown) | undefined;
    onremove?: ((key: string) => unknown) | undefined;
    onhidephone?: ((key: string, hidden: boolean) => unknown) | undefined;
    home?: string | null;
  } = $props();

  const words = {
    size: 'Size',
    what: 'What it shows',
    showAs: 'Show as',
    name: 'Name',
    phone: 'Hide on phone',
    say: 'Change it by saying it',
    sayHint: 'Newest first. Only the last 30 days. Top 5.',
    /** The same, for a widget of figures, where order and a top few say nothing. */
    sayHintFigures: 'Add what is owed to you. Only this month.',
    sayGo: 'Change it',
    saying: 'Reading it',
    done: 'Done',
    remove: 'Remove from Today',
    choose: (what: string) => `Choose ${what}`,
    anyOf: 'Any',
    readsNone: 'This widget reads figures, so it has nothing to filter.',
  } as const;

  let draft = $state<Block>({});
  let size = $state<WidgetSize>('wide');
  let hidePhone = $state(false);
  let fields = $state<FieldSaid[]>([]);
  /* THE RECORD'S SENTENCE WHEN IT WOULD NOT DRAW THE WIDGET AS IT NOW STANDS (`WidgetTile`'s read). */
  let readingFix = $state<string | null>(null);
  let said = $state('');
  let saying = $state(false);
  let sayFix = $state<string | null>(null);
  let cost = $state<string | null>(null);
  /** The part whose choices are open, and its choices. */
  let menu = $state<{ part: Part; options: { label: string; value: string | null }[] } | null>(null);

  const register = $derived(typeof draft.source === 'string' && draft.source.startsWith('register.') ? draft.source.slice('register.'.length) : null);
  const parts = $derived(sentenceOf(draft, register ? listName(register) : null, fields));
  const columns = $derived(
    (Array.isArray(draft.columns) ? (draft.columns as Record<string, unknown>[]) : []).flatMap((c) =>
      typeof c.field === 'string' ? [{ field: c.field, type: fields.find((f) => f.id === c.field)?.type }] : [],
    ),
  );
  const kinds = $derived(kindsFor(String(draft.kind ?? ''), columns) as string[]);
  /* SHOW AS IS OFFERED ONLY WHERE THERE IS ANOTHER WAY TO DRAW IT: "as figures" opened a menu of itself (audit, 14). */
  const otherKinds = $derived([...new Set(kinds)].filter((k) => k !== draft.kind));
  const changed = $derived(JSON.stringify(draft) !== JSON.stringify(widget.block));

  /* OPENED: the widget as stored, its list's fields, and the record's reading of it. */
  $effect(() => {
    if (!open) return;
    untrack(() => {
      draft = JSON.parse(JSON.stringify(widget.block)) as Block;
      size = widget.size;
      hidePhone = phoneHidden;
      said = '';
      sayFix = null;
      cost = null;
      menu = null;
      fields = [];
      if (register !== null)
        void schemaOf(apiBase(), register).then((d) => {
          fields = ((d?.fields ?? []) as FieldSaid[]).map((f) => ({ id: f.id, type: f.type, values: f.values, to: (f as { to?: string }).to, label: (f as { label?: string }).label }));
        });
    });
  });


  /** The choices a pressed part offers, in the record's words. */
  async function press(part: Part) {
    if (part.kind === 'window') {
      menu = { part, options: WINDOWS.map((w) => ({ label: w.say, value: w.id })) };
      return;
    }
    if (part.kind === 'order') {
      menu = { part, options: orderChoices(fields).map((o) => ({ label: o.label, value: `${o.field} ${o.dir}` })) };
      return;
    }
    if (part.kind === 'as') {
      menu = { part, options: [...new Set([part.to, ...kinds])].map((k) => ({ label: kindSaid(k), value: k })) };
      return;
    }
    if (part.kind === 'choice') {
      const f = fields.find((x) => x.id === part.field);
      let options: string[] = [...(f?.values ?? [])];
      if (f?.type === 'ref' && f.to) options = await titlesOf(f.to);
      menu = { part, options: [...options.map((o) => ({ label: o, value: o })), { label: words.anyOf, value: null }] };
      return;
    }
    if (part.kind === 'list' && register !== null) {
      /* A LIST WIDGET WITH NO WINDOW YET IS OFFERED ONE, on its list's day. */
      const day = dayFieldOf(fields);
      if (day !== null) menu = { part: { kind: 'window', text: '', id: 'any', field: day }, options: WINDOWS.map((w) => ({ label: w.say, value: w.id })) };
    }
  }

  /** The names of a linked list's things, the newest moved first. */
  async function titlesOf(list: string): Promise<string[]> {
    try {
      const { createClient } = await import('@braindog/client');
      const title = REGISTERS[list]?.title ?? 'name';
      const out = await createClient({ base: apiBase() }).list({ register: list, limit: 40, fields: [title] });
      if (!out.ok) return [];
      const names = (out.value.rows as { fields?: Record<string, unknown> }[]).flatMap((r) => (typeof r.fields?.[title] === 'string' ? [r.fields[title] as string] : []));
      return [...new Set(names)].sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  function choose(value: string | null) {
    if (menu === null) return;
    const p = menu.part;
    if (p.kind === 'window') draft = withWindow(draft, (value ?? 'any') as WindowId, p.field);
    else if (p.kind === 'choice') draft = withChoice(draft, p.field, value);
    else if (p.kind === 'as' && value !== null && value !== draft.kind) draft = { ...draft, kind: value };
    else if (p.kind === 'order' && value !== null) {
      const [field, dir] = value.split(' ');
      draft = withOrder(draft, field!, dir === 'asc' ? 'asc' : 'desc');
    }
    menu = null;
  }

  /** Change it by saying it: the rules first, the model only when they cannot. */
  async function sayIt() {
    const line = said.trim();
    if (line === '' || saying) return;
    saying = true;
    sayFix = null;
    try {
      const askFields: AskField[] = fields.map((f) => ({ id: f.id, type: f.type, values: f.values, label: f.label }));
      const ruled = askedOf({ text: line, block: draft as never, register, fields: askFields, kinds, kindNames: KIND_NAMES, now: Date.now() });
      if (ruled !== null) {
        draft = withPatch(draft as never, ruled.patch, kinds) as Block;
        said = '';
        return;
      }
      /* "ONLY TALABAT": a name one of its linked lists holds, as that choice, before the model is asked. */
      const named = await namedChoice(line);
      if (named !== null) {
        draft = withChoice(draft, named.field, named.value);
        said = '';
        return;
      }
      const made = await composeOn(apiBase(), line, draft);
      if ('fix' in made) {
        sayFix = made.fix;
        return;
      }
      const { draft: _mark, ...block } = made.block;
      draft = block;
      cost = made.cost ?? null;
      said = '';
    } finally {
      saying = false;
    }
  }
  /** The first of the linked lists' names the sentence says as a whole word, longest first, and the field it is a choice on. */
  async function namedChoice(line: string): Promise<{ field: string; value: string } | null> {
    const text = line.replace(/^(only|just)\s+/iu, '').replace(/\s+only$/iu, '').trim();
    if (text === '') return null;
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    for (const f of fields.filter((x) => x.type === 'ref' && x.to)) {
      const names = (await titlesOf(f.to!)).filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
      const hit = names.find((n) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}($|[^\\p{L}\\p{N}])`, 'iu').test(text));
      if (hit) return { field: f.id, value: hit };
    }
    return null;
  }
  const KIND_NAMES = Object.fromEntries(Object.keys({ table: 1, todo: 1, timeline: 1, cards: 1, calendar: 1, bar: 1, heat: 1, board: 1, lanes: 1 }).map((k) => [k, kindSaid(k)]));

  async function done() {
    if (changed) await onchange(widget.key, JSON.parse(JSON.stringify(draft)) as Block);
    if (size !== widget.size) await onsize?.(widget.key, size);
    if (hidePhone !== phoneHidden) await onhidephone?.(widget.key, hidePhone);
    open = false;
  }

  const title = $derived(typeof draft.heading === 'string' && draft.heading !== '' ? draft.heading : sheetWords.title);
</script>

<Sheet bind:open {title} caret={false} wide>
  <div class="in">
    <div class="in-stage">
      <!-- THE TILE ITSELF, as the board draws it (audit of 30 October, 14), changing as the sentence changes. -->
      {#if open}<WidgetTile block={draft} {size} onread={(fix) => (readingFix = fix)} />{/if}
      {#if readingFix}<p class="in-fix" role="status">{readingFix}</p>{/if}
    </div>

    <fieldset class="in-sizes">
      <legend>{words.size}</legend>
      <div class="in-size-row">
        {#each WIDGET_SIZES as s (s)}
          {@const can = sizes.includes(s)}
          <button type="button" class="in-size" data-size={s} aria-pressed={size === s} disabled={!can} title={can ? sheetWords.sizes[s] : sheetWords.sizeCannot(sheetWords.sizes[s])} onclick={() => (size = s)}>
            <span class="in-size-box" aria-hidden="true"><span class="in-size-pic"></span></span>
            <span>{sheetWords.sizes[s]}</span>
          </button>
        {/each}
      </div>
    </fieldset>

    <section class="in-what" aria-label={words.what}>
      <p class="in-h">{words.what}</p>
      <p class="in-sentence">
        {#each parts as p, i (i)}
          {#if p.kind === 'words' || p.kind === 'more' || (p.kind === 'as' && otherKinds.length === 0)}<span class="in-word" data-said={p.kind === 'as' ? '' : undefined}>{p.text}</span>{' '}
          {:else}<button type="button" class="in-part" aria-haspopup="menu" aria-expanded={menu !== null && menu.part.kind === p.kind && menu.part.text === p.text} onclick={() => void press(p)}>{p.text}</button>{' '}{/if}
        {/each}
      </p>
      {#if menu}
        <div class="in-menu" role="menu" aria-label={words.choose(menu.part.text || 'a window')}>
          {#each menu.options as o (o.label)}
            <button type="button" role="menuitem" class="in-opt" onclick={() => choose(o.value)}>{o.label}</button>
          {/each}
        </div>
      {/if}
      {#if otherKinds.length > 0}
        <div class="in-as" role="group" aria-label={words.showAs}>
          <span class="in-h">{words.showAs}</span>
          {#each [...new Set([String(draft.kind), ...kinds])] as k (k)}
            <button type="button" class="in-chip" aria-pressed={draft.kind === k} onclick={() => (draft = { ...draft, kind: k })}>{kindSaid(k)}</button>
          {/each}
        </div>
      {/if}
    </section>

    <label class="in-field">
      <span class="in-h">{words.name}</span>
      <input value={typeof draft.heading === 'string' ? draft.heading : ''} oninput={(e) => (draft = { ...draft, heading: (e.currentTarget as HTMLInputElement).value })} maxlength="60" />
    </label>

    {#if onhidephone}
      <label class="in-check">
        <input type="checkbox" bind:checked={hidePhone} />
        <span>{words.phone}</span>
      </label>
    {/if}

    <form class="in-field" onsubmit={(e) => (e.preventDefault(), void sayIt())}>
      <label class="in-h" for="in-say">{words.say}</label>
      <div class="in-say">
        <input id="in-say" bind:value={said} placeholder={draft.kind === 'stat' || draft.kind === 'kpis' ? words.sayHintFigures : words.sayHint} autocomplete="off" />
        <Button type="submit" size="sm" disabled={saying || said.trim() === ''}>{saying ? words.saying : words.sayGo}</Button>
      </div>
      {#if sayFix}<p class="in-fix" role="status">{sayFix}</p>{/if}
      {#if cost}<p class="in-cost">{cost}</p>{/if}
    </form>

    <div class="in-foot">
      {#if onremove}<Button weight="bare" tone="bad" onclick={() => void (onremove?.(widget.key), (open = false))}>{words.remove}</Button>{/if}
      <Button weight="primary" onclick={() => void done()}>{words.done}</Button>
    </div>
  </div>
</Sheet>

<style>
  .in {
    display: grid;
    gap: var(--sp-4, 16px);
  }

  .in-stage {
    --u: 132px;
    display: grid;
    place-items: center;
    gap: var(--sp-2);
    padding: calc(20px * var(--dense, 1)) var(--sp-3);
    background: var(--page);
    border-radius: 20px;
  }

  .in-h {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .in-sizes {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .in-sizes legend {
    margin-block-end: var(--sp-2);
    padding: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semi);
  }

  .in-size-row {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: calc(6px * var(--dense, 1));
  }

  .in-size {
    display: grid;
    justify-items: center;
    gap: calc(6px * var(--dense, 1));
    padding: calc(10px * var(--dense, 1)) 2px var(--sp-2);
    border: 0;
    border-radius: 10px;
    background: var(--tile-2, var(--page));
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-cap);
    font-weight: var(--fw-medium);
    cursor: pointer;
  }

  .in-size[aria-pressed='true'] {
    background: var(--ink);
    color: var(--tile);
  }

  .in-size:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .in-size-box {
    display: grid;
    place-items: center;
    block-size: 24px;
  }

  .in-size-pic {
    display: block;
    inline-size: 12px;
    block-size: 12px;
    border: 1.5px solid currentColor;
    border-radius: 3px;
  }

  .in-size[data-size='wide'] .in-size-pic {
    inline-size: 24px;
  }

  .in-size[data-size='tall'] .in-size-pic {
    block-size: 24px;
  }

  .in-size[data-size='large'] .in-size-pic {
    inline-size: 24px;
    block-size: 24px;
  }

  .in-size[data-size='full'] .in-size-pic {
    inline-size: 32px;
  }

  .in-what {
    display: grid;
    gap: calc(10px * var(--dense, 1));
  }

  /* THE SENTENCE READS AS ONE: its words plain, its parts underlined in the accent's ink, each a button. */
  /* THE SENTENCE IS SET AS THE PANEL'S OWN TEXT, its parts told by their chip, not by a size of its own (audit, 14). */
  .in-sentence {
    margin: 0;
    font-size: var(--fs-body);
    line-height: 1.9;
  }

  .in-word[data-said] {
    color: var(--ink);
    font-weight: var(--fw-semi);
  }

  .in-word {
    color: var(--ink-2);
  }

  .in-part {
    padding: 1px calc(6px * var(--dense, 1));
    border: 0;
    border-radius: 7px;
    background: var(--tile-2, var(--page));
    color: var(--ink);
    font: inherit;
    font-weight: var(--fw-semi);
    text-decoration: underline dotted var(--ink-3);
    text-underline-offset: 4px;
    cursor: pointer;
  }

  .in-part:hover,
  .in-part[aria-expanded='true'] {
    background: var(--hover);
  }

  .in-part:focus-visible,
  .in-opt:focus-visible,
  .in-chip:focus-visible {
    outline: 2px solid var(--focus, var(--ink));
    outline-offset: 2px;
  }

  .in-menu {
    display: flex;
    flex-wrap: wrap;
    gap: calc(6px * var(--dense, 1));
    padding: var(--sp-2);
    border-radius: 12px;
    background: var(--page);
  }

  .in-opt,
  .in-chip {
    padding: calc(6px * var(--dense, 1)) calc(10px * var(--dense, 1));
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    background: var(--tile);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .in-chip[aria-pressed='true'] {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--tile);
  }

  .in-as {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(6px * var(--dense, 1));
  }

  .in-as .in-h {
    margin-inline-end: var(--sp-1);
  }

  .in-field {
    display: grid;
    gap: calc(6px * var(--dense, 1));
  }

  .in-field input,
  .in-say input {
    block-size: 36px;
    min-inline-size: 0;
    padding-inline: 10px;
    border: 1px solid var(--rule-strong);
    border-radius: 10px;
    background: var(--tile);
    color: var(--ink);
    font: inherit;
  }

  .in-say {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--sp-2);
    align-items: center;
  }

  .in-check {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-meta);
  }

  .in-fix {
    margin: 0;
    color: var(--warn, var(--ink-2));
    font-size: var(--fs-meta);
  }

  .in-cost {
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-cap);
  }

  .in-foot {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    padding-block-start: var(--sp-1);
  }
</style>
