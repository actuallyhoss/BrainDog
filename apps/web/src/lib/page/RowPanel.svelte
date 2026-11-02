<!--
  A row of a declared page, open in the docked panel: every field its list declares, drawn from the declaration by
  `RowForm` and opened on what the row holds, saved in ONE write with ONE Undo. Work's panel (`lib/work/Work.svelte`),
  over any list a page draws, through the one `Panel.svelte` every screen docks: 440 at the window's end edge from 900px
  up, and the page narrows beside it; a bottom sheet below. It is non-modal, so `j` and `k` go on walking the page and
  the panel follows the cursor, unless something typed in it is not saved yet.

  ONLY WHAT THE LIST HAS, AND ALL OF IT. A field the declaration does not have is not drawn, and one it has is, so a
  list of invoices gets its amount and its day and no project box. A reader who may not write reads the same panel
  with the boxes off and no Save.

  WHO ELSE CHANGED IT LEADS THE BODY, for a week: "Claude for Mara · 2h ago · Undo", the agent's name the door to the run
  that made the change, and Undo putting that change back on the record (`host.undoBy`), saying first what else it takes
  back when the change touched more than this row (`UndoAsk.svelte`). A row a person changed last
  carries no such line. Opening the row is seeing it, so the row's tint goes as the panel opens.

  DELETE IS WORDS, then a confirm, and the row stays in Just changed with Put back for ten minutes.

  A ROW THE PAGE ANSWERED CUT SHORT IS READ WHOLE FIRST. A page sends each long text as its first 280 characters (the
  kernel's `leanRows`), and a project's note opened on those and saved them, with the edit, over the whole note. The form
  now opens on the row whole (`host.whole`) and Save is worked out against it; until it is read the body holds the
  wait, and a row that cannot be read whole says so in place of its form.

  THE ROW'S MARK HEADS THE BODY where its list declares one, its picture or the first letter of its name in its own
  hue (`markOf`, as every drawer of a mark). For a reader who may change the row it is a button, "Change the mark":
  pressing it loads the glyph picker by `import()`, never as the panel opens, and a pick writes the mark's field alone
  through the panel's own row write (`host.write`), with its receipt and Undo, so nothing typed in the form changes.
  The form itself never shows the mark (`readableFields`): the identity is picked as a picture, not typed.
-->
<script lang="ts">
  import { tick, untrack, type Component } from 'svelte';
  import { markOf } from 'braindog-render';
  import { at as inApp } from '$lib/at.ts';
  import { currencyFor, identityOfRow, readableFields } from '$lib/record/api.ts';
  import type { Entry, Fields } from '$lib/record/schema.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { slotOf } from '$lib/ui/face.ts';
  import { isGlyph } from '$lib/ui/icons.ts';
  import Panel from '$lib/ui/Panel.svelte';
  import RowForm from '$lib/ui/RowForm.svelte';
  import Waiting from '$lib/ui/Waiting.svelte';
  import type { RowHost } from './row-host.svelte.ts';
  import { rowPatch, valuesOf } from './row-fields.ts';
  import { bylineWords } from './byline.ts';
  import UndoAsk from './UndoAsk.svelte';
  import { keyOf, titleOf, words } from './row-verbs.ts';
  import { MARK_WORDS, markFieldOf, markPatch } from './mark-pick.ts';

  let { host }: { host: RowHost } = $props();

  const row = $derived(host.opened);
  const entry = $derived(row ? host.entry(row) : undefined);
  /* THE ROW WHOLE, OR NOTHING YET: a row cut short is never what the form opens on or what Save is worked out against. */
  const whole = $derived(entry && !entry.clipped ? entry : undefined);
  const shape = $derived(row ? host.shapeOf(row.register) : null);
  const mayWrite = $derived(row ? host.writable(row) : false);
  /* WHO ELSE CHANGED THE ROW LAST, where an agent, a rule or Slash did. */
  const byline = $derived(row ? host.byline(row) : undefined);
  const fields = $derived(row ? readableFields(row.register) : []);
  const currency = $derived((f: { id: string }) => (row ? currencyFor(row.register, f.id) : null));

  /* THE ROW'S MARK, where its list declares one: the field it is kept in, what it holds now, and what it draws. */
  const markField = $derived(row ? markFieldOf(row.register) : null);
  const identity = $derived(row && entry && markField !== null ? identityOfRow(row.register, entry.fields) : null);
  const markHeld = $derived.by(() => {
    const v = entry && markField !== null ? entry.fields[markField] : null;
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  });
  const markDrawn = $derived(identity ? markOf(identity.mark, identity.name) : null);
  /* A mark longer than one letter is a glyph's name, as `IdentityMark` reads it. */
  const markGlyph = $derived(markDrawn !== null && markDrawn.length > 1 && isGlyph(markDrawn) ? markDrawn : null);

  type Picker = Component<{ value?: string | null; onpick: (name: string) => void }>;
  /** The glyph picker, loaded the first time the mark is pressed and kept for the next. */
  let GlyphPicker = $state.raw<Picker | null>(null);
  let picking = $state(false);
  /** Said under the mark when a pick was refused or could not be loaded. */
  let markSaid = $state('');
  let markButton = $state<HTMLButtonElement | null>(null);

  /** The picker closed by a pick or Done: focus goes back to the mark, since what held it has gone. */
  async function shut() {
    picking = false;
    await tick();
    markButton?.focus();
  }

  /* THE PICKER CLOSES WHEN THE PANEL MOVES TO ANOTHER ROW. */
  const openKey = $derived(row ? keyOf(row) : '');
  $effect(() => {
    void openKey;
    untrack(() => {
      picking = false;
      markSaid = '';
    });
  });

  async function pressMark() {
    markSaid = '';
    if (picking) return void (picking = false);
    if (!GlyphPicker) {
      try {
        GlyphPicker = (await import('./GlyphPicker.svelte')).default as Picker;
      } catch {
        markSaid = MARK_WORDS.unloaded;
        return;
      }
    }
    picking = true;
  }

  /** One pick, one write: the mark's field alone, through the panel's row write and its Undo. */
  function pickMark(glyph: string | null) {
    const r = row;
    const e = entry;
    if (!r || !e || !shape || !mayWrite) return;
    if (glyph === markHeld) return void shut();
    const patch = markPatch(r.register, glyph);
    if (!patch) return void (markSaid = MARK_WORDS.refused);
    const title = titleOf(e, shape);
    if (host.write(r, patch, words.marks.edited, glyph === null ? MARK_WORDS.cleared(title) : MARK_WORDS.said(title))) {
      markSaid = '';
      void shut();
    }
  }

  /** What the form opened on, the row's fields as typed text. A new object is a new form (`{#key}` below). */
  let seeded = $state.raw<Record<string, string> | null>(null);
  /** The row whole that the form opened on, which Save is worked out against while a newer read of it is read whole. */
  let base = $state.raw<Entry | null>(null);
  /** What the form holds now, in the shapes the record stores (`RowForm`'s `taken`). */
  let taken = $state<Fields>({});
  /** Why Save is off: a required field emptied, or an amount the record would refuse (`RowForm`'s `problems`). */
  let problems = $state<string[]>([]);
  let confirming = $state(false);
  /** Said in place of the form when the row could not be read whole. */
  let unread = $state('');
  /** The row the form was loaded from, so a re-read of the same row keeps what is being typed. */
  let loaded = '';

  /* A ROW CUT SHORT IS READ WHOLE, when the panel opens on it and whenever a newer read of it comes back cut. The host
     keeps what it read, so the same row opens at once the next time. */
  $effect(() => {
    const r = row;
    const cut = entry?.clipped === true;
    if (!host.panelOpen || !r || !cut) return;
    untrack(() => {
      void host.whole(r).then((got) => {
        if (typeof got === 'string' && host.opened && keyOf(host.opened) === keyOf(r)) unread = got;
      });
    });
  });

  /* THE FORM IS LOADED WHEN THE PANEL MOVES TO A ROW, and not each time the page is read again: from the row whole. */
  $effect(() => {
    const r = row;
    const open = host.panelOpen;
    const e = whole;
    untrack(() => {
      if (!open || !r) return void (loaded = '');
      const key = keyOf(r);
      if (key === loaded) return;
      const s = host.shapeOf(r.register);
      if (!s) return;
      if (!e) {
        /* NOT WHOLE YET: the body waits, and nothing of the last row's form stays under this one's name. A row that has
           left the page keeps its form while the panel closes over it. */
        if (!entry) return;
        loaded = '';
        seeded = null;
        base = null;
        taken = {};
        problems = [];
        confirming = false;
        unread = '';
        return;
      }
      loaded = key;
      base = e;
      unread = '';
      seeded = valuesOf(e, readableFields(r.register), (f) => currencyFor(r.register, f.id));
      confirming = false;
      if (host.typing) void caret();
    });
  });

  /* WHAT SAVE SENDS: what was typed against the row whole as the form opened on it, so a field somebody else changed
     meanwhile, and nobody touched here, is not sent back as it was. */
  const patch = $derived(base && shape ? rowPatch(taken, base, fields, shape.title, currency) : {});
  /* SAVE WAITS WHILE THE NEWEST READ OF THE ROW IS CUT SHORT: its Undo is worked out from that read, whole. */
  const ready = $derived(whole !== undefined && seeded !== null);

  /* WHAT IS TYPED AND NOT SAVED is the host's to know, so the cursor moving keeps the panel where it is. */
  $effect(() => {
    const d = Object.keys(patch).length > 0;
    untrack(() => (host.dirty = d));
  });

  /* A ROW THAT LEAVES THE PAGE takes the panel with it. */
  $effect(() => {
    if (host.panelOpen && row && !entry) host.close();
  });

  /** The caret in the words, once the panel has drawn: a frame later it may still be opening. */
  async function caret() {
    await tick();
    requestAnimationFrame(() => {
      const r = row;
      const s = r ? host.shapeOf(r.register) : null;
      if (!r || !s) return;
      /* `RowForm`'s own id for a box, `new-<list>-<field>`. */
      const box = document.getElementById(`new-${r.register}-${s.title}`) as HTMLInputElement | HTMLTextAreaElement | null;
      box?.focus();
      box?.select();
    });
  }

  function save(e?: SubmitEvent) {
    e?.preventDefault();
    if (!row || !entry || !shape || !mayWrite || !ready || problems.length > 0) return;
    const out = patch;
    host.dirty = false;
    loaded = '';
    if (Object.keys(out).length === 0) return host.close();
    const said = out[shape.title];
    host.save(row, out, (typeof said === 'string' ? said.trim() : '') || titleOf(entry, shape));
  }

  /** Focus goes back to the row the panel was on, where the page still draws it. */
  function closed() {
    const r = row;
    loaded = '';
    confirming = false;
    host.dirty = false;
    /* A PANEL THAT CLOSED ITSELF (its close, Escape) TELLS THE HOST, so whoever follows the open row (a list's address)
       hears it. Closing a closed host says nothing twice. */
    host.close();
    if (!r) return;
    const el = document.querySelector<HTMLElement>(`[data-row="${CSS.escape(keyOf(r))}"]`);
    el?.focus({ preventScroll: true });
  }
</script>

<Panel bind:open={host.panelOpen} title={row ? host.oneOf(row.register) : ''} shows={row ? keyOf(row) : null} onclose={closed}>
  {#snippet verbs()}
    {#if row && entry}
      {@const r = row}
      <Button size="sm" href={inApp(`/r/${r.register}/${r.seq}`)}><Icon name="external" size="s" />{words.open}</Button>
      <!-- SEND TO…, fetched with the first row opened, so a page that only lists its rows carries none of it. -->
      {#await import('../send/SendButton.svelte') then { default: SendButton }}<SendButton size="sm" kind={r.register} attach={[{ ref: `${r.register}#${r.seq}`, label: titleOf(entry, shape) }]} />{/await}
      <button
        type="button"
        class="more tap"
        aria-label={words.more}
        title={words.more}
        onclick={(e) => host.openMenu(r, e.currentTarget)}
      >
        <Icon name="more" size="m" />
      </button>
    {/if}
  {/snippet}

  {#if row && entry && byline}
    {@const r = row}
    {@const named = byline.run !== null && byline.said.startsWith(byline.name)}
    <p class="p-by">
      <span
        >{#if named}<a class="p-who" href={inApp(`/r/session/${byline.run?.slice(1)}`)}>{byline.name}</a>{byline.said.slice(byline.name.length)}{:else}{byline.said}{/if}</span
      >
      {#if byline.batch && mayWrite}
        <button
          type="button"
          class="p-undo tap"
          aria-label={bylineWords.undoNamed(titleOf(entry, shape))}
          disabled={host.undoing.has(keyOf(r)) || host.asked?.key === keyOf(r)}
          onclick={() => void host.undoBy(r)}>{bylineWords.undo}</button
        >
      {/if}
    </p>
    <UndoAsk {host} row={r} />
  {/if}

  {#if row && entry && shape && unread}
    <p class="p-sure" role="status">{unread}</p>
  {:else if row && entry && shape && seeded === null}
    <!-- ONLY BEFORE THE FORM FIRST OPENS: a newer read of the same row that comes back cut keeps the form and what is
         typed in it, with Save off until that read is whole too. -->
    <Waiting rows={3} />
  {:else if row && entry && shape}
    {@const r = row}
    {#if identity}
      <!-- THE MARK, a button only where the reader may change the row; its picture is the name the screen reader
           hears none of, so the button says what it does. -->
      <div class="p-mark-line">
        {#if markField !== null && mayWrite}
          <button
            bind:this={markButton}
            type="button"
            class="p-mark"
            style="--slot-ink:var(--cat-{slotOf(identity.hue)});--slot-tint:var(--cat-{slotOf(identity.hue)}-tint)"
            data-retired={identity.retired ? '' : undefined}
            aria-label={MARK_WORDS.change}
            aria-expanded={picking ? 'true' : 'false'}
            title={MARK_WORDS.change}
            onclick={() => void pressMark()}
          >
            {#if markGlyph}<Icon name={markGlyph} size="l" />{:else if markDrawn}{markDrawn}{/if}
          </button>
        {:else}
          <span class="p-mark" style="--slot-ink:var(--cat-{slotOf(identity.hue)});--slot-tint:var(--cat-{slotOf(identity.hue)}-tint)" data-retired={identity.retired ? '' : undefined} aria-hidden="true"
            >{#if markGlyph}<Icon name={markGlyph} size="l" />{:else if markDrawn}{markDrawn}{/if}</span
          >
        {/if}
        {#if markSaid}<p class="p-sure" role="status">{markSaid}</p>{/if}
      </div>
      {#if picking && GlyphPicker && mayWrite}
        <div class="p-picker" role="group" aria-label={MARK_WORDS.heading}>
          <p class="p-picker-head">{MARK_WORDS.heading}</p>
          <GlyphPicker value={markHeld} onpick={(name) => pickMark(name)} />
          <div class="p-picker-foot">
            {#if markHeld !== null}<Button size="sm" onclick={() => pickMark(null)}>{MARK_WORDS.clear}</Button>{/if}
            <Button size="sm" onclick={() => void shut()}>{MARK_WORDS.close}</Button>
          </div>
        </div>
      {/if}
    {/if}
    <!-- WHAT THE ROW HOLDS TO LOOK AT, loaded with the drawer's first row and not with the page, so a page that only lists
         its rows carries none of it. -->
    {#await import('../visual/VisualStrip.svelte') then { default: VisualStrip }}<VisualStrip on="{r.register}#{r.seq}" />{/await}
    <!-- WHAT WAS SENT FROM THIS ROW, and what came back. -->
    {#await import('../send/SendStrip.svelte') then { default: SendStrip }}<SendStrip ref="{r.register}#{r.seq}" kind={r.register} label={titleOf(entry, shape)} />{/await}
    <form class="p-form" novalidate onsubmit={save}>
      <!-- EVERY FIELD THE LIST DECLARES, in `RowForm`'s boxes, and all of them off for a reader who may not write. A new
           row is a new form: `values` is read once, as the form draws. -->
      <fieldset class="p-fields" disabled={!mayWrite}>
        {#key seeded}
          {#if seeded}
            <RowForm register={r.register} values={seeded} bind:taken bind:problems />
          {/if}
        {/key}
      </fieldset>

      {#if mayWrite}
        <div class="p-foot">
          {#if confirming}
            <p class="p-sure" role="status">{words.deleteSure}</p>
            <Button size="sm" onclick={() => (confirming = false)}>{words.keep}</Button>
            <Button size="sm" weight="primary" onclick={() => host.remove(r)}>{words.deleteYes}</Button>
          {:else}
            {#if problems.length > 0}<p class="p-sure" role="status">{problems[0]}</p>{/if}
            <button type="button" class="p-delete" onclick={() => (confirming = true)}>{words.deleteAsk}</button>
            <span class="p-gap"></span>
            <Button size="sm" kbd="Esc" onclick={() => host.close()}>{words.cancel}</Button>
            <Button size="sm" weight="primary" type="submit" kbd="↵" disabled={!ready || problems.length > 0}>{words.save}</Button>
          {/if}
        </div>
      {/if}
    </form>
  {/if}
</Panel>

<style>
  /* THE PANEL'S BODY, Work's: label over box, 16 between fields, and the foot at the bottom wherever the body scrolls. */
  .p-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-block-size: 100%;
  }

  /* THE MARK OVER THE FORM: one square in the row's own hue, a flat button (radius 8) where it may be changed. */
  .p-mark-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    margin: 0 0 var(--sp-4);
  }

  .p-mark {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    /* THE ROW'S SLOT, AS ITS WELL EVERYWHERE ELSE (domains lane, 2 Nov): the slot's tint and its colour, and not its hue at
       the mark's lightness on a grey. */
    background: var(--slot-tint, var(--hover));
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--slot-ink, var(--ink-2));
    font: inherit;
    font-size: var(--fs-body);
    font-weight: 600;
    line-height: 1;
  }

  .p-mark[data-retired] {
    background: var(--hover);
    color: var(--ink-3);
  }

  button.p-mark {
    cursor: pointer;
  }

  button.p-mark:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  @media (hover: hover) and (pointer: fine) {
    button.p-mark:hover {
      background: color-mix(in oklab, var(--slot-tint, var(--hover)) 90%, var(--ink));
    }
  }

  @media (pointer: coarse) {
    .p-mark {
      inline-size: var(--tap);
      block-size: var(--tap);
    }
  }

  .p-picker {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0 0 var(--sp-4);
  }

  .p-picker-head {
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .p-picker-foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  /* A FIELDSET ONLY TO TURN EVERY BOX OFF AT ONCE for a reader who may not write, so it draws as nothing. */
  .p-fields {
    min-inline-size: 0;
    margin: 0;
    padding: 0 0 var(--sp-4);
    border: 0;
  }

  /* A BOX THE KEYBOARD MOVES TO SCROLLS CLEAR OF THE STICKY FOOT, rather than into place under it: the last field read
     as cut off behind the foot's band. 88 is the foot's height and a step of air. */
  .p-fields :global(:is(input, select, textarea)) {
    scroll-margin-block-end: 88px;
  }

  .p-foot {
    position: sticky;
    inset-block-end: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2);
    margin: auto calc(-1 * (var(--sp-4) + var(--sp-1))) calc(-1 * (var(--sp-4) + var(--sp-1)));
    padding: var(--sp-3) calc(var(--sp-4) + var(--sp-1));
    /* THE PANEL'S OWN SURFACE: `--tile` drew a darker band across the foot in dark. */
    background: var(--tile);
    border-block-start: 1px solid var(--rule);
  }

  .p-gap {
    flex: 1;
  }

  /* A DESTRUCTIVE VERB IS WORDS IN INK asking for a confirm, never a red fill. */
  .p-delete {
    min-block-size: var(--ctl-h);
    padding: 0 var(--sp-2);
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-meta);
    font-weight: 500;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .p-sure {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink);
    font-size: var(--fs-meta);
  }

  /* THE BYLINE: a quiet line over the form, the meta size in the second ink, and Undo as words in ink beside it. */
  .p-by {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-1) var(--sp-3);
    margin: 0 0 var(--sp-4);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .p-who {
    color: inherit;
    text-decoration: none;
  }

  .p-who:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .p-undo {
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-weight: 500;
    text-decoration: underline;
    text-decoration-color: var(--rule-strong);
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .p-undo:hover {
    text-decoration-color: currentColor;
  }

  .p-undo:disabled {
    color: var(--ink-3);
    cursor: default;
  }

  .more {
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: var(--hover);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    cursor: pointer;
  }

  @media (hover: hover) and (pointer: fine) {
    .more:hover {
      background: var(--tile-2);
    }
  }
</style>
