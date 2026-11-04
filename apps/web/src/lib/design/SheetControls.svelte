<!--
  The look sheet called "Controls and lists": every control the product has, in every state it takes, drawn by the
  product's own parts (decision 2 of the experience area).

  A SHEET IS NOT A MOCK. Each thing here is `Button.svelte`, `controls.css`, `rows.css`, `Count.svelte`, `Toasts.svelte`
  or `BatchBar.svelte` itself, so what is wrong in the code is wrong on the sheet, and a later build is judged beside
  the photograph of this one.

  HOVER, FOCUS AND PRESSED ARE HELD HERE (agents F29): each of those cells carries `data-state` and this sheet draws
  the state the product draws under the pointer, the keyboard or the press, so the picture shows what it names. It is
  still a real button that takes the state for real, and carries `data-sheet` naming the cell (`button primary m
  hover`), the handle the photographer reaches it by.

  AND THE PARTS EVERY SCREEN SHARES: the banner, a command line with its Copy, and the
  state dot with its word.

  THE TOAST AND THE BULK BAR ARE FIXED TO THE WINDOW IN THE PRODUCT, and here each is drawn inside a small picture of
  the work. A frame that is a containing block (`transform`) holds a fixed child, so the same component stands at the
  foot of the frame. The frames are `inert`: they are pictures, and the bar in one answers nothing in the record.

  TWO OPEN CALLS ARE DRAWN TWICE HERE, the default labelled: where a toast stands, and whether several
  questions can be chosen at once. The third, a failed run, is on the charts sheet.

  WHAT IS NOT A SHARED PART YET IS SAID IN A COMMENT WHERE IT IS DRAWN: a field's error and a line another hand
  changed are each drawn here by this sheet's own rule, as the one screen that has them draws them.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { QueueQuestion } from '@braindog/kernel';

  import { apiBase } from '$lib/at.ts';
  import BatchBar from '$lib/page/BatchBar.svelte';
  import { Picked } from '$lib/page/picked.svelte.ts';
  import Banner from '$lib/ui/Banner.svelte';
  import Button from '$lib/ui/Button.svelte';
  import CodeLine from '$lib/ui/CodeLine.svelte';
  import StateDot from '$lib/ui/StateDot.svelte';
  import Count from '$lib/ui/Count.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import Toasts from '$lib/ui/Toasts.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Fold from './Fold.svelte';

  const WEIGHTS = ['primary', 'quiet', 'bare'] as const;
  const SIZES = ['m', 'sm'] as const;
  const STATES = ['rest', 'hover', 'focus', 'pressed', 'disabled'] as const;
  const SEGMENTS = [2, 3, 5] as const;
  const FIELDS = ['rest', 'focus', 'error', 'empty'] as const;
  const LINES = ['rest', 'wash', 'selected', 'arrived', 'changed'] as const;
  const PLACES = ['start', 'centre'] as const;
  const SEVERAL = ['kept', 'none'] as const;
  const DOTS = ['open', 'part', 'done', 'late', 'needs-you', 'warn', 'good', 'live'] as const;

  /* THE DEFAULTS OF THE TWO CALLS ("Needs him"): toasts at the bottom left of the work, and choosing several kept. */
  const TOAST_DEFAULT = 'start';
  const SEVERAL_DEFAULT = 'kept';

  const words = {
    /* THE SECTIONS THE SHEET OPENS IN (L50); closed, their names are the sheet's contents. */
    pressGroup: 'Buttons and choices',
    typeGroup: 'Fields and counts',
    sayGroup: 'Messages and states',
    rowsGroup: 'Lists',
    buttons: 'Buttons',
    weight: { primary: 'Primary', quiet: 'Quiet', bare: 'Bare' },
    size: { m: 'regular', sm: 'small' },
    state: { rest: 'At rest', hover: 'Pointed at', focus: 'Focused', pressed: 'Held down', disabled: 'Off' },
    how: { rest: '', hover: 'Point at it', focus: 'Tab to it', pressed: 'Hold it down', disabled: '' },
    save: 'Save',
    keyCap: 'With its key',
    keyCapLine: 'The key shows when the button is pointed at or focused.',
    segmented: 'One of a few',
    segments: ['Day', 'Week', 'Month', 'Quarter', 'Year'],
    choices: (n: number) => `${n} choices`,
    switches: 'On or off',
    switchOn: 'Character keys',
    switchOff: 'Notify me',
    fields: 'Fields',
    field: { rest: 'Filled in', focus: 'Focused', error: 'Refused', empty: 'Empty' },
    fieldLabel: 'Project name',
    fieldValue: 'Autumn catalogue',
    fieldHint: 'What should we call it?',
    fieldError: 'Needs fixing: a project already has this name.',
    counts: 'A count',
    countLine: 'The one pill, and only for what waits on you.',
    waiting: (n: number) => `${n} questions wait on you`,
    lines: 'A line in a list',
    line: { rest: 'At rest', wash: 'Pointed at', selected: 'Chosen', arrived: 'Just arrived', changed: 'Changed by someone else' },
    tasks: ['Send the quote', 'Proof the italics', 'Book the printer', 'Renew the lease', 'Write the page'],
    due: 'Due Friday',
    toasts: 'A toast',
    place: { start: 'At the bottom left of the work', centre: 'At the bottom centre of the work' },
    toast: 'Archived “Send the quote”',
    several: 'Answering several at once',
    severalWay: { kept: 'Several can be chosen, and one bar answers them', none: 'One at a time, with no bar' },
    questions: ['Move the printer booking to Monday?', 'Archive the old price list?', 'Add Rent to this month?'],
    asked: 'Asked today',
    choose: (q: string) => `Choose: ${q}`,
    banners: 'A banner',
    bannerLate: 'Your plan lapsed on 3 September. Pay again to keep adding.',
    bannerWarn: 'You are offline. What you change is sent when you are back.',
    payAgain: 'Pay again',
    exportCopy: 'Export',
    code: 'A command',
    codeLine: 'braindog keys put stripe',
    codeInline: 'Run it with',
    codeInlineAfter: 'from the folder.',
    dots: 'A state',
    dot: {
      open: 'Due in 4 days',
      part: 'Part paid',
      done: 'Paid',
      late: '64 days late',
      'needs-you': 'Needs you',
      warn: 'At risk',
      good: 'On track',
      live: 'Working now',
    },
    byDefault: 'Default',
    other: 'The other way',
  } as const;

  let picked = $state<Record<number, number>>({ 2: 0, 3: 1, 5: 2 });
  let on = $state(true);
  let off = $state(false);

  /* THE BAR'S OWN STATE, WITH NO SEND. `Picked` is what `BatchBar` reads; this one holds two made-up questions and its
     send does nothing, so a picture of the bar can never answer a question of the record. */
  class Still extends Picked {
    override async send(): Promise<void> {}
  }
  const question = (n: number): QueueQuestion => ({
    id: `sheet-${n}`,
    who: '',
    at: '',
    kind: 'call',
    question: words.questions[n] ?? '',
    why: '',
    cost: 'call',
    options: [{ key: 'yes', label: 'Yes', because: '', recommended: true }],
  });
  const still = new Still({ base: apiBase, reread: async () => {}, toasts: { push: () => 0 } });
  still.chosen = new Map([question(0), question(1)].map((q) => [q.id, q]));

  /* ONE TOAST FOR AS LONG AS THE SHEET IS OPEN, in the product's own store, which is the only thing its stack draws. It
     goes when the sheet does. Its Undo does nothing: nothing was archived. */
  onMount(() => {
    const id = toasts.push(words.toast, { undo: () => {}, life: 86_400_000 });
    return () => toasts.dismiss(id);
  });
</script>

<div class="sheet-folds" data-sheet-name="controls">

  <Fold id="controls-press" name={words.pressGroup} count={3}>
    <div class="sheet">

      <Tile title={words.buttons} class="sheet-wide">
        {#each WEIGHTS as weight (weight)}
          {#each SIZES as size (size)}
            <div class="group">
              <h3 class="group-name">{words.weight[weight]}, {words.size[size]}</h3>
              <div class="cells">
                {#each STATES as state (state)}
                  <figure class="cell">
                    <Button
                      {weight}
                      {size}
                      disabled={state === 'disabled'}
                      data-state={state === 'hover' || state === 'focus' || state === 'pressed' ? state : undefined}
                      data-sheet="button {weight} {size} {state}">{words.save}</Button
                    >
                    <figcaption class="said">{words.state[state]}{#if words.how[state]}<span class="how">{words.how[state]}</span>{/if}</figcaption>
                  </figure>
                {/each}
              </div>
            </div>
          {/each}
        {/each}
        <div class="group">
          <h3 class="group-name">{words.keyCap}</h3>
          <div class="cells">
            {#each WEIGHTS as weight (weight)}
              <figure class="cell">
                <Button {weight} kbd="⌘S" data-sheet="button {weight} m key">{words.save}</Button>
                <figcaption class="said">{words.weight[weight]}</figcaption>
              </figure>
            {/each}
          </div>
          <p class="line-said">{words.keyCapLine}</p>
        </div>
      </Tile>

      <!-- THE WHOLE WIDTH, so five choices keep one row: in a third of the board at 1512 the track wrapped "Year" under the
           rest. -->

      <Tile title={words.segmented} class="sheet-wide">
        {#each SEGMENTS as n (n)}
          <figure class="cell cell-start">
            <Segmented role="group" aria-label={words.choices(n)} full>
              {#each words.segments.slice(0, n) as label, i (label)}
                <button type="button" class="segment" aria-pressed={picked[n] === i} data-on={picked[n] === i ? '' : undefined} onclick={() => (picked[n] = i)}
                  >{label}</button
                >
              {/each}
            </Segmented>
            <figcaption class="said">{words.choices(n)}</figcaption>
          </figure>
        {/each}
      </Tile>

      <Tile title={words.switches}>
        <div class="pair">
          <span class="pair-name">{words.switchOn}</span>
          <button type="button" class="switch" role="switch" aria-checked={on} aria-label={words.switchOn} onclick={() => (on = !on)}
            ><span class="switch-track"></span></button
          >
        </div>
        <div class="pair">
          <span class="pair-name">{words.switchOff}</span>
          <button type="button" class="switch" role="switch" aria-checked={off} aria-label={words.switchOff} onclick={() => (off = !off)}
            ><span class="switch-track"></span></button
          >
        </div>
      </Tile>
    </div>
  </Fold>

  <Fold id="controls-type" name={words.typeGroup} count={3}>
    <div class="sheet">

      <Tile title={words.fields} class="sheet-wide">
        <div class="cells cells-wide">
          {#each FIELDS as f (f)}
            <figure class="cell cell-start">
              <div class="field-box">
                <label class="field-label" for="sheet-field-{f}">{words.fieldLabel}</label>
                <!-- THE ERROR IS THIS SHEET'S OWN RULE: `controls.css` has no refused state for a field yet, so the deeper red
                     edge and the line under it are drawn here, with a mark and the words, never the colour alone. -->
                <div class="field" data-refused={f === 'error' ? '' : undefined} data-state={f === 'focus' ? 'focus' : undefined}>
                  <input
                    class="field-input"
                    id="sheet-field-{f}"
                    type="text"
                    value={f === 'empty' ? '' : words.fieldValue}
                    placeholder={words.fieldHint}
                    aria-invalid={f === 'error' ? 'true' : undefined}
                    aria-describedby={f === 'error' ? 'sheet-field-error' : undefined}
                    data-sheet="field {f}"
                  />
                </div>
                {#if f === 'error'}<p class="refused" id="sheet-field-error"><Icon name="alert" size="s" />{words.fieldError}</p>{/if}
              </div>
              <figcaption class="said">{words.field[f]}{#if f === 'focus'}<span class="how">{words.how.focus}</span>{/if}</figcaption>
            </figure>
          {/each}
        </div>
      </Tile>

      <Tile title={words.counts}>
        <div class="counts">
          {#each [3, 12, 120] as n (n)}<Count {n} label={words.waiting(n)} />{/each}
        </div>
        <p class="line-said">{words.countLine}</p>
      </Tile>

      <Tile title={words.code}>
        <CodeLine text={words.codeLine} />
        <p class="line-said">{words.codeInline} <CodeLine inline text="braindog sync" /> {words.codeInlineAfter}</p>
      </Tile>
    </div>
  </Fold>

  <Fold id="controls-say" name={words.sayGroup} count={3}>
    <div class="sheet">

      <Tile title={words.banners} class="sheet-wide">
        <div class="banners">
          <Banner tone="late" icon="alert">
            {words.bannerLate}
            {#snippet actions()}<Button weight="primary" size="sm">{words.payAgain}</Button><Button size="sm">{words.exportCopy}</Button>{/snippet}
          </Banner>
          <Banner tone="warn" icon="alert">{words.bannerWarn}</Banner>
        </div>
      </Tile>

      <Tile title={words.toasts} class="sheet-wide">
        <div class="calls">
          {#each PLACES as place (place)}
            <figure class="call">
              <!-- A PICTURE OF THE WORK: the rail's column and the board beside it, with the product's own stack at its foot. -->
              <div class="work" data-place={place} inert>
                <span class="work-rail"></span>
                <Toasts />
              </div>
              <figcaption class="said">
                {words.place[place]}
                <span class="how">{place === TOAST_DEFAULT ? words.byDefault : words.other}</span>
              </figcaption>
            </figure>
          {/each}
        </div>
      </Tile>

      <Tile title={words.dots}>
        <ul class="dots">
          {#each DOTS as d (d)}<li><StateDot state={d} word={words.dot[d]} /></li>{/each}
        </ul>
      </Tile>
    </div>
  </Fold>

  <Fold id="controls-rows" name={words.rowsGroup} count={2}>
    <div class="sheet">

      <Tile title={words.lines} class="sheet-wide">
        <!-- `rows.css` DRAWS FOUR OF THESE: the fill of a line the cursor is on, of a chosen one, and the wash of one that
             just arrived, which fades in a second and a half and is held here so a still picture has it. THE FIFTH, a line
             another hand changed, is `PageBody.svelte`'s own rule over a page's lines, written again in this sheet's style. -->
        <ul class="ledger hold">
          {#each LINES as state, i (state)}
            <li
              data-cursor={state === 'wash' ? '' : undefined}
              data-selected={state === 'selected' ? '' : undefined}
              data-arrived={state === 'arrived' ? '' : undefined}
              data-changed={state === 'changed' ? '' : undefined}
            >
              <div class="line line-tall" data-sheet="line {state}">
                <span class="line-mark"><span class="line-check" aria-hidden="true"></span></span>
                <span class="line-main">
                  <span class="line-title">{words.tasks[i]}</span>
                  <span class="line-detail">{words.due}</span>
                </span>
                <span class="line-amount"></span>
                <span class="line-when said">{words.line[state]}</span>
              </div>
            </li>
          {/each}
        </ul>
      </Tile>

      <Tile title={words.several} class="sheet-wide">
        <div class="calls">
          {#each SEVERAL as several (several)}
            <figure class="call">
              <div class="work work-tall" inert>
                <ul class={['ledger', several === 'none' && 'plain']}>
                  {#each words.questions as q, n (q)}
                    <li data-selected={several === 'kept' && n < 2 ? '' : undefined}>
                      <div class="line line-tall">
                        {#if several === 'kept'}
                          <span class="line-mark"
                            ><span class="line-check" role="checkbox" aria-checked={n < 2} aria-label={words.choose(q)}><Icon name="check" size="s" /></span></span
                          >
                        {/if}
                        <span class="line-main">
                          <span class="line-title">{q}</span>
                          <span class="line-detail">{words.asked}</span>
                        </span>
                      </div>
                    </li>
                  {/each}
                </ul>
                {#if several === 'kept'}<BatchBar picked={still} />{/if}
              </div>
              <figcaption class="said">
                {words.severalWay[several]}
                <span class="how">{several === SEVERAL_DEFAULT ? words.byDefault : words.other}</span>
              </figcaption>
            </figure>
          {/each}
        </div>
      </Tile>
    </div>
  </Fold>

</div>

<style>
  /* THE SHEET IS A BOARD OF TILES: as many columns as fit, one on a phone, and a tile that holds a table of states
     takes the whole width. The tile is `Tile.svelte`'s; nothing here gives it a fill, an edge or a shadow. */
  /* THE SECTIONS ONE OVER THE OTHER, each a fold with the board of tiles inside it. */
  .sheet-folds {
    display: grid;
    min-inline-size: 0;
  }

  .sheet {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    gap: var(--tile-gap);
  }

  .sheet :global(.sheet-wide) {
    grid-column: 1 / -1;
  }

  .group + .group {
    margin-block-start: var(--sp-5);
  }

  .group-name {
    margin: 0 0 var(--sp-3);
    color: var(--ink-2);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  /* A CELL IS THE THING AND ITS NAME UNDER IT. Five across where there is room, two on a phone. */
  .cells {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
    gap: var(--sp-4);
  }

  .cells-wide {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-2);
    margin: 0;
    min-inline-size: 0;
  }

  .cell-start + .cell-start {
    margin-block-start: var(--sp-4);
  }

  .cells-wide > .cell-start {
    margin-block-start: 0;
  }

  .said {
    display: flex;
    flex-wrap: wrap;
    gap: 0 var(--sp-2);
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .how {
    color: var(--ink-3);
  }

  .line-said {
    margin: var(--sp-3) 0 0;
    color: var(--ink-2);
    font-size: var(--fs-body);
  }

  .pair {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    min-block-size: var(--row-h);
  }

  .pair-name {
    font-size: var(--fs-body);
  }

  .field-box {
    inline-size: 100%;
  }

  /* A FIELD THE RECORD REFUSED: the deeper red as a 2px edge inside the field's own corner, and under it the mark and
     the sentence. Red is "needs you" here, and the words say what to do. */
  .field[data-refused] {
    outline: 2px solid var(--red);
    outline-offset: -2px;
  }

  /* ── THE STATES HELD FOR THE PICTURE (agents F29), each the product's own: the hover fill, the focus ring and the
     press, as `Button.svelte` and `controls.css` draw them under a real pointer, key or finger. ── */
  .sheet :global(.btn[data-state='hover']) {
    background: var(--hover);
  }

  .sheet :global(.btn[data-weight='primary'][data-state='hover']) {
    background: var(--red-fill-hover);
  }

  .sheet :global(.btn[data-weight='bare'][data-state='hover']) {
    background: var(--hover);
    color: var(--ink);
  }

  .sheet :global(.btn[data-state='focus']),
  .field[data-state='focus'] {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .sheet :global(.btn[data-state='pressed']) {
    background: color-mix(in oklab, var(--ink) 8%, var(--btn-fill));
  }

  .sheet :global(.btn[data-weight='primary'][data-state='pressed']) {
    background: var(--red-fill-press);
  }

  .sheet :global(.btn[data-weight='bare'][data-state='pressed']) {
    background: var(--tile-2);
    color: var(--ink);
  }

  .banners {
    display: grid;
    gap: var(--sp-3);
  }

  .dots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
    gap: var(--sp-3) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .refused {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: var(--sp-2) 0 0;
    color: var(--red);
    font-size: var(--fs-body);
    font-weight: 500;
  }

  .counts {
    display: flex;
    align-items: center;
    gap: var(--sp-4);
    min-block-size: var(--row-h);
  }

  /* HELD FOR THE PICTURE: the arrival's wash at its first frame, where the product lets it fade. */
  .hold :global(li[data-arrived] > .line) {
    animation-play-state: paused;
  }

  /* `PageBody.svelte`'s rule for a line another hand changed and nobody has opened yet, to the letter. */
  .hold :global(li[data-changed] > .line) {
    background-color: color-mix(in oklab, var(--arrived) 60%, transparent);
  }

  .plain :global(.line) {
    grid-template-columns: minmax(0, 1fr);
  }

  .calls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
    gap: var(--sp-5);
  }

  .call {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    margin: 0;
    min-inline-size: 0;
  }

  /* THE WORK, SMALL: the board's own colour inside the tile, flat, at the tile's inner corner. `transform` makes it the
     box a fixed child stands in, which is the whole trick: the stack inside is the product's, fixed to this frame. */
  .work {
    position: relative;
    block-size: 168px;
    overflow: hidden;
    background: var(--board);
    border-radius: var(--r-pop);
    transform: translateZ(0);
  }

  .work-tall {
    block-size: auto;
    min-block-size: 248px;
    padding: var(--sp-3) var(--sp-4) var(--sp-4);
  }

  /* IN THE PICTURE THE BAR SITS UNDER THE LIST (P47): held to the frame's foot it covered the
     last question's "Asked today". */
  .work-tall :global(.batch) {
    position: static;
    margin-block-start: var(--sp-3);
  }

  /* The rail, as the flat column it is: a shade of the board, no edge. */
  .work-rail {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: 56px;
    background: var(--nav);
  }

  /* WHERE THE STACK STANDS IN THE FRAME: clear of the frame's rail, a step up from its foot, and at the start edge of
     the work or in its middle. `!important` on the start because the shell's own rule for it names the root. */
  .work :global(.stack) {
    --toast-start: 56px !important;
    --dock-w: 0px;
    inset-block-end: var(--sp-4);
  }

  .work[data-place='start'] :global(.stack) {
    align-items: flex-start;
  }

  /* THE WINDOW'S OWN STACK STANDS DOWN WHILE THE SHEET IS OPEN, or the sheet's toast is drawn a third time over the
     sheet itself. Anything the product says meanwhile is said in the two frames. */
  :global(body:has([data-sheet-name='controls']) .stack:not(.work .stack)) {
    display: none;
  }
</style>
