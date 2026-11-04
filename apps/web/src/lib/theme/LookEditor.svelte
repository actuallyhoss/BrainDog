<!--
  Edit the look (`21 §6`): every colour the record is drawn in, changed in words, checked as it is changed.

  THE ROLE LIST FIRST. Each colour is one row with its light and its dark swatch; pressing a swatch opens that colour's
  controls under its own row, so on a phone the thing being changed and the way to change it are one thumb apart.
  Three ways to change it: Nudge (six words, no numbers), Pick (an OKLCH grid at the colour's hue, with the cells no
  screen can show left out) and Enter (a colour code from a brand guide).

  THE GATE SAYS WHAT EVERY CHANGE DID TO READING. Each pair that is not Fine is drawn at its real size, with its verdict
  in a word and a glyph, and a button that moves lightness only and names what it moves ("Darken needs you"). A Fails
  anywhere blocks Save, and so does anything the record's own check would refuse, because the gate ends by running
  that check (`look.ts`).

  THE SPECIMEN BESIDE IT at 1440, and in a fold under the list below 900, where one column is all there is.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { copy } from '$lib/copy.ts';
  import { forget } from '$lib/record/boot-live.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Segmented from '$lib/ui/Segmented.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { drawn as drawnNow, drawSaved } from './draw.ts';
  import {
    baseOf,
    draftFrom,
    draftFromPack,
    drawOf,
    fixOf,
    gate,
    GRID_COLS,
    gridOf,
    hexOf,
    lookFrom,
    nudge as nudgeHex,
    NUDGES,
    OWN,
    refusedOf,
    ROLES,
    saveable,
    stageFixes,
    withRole,
    type Base,
    type Corners,
    type Density,
    type Draft,
    type Nudge,
    type Pair,
    type Role,
    type Scheme,
  } from './look.ts';
  import { houseLook, saveLook } from './save.ts';
  import Specimen from './Specimen.svelte';

  let { owner, staged = null }: { owner: boolean; staged?: unknown } = $props();

  let open = $state(false);
  /* RAW, because a solved palette is read by the checks thousands of times a press and is only ever replaced whole. */
  let base = $state.raw<Base | null>(null);
  let draft = $state.raw<Draft | null>(null);
  let id = $state(OWN);
  let fixing = $state(false);
  let stagedNone = $state(false);
  let noHue = $state(false);
  /* The colours Fix and install moved, as `scheme:role`, so the editor opens with them marked. */
  let moved = $state<string[]>([]);

  let scheme = $state<Scheme>('light');
  let picked = $state<Role | null>(null);
  let how = $state<'nudge' | 'pick' | 'enter'>('nudge');
  let typed = $state('');
  let typedWrong = $state(false);
  let foldOpen = $state(false);
  let saving = $state(false);
  let said = $state<string | null>(null);

  const drawn = $derived(base && draft ? drawOf(base, draft) : null);
  const pairs = $derived(drawn && draft ? gate(drawn, draft) : []);
  const refused = $derived(drawn ? refusedOf(drawn) : []);
  const shown = $derived(pairs.filter((p) => p.verdict !== 'fine'));
  const fine = $derived(pairs.length - shown.length);
  const ok = $derived(saveable(pairs, refused));
  const palette = $derived(drawn ? drawn.house.schemes[scheme] : null);
  /* THE SPECIMEN PAINTS BY THE PAGE'S NAMES (SPEC 1.10): the solved frame over the solver's roles. */
  const painted = $derived(drawn && palette ? { ...palette, ...drawn.house.frame[scheme] } : null);
  /* Whether the page is in a look of the record's own, kept here because the module that knows is not reactive. */
  let hasOwnLook = $state(drawnNow() !== null);

  const nameOf = (role: Role): string => copy.lookRoles[role] ?? role;

  /* A STAGED PACK OPENS THE EDITOR BY ITSELF: the person pressed Fix and install on the add-on screen to get here. */
  $effect(() => {
    if (staged !== null && !open) untrack(start);
  });

  /**
   * Open the editor on the look the page is in, or on a refused pack's theme with its fixes staged.
   *
   * THE SEED IS SOLVED HERE, ONCE. Every press after this lays a colour over the two palettes it made, so the
   * generator's search is paid when the editor opens and never while somebody is nudging.
   */
  function start() {
    said = null;
    noHue = false;
    stagedNone = false;
    moved = [];
    const fromPack = staged === null ? null : draftFromPack(staged);
    if (staged !== null && fromPack === null) stagedNone = true;
    const first = fromPack?.draft ?? draftFrom(drawnNow());
    const solved = baseOf(first.accent, first.neutralHue);
    open = true;
    if (solved === null) {
      noHue = true;
      base = null;
      draft = null;
      return;
    }
    base = solved;
    id = fromPack?.id ?? OWN;
    fixing = fromPack !== null;
    if (fromPack) {
      const out = stageFixes(solved, first);
      draft = out.draft;
      moved = out.moved.map((m) => `${m.scheme}:${m.role}`);
      const lead = out.moved[0];
      if (lead) {
        scheme = lead.scheme;
        picked = lead.role;
      }
    } else draft = first;
  }

  function close() {
    open = false;
    picked = null;
    staged = null;
  }

  function pick(role: Role, s: Scheme) {
    if (picked === role && scheme === s) {
      picked = null;
      return;
    }
    picked = role;
    scheme = s;
    typed = palette?.[role] ?? '';
    typedWrong = false;
  }

  function set(role: Role, hex: string | null, s: Scheme = scheme) {
    if (!draft) return;
    draft = withRole(draft, s, role, hex);
    said = null;
  }

  function doNudge(role: Role, n: Nudge) {
    const now = palette?.[role];
    if (now) set(role, nudgeHex(now, n));
  }

  function enter(role: Role) {
    const hex = hexOf(typed);
    typedWrong = hex === null;
    if (hex) set(role, hex);
  }

  function applyFix(pair: Pair) {
    if (!drawn) return;
    const fix = fixOf(pair, drawn);
    if (!fix) return;
    set(fix.role, fix.hex, fix.scheme);
  }

  const fixWord = (pair: Pair): string | null => {
    if (!drawn) return null;
    const fix = fixOf(pair, drawn);
    return fix ? copy.lookFix(fix.way, nameOf(fix.role)) : null;
  };

  const changed = (role: Role, s: Scheme): boolean => draft !== null && Object.hasOwn(draft.roles[s], role);

  function setCorners(c: Corners) {
    if (draft) draft = { ...draft, corners: c };
  }

  function setDensity(d: Density) {
    if (draft) draft = { ...draft, density: d };
  }

  /* ONE WRITE PER PRESS: `saving` is the in-flight guard, so a double press files one look. */
  async function save() {
    if (!draft || !drawn || !ok || saving) return;
    saving = true;
    said = null;
    const out = await saveLook(apiBase(), draft, owner, id);
    saving = false;
    if (out.from === 'refused') {
      said = out.fix;
      return;
    }
    if (out.from === 'installed') {
      /* DRAWN NOW, AND ASKED FOR AGAIN NEXT. The page takes the saved look at once, and the kept `boot` is dropped so
         the next screen reads the record's own answer rather than the one from before the save. */
      drawSaved(lookFrom(drawn, draft));
      hasOwnLook = true;
      forget();
      toasts.push(copy.lookSaved);
    } else toasts.push(copy.lookProposed);
    close();
  }

  async function backToHouse() {
    if (saving) return;
    saving = true;
    const out = await houseLook(apiBase());
    saving = false;
    if (out.from === 'refused') {
      said = out.fix;
      return;
    }
    drawSaved(null);
    hasOwnLook = false;
    forget();
    toasts.push(copy.lookHouseBack);
    close();
  }

  const verdictWord = (p: Pair): string => (p.verdict === 'fails' ? copy.lookFails : p.verdict === 'tight' ? copy.lookTight : copy.lookFine);
  const pairWords = (p: Pair): string =>
    p.kind === 'grey'
      ? copy.lookGrey(nameOf(p.role), nameOf(p.ground), p.scheme === 'dark')
      : copy.lookPair(nameOf(p.role), nameOf(p.ground), p.scheme === 'dark', p.more);
  const pairVars = (p: Pair): string => {
    const pal = drawn ? (p.more ? drawn.contrast : drawn.house).schemes[p.scheme] : null;
    return pal ? `--pair-fg: ${pal[p.role]}; --pair-bg: ${pal[p.ground]}` : '';
  };
</script>

<div class="look-open">
  <p class="look-status">{hasOwnLook ? copy.lookOwn : copy.lookHouseNow}</p>
  <div class="look-actions">
    {#if open}
      <Button onclick={close}>{copy.lookClose}</Button>
    {:else}
      <Button onclick={start}>{copy.lookEdit}</Button>
    {/if}
    {#if owner && hasOwnLook}
      <Button onclick={backToHouse} disabled={saving}>{copy.lookHouse}</Button>
    {/if}
  </div>
  {#if !owner}<p class="look-hint">{copy.lookMember}</p>{/if}
</div>

{#if open}
  {#if stagedNone}<p class="look-hint">{copy.lookStagedNone}</p>{/if}
  {#if noHue}
    <p class="look-wrong">{copy.lookNoHue}</p>
  {:else if draft && drawn && palette}
    <div class="look">
      <div class="look-edit">
        {#if fixing}
          <h3 class="look-title">{copy.lookFixAndInstall}</h3>
          <p class="look-hint">{copy.lookStaged}</p>
        {/if}

        <h3 class="look-title">{copy.lookColours}</h3>
        <ul class="roles">
          {#each ROLES as role}
            <li class="role" data-picked={picked === role ? '' : undefined}>
              <div class="role-line">
                <span class="role-name">
                  {nameOf(role)}
                  {#if changed(role, 'light') || changed(role, 'dark')}<span class="role-changed">{copy.lookChanged}</span>{/if}
                </span>
                {#each [['light', copy.lookInLight], ['dark', copy.lookInDark]] as const as [s, label]}
                  <button
                    type="button"
                    class="swatch"
                    style={`--swatch: ${drawn.house.schemes[s][role]}`}
                    aria-label={`${nameOf(role)}, ${label.toLowerCase()}`}
                    aria-pressed={picked === role && scheme === s}
                    data-moved={moved.includes(`${s}:${role}`) ? '' : undefined}
                    onclick={() => pick(role, s)}
                  ></button>
                {/each}
              </div>

              {#if picked === role}
                <div class="role-controls">
                  <p class="look-editing">{scheme === 'dark' ? copy.lookEditingDark(nameOf(role)) : copy.lookEditingLight(nameOf(role))}</p>
                  <Segmented role="group" aria-label={nameOf(role)}>
                    {#each [['nudge', copy.lookNudge], ['pick', copy.lookPick], ['enter', copy.lookEnter]] as const as [m, label]}
                      <button type="button" class="segment" aria-pressed={how === m} data-on={how === m ? '' : undefined} onclick={() => (how = m)}>{label}</button>
                    {/each}
                  </Segmented>

                  {#if how === 'nudge'}
                    <div class="nudges" role="group" aria-label={copy.lookNudge}>
                      {#each NUDGES as n}
                        <Button onclick={() => doNudge(role, n)}>
                          {n === 'darker' ? copy.lookDarker : n === 'lighter' ? copy.lookLighter : n === 'duller' ? copy.lookDuller : n === 'richer' ? copy.lookRicher : n === 'warmer' ? copy.lookWarmer : copy.lookCooler}
                        </Button>
                      {/each}
                    </div>
                  {:else if how === 'pick'}
                    <p class="look-hint">{copy.lookPickHint}</p>
                    <div class="grid" role="group" aria-label={copy.lookPick} style={`--cols: ${GRID_COLS}`}>
                      {#each gridOf(palette[role]) as row}
                        {#each row as cell}
                          {#if cell}
                            <button
                              type="button"
                              class="cell"
                              style={`--swatch: ${cell.hex}`}
                              aria-label={copy.lookPickCell(cell.row + 1, cell.col + 1)}
                              aria-pressed={palette[role] === cell.hex}
                              onclick={() => set(role, cell.hex)}
                            ></button>
                          {:else}
                            <span class="cell-gap"></span>
                          {/if}
                        {/each}
                      {/each}
                    </div>
                  {:else}
                    <form
                      class="enter"
                      onsubmit={(e) => {
                        e.preventDefault();
                        enter(role);
                      }}
                    >
                      <label class="enter-label" for="look-enter">{copy.lookEnterLabel}</label>
                      <div class="field">
                        <input
                          id="look-enter"
                          class="field-input"
                          type="text"
                          inputmode="text"
                          autocomplete="off"
                          spellcheck="false"
                          bind:value={typed}
                          aria-invalid={typedWrong}
                          aria-describedby="look-enter-help"
                        />
                      </div>
                      <p id="look-enter-help" class={typedWrong ? 'look-wrong' : 'look-hint'}>{typedWrong ? copy.lookEnterWrong : copy.lookEnterHelp}</p>
                      <Button type="submit">{copy.lookEnterUse}</Button>
                    </form>
                  {/if}

                  {#if changed(role, scheme)}
                    <Button weight="bare" onclick={() => set(role, null)}>{copy.lookPutBack}</Button>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>

        <h3 class="look-title">{copy.lookCorners}</h3>
        <Segmented role="group" aria-label={copy.lookCorners}>
          {#each [['square', copy.lookSquare], ['soft', copy.lookSoft], ['round', copy.lookRound]] as const as [c, label]}
            <button type="button" class="segment" aria-pressed={draft.corners === c} data-on={draft.corners === c ? '' : undefined} onclick={() => setCorners(c)}>{label}</button>
          {/each}
        </Segmented>

        <h3 class="look-title">{copy.lookDensity}</h3>
        <Segmented role="group" aria-label={copy.lookDensity}>
          {#each [['compact', copy.densityCompact], ['comfortable', copy.densityComfortable], ['roomy', copy.densityRoomy]] as const as [d, label]}
            <button type="button" class="segment" aria-pressed={draft.density === d} data-on={draft.density === d ? '' : undefined} onclick={() => setDensity(d)}>{label}</button>
          {/each}
        </Segmented>

        <h3 class="look-title">{copy.lookGate}</h3>
        {#if shown.length === 0 && refused.length === 0}
          <p class="look-hint">{copy.lookGateFine}</p>
        {:else}
          <ul class="pairs">
            {#each shown as p}
              <li class="pair">
                <span class="pair-sample" style={pairVars(p)} data-text={p.text ? '' : undefined}>
                  {#if p.text}{copy.lookSample}{:else}<span class="pair-bar"></span>{/if}
                </span>
                <span class="pair-words">{pairWords(p)}</span>
                <span class="verdict" data-verdict={p.verdict}>
                  <Icon name={p.verdict === 'fails' ? 'alert' : p.verdict === 'tight' ? 'clock' : 'check'} size="s" />
                  {verdictWord(p)}
                </span>
                {#if p.verdict !== 'fine'}
                  {@const word = fixWord(p)}
                  {#if word}<Button onclick={() => applyFix(p)}>{word}</Button>{/if}
                {/if}
              </li>
            {/each}
            {#each refused as r}
              <li class="pair">
                <span class="pair-words">{copy.lookWhy[r.code] ?? copy.lookWhyElse}</span>
                <span class="verdict" data-verdict="fails">
                  <Icon name="alert" size="s" />
                  {copy.lookFails}
                </span>
                {#if r.role}
                  {@const role = r.role}
                  <Button onclick={() => pick(role, scheme)}>{copy.lookShow(nameOf(role))}</Button>
                {/if}
              </li>
            {/each}
          </ul>
          {#if fine > 0}<p class="look-hint">{copy.lookFineCount(fine)}</p>{/if}
        {/if}

        <div class="look-save">
          {#if !ok}<p class="look-wrong">{copy.lookBlocked}</p>{/if}
          {#if said}<p class="look-wrong" role="status">{said}</p>{/if}
          <Button weight="primary" onclick={save} disabled={!ok || saving}>
            {saving ? copy.lookSaving : !owner ? copy.lookPropose : fixing ? copy.lookInstall : copy.lookSave}
          </Button>
        </div>
      </div>

      <div class="look-specimen">
        <button type="button" class="fold" aria-expanded={foldOpen} aria-controls="look-specimen" onclick={() => (foldOpen = !foldOpen)}>
          <Icon name="chevron" size="s" />
          {copy.lookSpecimenOpen}
        </button>
        <div id="look-specimen" class="specimen-wrap" data-folded={foldOpen ? undefined : ''}>
          <h3 class="look-title">{copy.lookSpecimen}</h3>
          <Segmented role="group" aria-label={copy.lookSpecimen}>
            {#each [['light', copy.lookInLight], ['dark', copy.lookInDark]] as const as [s, label]}
              <button type="button" class="segment" aria-pressed={scheme === s} data-on={scheme === s ? '' : undefined} onclick={() => (scheme = s)}>{label}</button>
            {/each}
          </Segmented>
          {#if painted}<Specimen palette={painted} {draft} />{/if}
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .look-open {
    display: grid;
    gap: var(--sp-3);
  }

  .look-status,
  .look-hint,
  .look-editing {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .look-editing {
    color: var(--ink);
    font-weight: 500;
  }

  .look-wrong {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--red);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .look-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
  }

  /* ONE COLUMN UNTIL 900, the list first and the specimen under it; two from 900, the specimen held in view beside. */
  .look {
    display: grid;
    gap: var(--sp-6);
    margin-block-start: var(--sp-5);
    min-inline-size: 0;
  }

  .look-edit {
    display: grid;
    align-content: start;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .look-title {
    margin: var(--sp-3) 0 0;
    font-size: var(--fs-body);
    font-weight: 600;
  }

  .roles {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .role {
    border-block-end: 1px solid var(--rule);
  }

  .role-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: calc(var(--tap) + var(--sp-2));
  }

  .role-name {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    color: var(--ink);
  }

  .role-changed {
    margin-inline-start: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  /* A SWATCH IS THE COLOUR and 44 on both axes, so a thumb can press either scheme's without a second try. */
  .swatch,
  .cell {
    inline-size: var(--tap);
    block-size: var(--tap);
    padding: 0;
    background: var(--swatch);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-xs);
    cursor: pointer;
  }

  .swatch[aria-pressed='true'],
  .cell[aria-pressed='true'] {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }

  .swatch[data-moved] {
    border: 2px dashed var(--ink);
  }

  .role-controls {
    display: grid;
    gap: var(--sp-3);
    padding-block: var(--sp-2) var(--sp-4);
    min-inline-size: 0;
  }

  .nudges {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--tap));
    gap: var(--sp-1);
    max-inline-size: 100%;
  }

  .cell-gap {
    inline-size: var(--tap);
    block-size: var(--tap);
  }

  .enter {
    display: grid;
    gap: var(--sp-2);
    justify-items: start;
    max-inline-size: 24rem;
  }

  .enter-label {
    color: var(--ink);
    font-size: var(--fs-meta);
  }

  .enter .field {
    inline-size: 100%;
  }

  .pairs {
    display: grid;
    gap: var(--sp-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A VERDICT WRAPS UNDER ITS PAIR when the line runs out, and the fix after it: nothing here scrolls sideways. */
  .pair {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
    padding-block-end: var(--sp-3);
    border-block-end: 1px solid var(--rule);
  }

  .pair-sample {
    display: inline-flex;
    align-items: center;
    min-block-size: var(--tap);
    padding: 0 var(--sp-3);
    background: var(--pair-bg);
    color: var(--pair-fg);
    border-radius: var(--r-xs);
    font-size: var(--fs-body);
  }

  .pair-bar {
    inline-size: var(--sp-7);
    block-size: var(--sp-2);
    background: var(--pair-fg);
    border-radius: var(--r-xs);
  }

  .pair-words {
    flex: 1 1 14rem;
    min-inline-size: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: var(--lh-body);
  }

  .verdict {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    font-size: var(--fs-meta);
    font-weight: 500;
  }

  .verdict[data-verdict='fails'] {
    color: var(--red);
  }

  .verdict[data-verdict='tight'] {
    color: var(--warn);
  }

  .verdict[data-verdict='fine'] {
    color: var(--ink-3);
  }

  .look-save {
    display: grid;
    justify-items: start;
    gap: var(--sp-3);
    margin-block-start: var(--sp-4);
  }

  .look-specimen {
    min-inline-size: 0;
  }

  .specimen-wrap {
    display: grid;
    gap: var(--sp-3);
    min-inline-size: 0;
  }

  .fold {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--tap);
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .fold[aria-expanded='true'] :global(.icon) {
    transform: rotate(var(--open-turn, 90deg));
  }

  @media (width < 900px) {
    .specimen-wrap[data-folded] {
      display: none;
    }
  }

  @media (width >= 900px) {
    .look {
      grid-template-columns: minmax(0, 1fr) minmax(0, 26rem);
    }

    .look-specimen {
      position: sticky;
      inset-block-start: var(--sp-4);
      align-self: start;
    }

    .fold {
      display: none;
    }
  }
</style>
