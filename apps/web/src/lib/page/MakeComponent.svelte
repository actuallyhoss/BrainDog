<!--
  "MAKE A COMPONENT": a line about something to be drawn ("payroll as a calendar", "cash for the next 90 days as a
  line chart"), composed from BrainDog's own blocks (`compose.ts`) into one block of the page's declaration; or, on
  Draw it, a component of its own, written or pasted as code or asked of Slash (`draw.ts`), drawn in its sandbox.

  THE RULES COMPOSE IT FIRST, and the block is handed back to arranging (`Arrange.svelte`), which draws it on the page
  as an unsaved draft with Keep, Put on shelf and Throw away. Nothing is written until Done, so a draft thrown away
  leaves no trace. Only a line the rules cannot read goes to the model, through the page sheet's own Ask
  (`AskPage.svelte`), which has its own plan cap and files a draft rather than writing.

  DRAW IT TAKES THE SAME WAY BACK. The code is previewed here, in the sandbox the page draws it in, over the rows the
  record would hand it (`previewRows`), and Use it hands arranging a `drawn` block as a draft like any composed one.
  Code the record would refuse is said in the record's own sentence and cannot be used. Ask Slash sends the line to the
  page sheet's Ask with the design book's draw rules named, which files a draft too.

  THE LISTS COME FROM WHAT THE RECORD DECLARES (`REGISTERS`), never from a name written here.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { drawnData, drawnFault, type DrawnData } from 'braindog-render';
  import { REGISTERS } from '$lib/record/held.ts';
  import Button from '$lib/ui/Button.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { apiBase } from '../at.ts';
  import AskPage from './AskPage.svelte';
  import DrawnFrame from './DrawnFrame.svelte';
  import { composeOf, composeWords as words, type Composed, type ComposeList } from './compose.ts';
  import { DRAW_FIELDS_MOST, designFix, drawAsk, drawnBlock, drawnDraft, drawWords, previewRows, startCode, startFields } from './draw.ts';

  let {
    open = $bindable(false),
    slug,
    current,
    start = '',
    ondraft,
    onmodel,
  }: {
    open?: boolean | undefined;
    slug: string;
    /** The list the page is about, for a line that names none. */
    current: string | null;
    /** A line to draw on opening, from Slash; empty opens blank. */
    start?: string | undefined;
    /** A composed block, to be drawn on the page as a draft. */
    ondraft: (composed: Composed) => void;
    /** The model's draft was kept, so the page behind reads itself again. */
    onmodel: () => void | Promise<void>;
  } = $props();

  let text = $state('');
  let fix = $state('');
  let phase = $state<'ask' | 'model'>('ask');
  /** Which way it is made: said as a line and composed, or drawn as code. */
  let way = $state<'say' | 'draw'>('say');
  /** What the model is asked, once it is asked. */
  let asking = $state('');
  const model = $derived(page.data.slash === true);

  const lists = $derived<ComposeList[]>(
    Object.values(REGISTERS).map((r) => ({
      id: r.id,
      name: r.name,
      one: r.one,
      title: r.title,
      fields: r.fields.map((f) => ({ id: f.id, type: f.type, label: f.label, values: f.values })),
    })),
  );

  function run() {
    const line = text.trim();
    if (line === '') return;
    fix = '';
    if (lists.length === 0) return void (fix = words.noLists);
    const got = composeOf({ text: line, lists, current, now: page.data.now ?? Date.now() });
    /* A COMPOSED BLOCK PASSES THE DESIGN CHECK BEFORE IT IS DRAWN ON THE PAGE, as a drawn one does (`designFix`). */
    const design = got ? designFix(got.block) : null;
    if (design) fix = design;
    else if (got) {
      ondraft(got);
      open = false;
    } else if (model) {
      asking = `Add a block to this page: ${line}`;
      phase = 'model';
    } else fix = words.cannot;
  }

  /* ── draw it ─────────────────────────────────────────────────────────── */

  let name = $state('');
  let listId = $state<string | null>(null);
  let fields = $state<string[]>([]);
  let code = $state('');
  /** The code as the preview draws it: the last that stood still for a moment, so typing does not redraw the frame. */
  let settled = $state('');
  let preview = $state<DrawnData>(drawnData({ columns: [], rows: [] }));
  let previewFix = $state('');

  const list = $derived(lists.find((l) => l.id === listId) ?? null);
  const fault = $derived(code.trim() === '' ? null : drawnFault(code));

  function beginDraw() {
    way = 'draw';
    if (code !== '') return;
    listId = current ?? lists[0]?.id ?? null;
    fields = startFields(lists.find((l) => l.id === listId) ?? null);
    code = startCode();
    settled = code;
    name = text.trim();
  }

  function pickList(id: string) {
    listId = id === '' ? null : id;
    fields = startFields(list);
  }

  function toggle(field: string) {
    fields = fields.includes(field) ? fields.filter((f) => f !== field) : fields.length < DRAW_FIELDS_MOST ? [...fields, field] : fields;
  }

  /* THE CODE SETTLES A MOMENT AFTER THE LAST KEY, and only code the rules admit is previewed. */
  $effect(() => {
    const now = code;
    if (way !== 'draw' || fault !== null) return;
    const wait = setTimeout(() => (settled = now), 400);
    return () => clearTimeout(wait);
  });

  /* THE ROWS THE RECORD WOULD HAND IT, read again when the list or the fields change. */
  $effect(() => {
    if (way !== 'draw' || !open) return;
    const block = drawnBlock({ name: '', list: listId, fields, code: settled || ' ' });
    const called = list?.name ?? null;
    let live = true;
    void previewRows(apiBase(), block, called).then((got) => {
      if (!live) return;
      if ('fix' in got) previewFix = got.fix;
      else {
        previewFix = '';
        preview = got.data;
      }
    });
    return () => {
      live = false;
    };
  });

  function useIt() {
    const got = drawnDraft({ name, list, fields, code });
    if ('fix' in got) return void (fix = got.fix);
    ondraft(got);
    open = false;
  }

  function askSlash() {
    const what = name.trim() || text.trim();
    if (what === '') return void (fix = drawWords.askHint);
    asking = drawAsk(list ? `${what}, over ${list.name}` : what);
    phase = 'model';
  }

  /* EACH OPENING STARTS BLANK. */
  $effect(() => {
    if (!open) return;
    text = start;
    fix = '';
    phase = 'ask';
    way = 'say';
    code = '';
    settled = '';
    previewFix = '';
    if (start.trim() !== '') queueMicrotask(run);
  });
</script>

<Sheet bind:open title={words.title}>
  <div class="mc">
    {#if phase === 'model'}
      <p class="mc-note">{words.asking}</p>
      <AskPage page={slug} {model} ask={asking} onkept={onmodel} />
    {:else}
      <Segmented role="group" aria-label={words.title}>
        <button type="button" class="segment" data-on={way === 'say' ? '' : undefined} aria-pressed={way === 'say'} onclick={() => (way = 'say')}>{drawWords.say}</button>
        <button type="button" class="segment" data-on={way === 'draw' ? '' : undefined} aria-pressed={way === 'draw'} onclick={beginDraw}>{drawWords.draw}</button>
      </Segmented>
      {#if way === 'say'}
        <form
          class="mc"
          onsubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <label class="mc-note" for="make-component-line">{words.hint}</label>
          <input id="make-component-line" class="mc-field" type="text" autocomplete="off" placeholder={words.field} bind:value={text} />
          {#if fix !== ''}<p class="mc-note" role="alert">{fix}</p>{/if}
          <div class="mc-row">
            <Button weight="primary" type="submit" disabled={text.trim() === ''}>{words.go}</Button>
          </div>
        </form>
      {:else}
        <form
          class="mc"
          onsubmit={(e) => {
            e.preventDefault();
            useIt();
          }}
        >
          <label class="mc-label" for="draw-name">{drawWords.name}</label>
          <input id="draw-name" class="mc-field" type="text" autocomplete="off" placeholder={drawWords.nameField} bind:value={name} />
          {#if lists.length > 0}
            <label class="mc-label" for="draw-list">{drawWords.fields}</label>
            <select id="draw-list" class="mc-field" value={listId ?? ''} onchange={(e) => pickList((e.currentTarget as HTMLSelectElement).value)}>
              {#each lists as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
            </select>
            {#if list}
              <div class="mc-chips" role="group" aria-label={drawWords.fields}>
                {#each list.fields as f (f.id)}
                  <button type="button" class="mc-chip" aria-pressed={fields.includes(f.id)} onclick={() => toggle(f.id)}>{f.label ?? f.id}</button>
                {/each}
              </div>
            {/if}
          {/if}
          <label class="mc-label" for="draw-code">{drawWords.code}</label>
          <p class="mc-note">{drawWords.codeHint}</p>
          <textarea id="draw-code" class="mc-field mc-code" rows="12" spellcheck="false" autocomplete="off" bind:value={code}></textarea>
          {#if fault}<p class="mc-note" role="alert">{drawWords.bad(fault)}</p>{/if}
          <p class="mc-label">{drawWords.preview}</p>
          <div class="mc-preview">
            {#if previewFix !== ''}
              <p class="mc-note" role="status">{previewFix}</p>
            {:else if settled.trim() === ''}
              <p class="mc-note">{drawWords.previewNone}</p>
            {:else}
              <DrawnFrame code={settled} data={preview} title={name.trim() || drawWords.untitled} />
            {/if}
          </div>
          {#if fix !== ''}<p class="mc-note" role="alert">{fix}</p>{/if}
          <div class="mc-row">
            <Button weight="primary" type="submit" disabled={code.trim() === '' || fault !== null}>{drawWords.use}</Button>
            {#if model}<Button weight="quiet" onclick={askSlash}>{drawWords.ask}</Button>{/if}
          </div>
        </form>
      {/if}
    {/if}
  </div>
</Sheet>

<style>
  .mc {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .mc-note {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .mc-label {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .mc-row,
  .mc-chips {
    display: flex;
    gap: var(--sp-2);
    flex-wrap: wrap;
  }

  .mc-chip {
    padding: var(--sp-1) var(--sp-3);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-ctl);
    background: transparent;
    color: var(--ink-2);
    font: inherit;
    font-size: var(--fs-meta);
    cursor: pointer;
  }

  .mc-chip[aria-pressed='true'] {
    background: var(--tile-2);
    border-color: transparent;
    color: var(--ink);
  }

  .mc-field {
    inline-size: 100%;
    padding: var(--sp-3);
    background: var(--tile-2);
    border: 1px solid transparent;
    border-radius: var(--r-pop);
    color: var(--ink);
    font-family: var(--font-ui);
    font-size: var(--fs-body);
  }

  .mc-code {
    font-family: var(--font-mono);
    font-size: var(--fs-meta);
    resize: vertical;
    white-space: pre;
    overflow-x: auto;
  }

  .mc-preview {
    padding: var(--sp-3);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-pop);
    min-inline-size: 0;
  }
</style>
