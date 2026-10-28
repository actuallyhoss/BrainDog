<!--
  THE SEND SHEET: where a row, a question, a project, a run or a sign goes, and what goes with it.

  IT DROPS FROM WHAT OPENED IT, never a centred modal: a tile 400 wide hung under the button (or the row), clamped to the
  window, with no scrim. ON A PHONE, or with nothing to hang from, it rises from the bottom as the app's bottom sheet does,
  over a scrim, its top corners 16 and a grab handle.

  TOP TO BOTTOM: who takes it, as one radio list (Auto first and chosen, with one line saying what it will do; Slash with
  Quick or Deep; Claude on each machine, with its profile and repository where the runner said; each session running now,
  with its live dot; the next agent on a project), then a note, then what is attached (each removable, and + to find
  more), then "May change", off, with the line that says what always comes back, then Send. ⌘↵ sends, Esc closes.

  A HOST WITHOUT THE TARGETS DOOR LISTS AUTO AND SLASH ALONE, and Auto goes to Slash.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { apiBase } from '../at.ts';
  import { overlays } from '../a11y/keys.svelte.ts';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import AttachPicker from './AttachPicker.svelte';
  import { deliver } from './convos.svelte.ts';
  import { autoLine, lastFor, sendWords, targets as readTargets, type Attached, type Target } from './send.ts';
  import type { SheetAsk } from './open.ts';

  let { ask, onclose }: { ask: SheetAsk; onclose: () => void } = $props();

  const uid = `send-${Math.random().toString(36).slice(2, 8)}`;
  let el = $state<HTMLElement>();
  let list = $state<Target[] | null | undefined>(undefined);
  let choice = $state<string>('auto');
  let mode = $state<'quick' | 'deep'>('quick');
  let note = $state(untrack(() => ask.note ?? ''));
  let attach = $state<Attached[]>(untrack(() => [...ask.attach]));
  let mayChange = $state(false);
  let picking = $state(false);
  let sending = $state(false);
  let fix = $state<string | null>(null);
  let profile = $state('');
  let repo = $state('');
  let pos = $state<{ top: number; left: number; maxH: number } | null>(null);
  let phone = $state(false);

  const macs = $derived(list?.filter((t) => t.kind === 'mac') ?? []);
  const sessions = $derived(list?.filter((t) => t.kind === 'session') ?? []);
  const nexts = $derived(list?.filter((t) => t.kind === 'next') ?? []);
  const chosen = $derived(list?.find((t) => t.id === choice) ?? null);
  const auto = $derived(autoLine(list ?? null, ask.project ?? null));

  /* WHERE IT OPENS: the preset, else the last target for this kind of thing where it is still reachable, else Auto. */
  function settle(got: Target[] | null) {
    const p = ask.preset;
    if (p === 'slash' || p === 'auto') return void (choice = p);
    if (p === 'mac') return void (choice = got?.find((t) => t.kind === 'mac')?.id ?? 'auto');
    if (p && typeof p === 'object') return void (choice = got?.some((t) => t.id === p.id) ? p.id : 'auto');
    const last = lastFor(ask.kind);
    if ('mode' in last) {
      choice = 'slash';
      mode = last.mode === 'deep' ? 'deep' : 'quick';
    } else if (got?.some((t) => t.id === last.target)) choice = last.target;
  }

  function place() {
    phone = matchMedia('(width < 640px)').matches || !ask.anchor;
    if (phone || !ask.anchor) return void (pos = null);
    const r = ask.anchor.getBoundingClientRect();
    const width = Math.min(400, innerWidth - 32);
    const left = Math.max(16, Math.min(r.left, innerWidth - width - 16));
    const below = innerHeight - r.bottom - 16;
    const top = below >= 320 ? r.bottom + 6 : Math.max(16, r.top - Math.min(560, r.top - 16) - 6);
    pos = { top, left, maxH: below >= 320 ? below - 6 : Math.min(560, r.top - 22) };
  }

  onMount(() => {
    overlays.open();
    place();
    const ctl = new AbortController();
    void readTargets(apiBase(), ctl.signal).then((got) => {
      list = got;
      settle(got);
      queueMicrotask(() => el?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus());
    });
    queueMicrotask(() => el?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus());
    /* A PRESS OUTSIDE CLOSES IT, but not the one that opened it, which is still on its way. */
    const away = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (el?.contains(t) || ask.anchor?.contains(t))) return;
      onclose();
    };
    setTimeout(() => document.addEventListener('pointerdown', away, { signal: ctl.signal }), 0);
    addEventListener('resize', place, { signal: ctl.signal });
    return () => {
      ctl.abort();
      overlays.close();
    };
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (picking) picking = false;
      else onclose();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      void go();
    }
  }

  async function go() {
    if (sending) return;
    if (attach.length === 0) {
      fix = sendWords.attachFind;
      return;
    }
    sending = true;
    fix = null;
    const t = chosen;
    const out = await deliver({
      kind: ask.kind,
      target: choice,
      ...(t ? { label: t.label, targetKind: t.kind } : {}),
      mode,
      note,
      fallback: ask.fallback ?? sendWords.firstAsk(attach[0]?.label ?? ''),
      attach: attach.map((a) => a.ref),
      mayChange,
      ...(t?.kind === 'mac' && profile ? { profile } : {}),
      ...(t?.kind === 'mac' && repo ? { repo } : {}),
    });
    sending = false;
    if (!out.ok) {
      fix = out.text;
      return;
    }
    toasts.push(sendWords.sent(out.label));
    onclose();
  }

  const remove = (ref: string) => (attach = attach.filter((a) => a.ref !== ref));
  const add = (a: Attached) => {
    if (!attach.some((x) => x.ref === a.ref)) attach = [...attach, a];
    picking = false;
  };
</script>

<svelte:window onkeydowncapture={onkeydown} />

{#if phone}<div class="ss-scrim" aria-hidden="true"></div>{/if}
<div
  bind:this={el}
  class="ss"
  data-phone={phone ? '' : undefined}
  role="dialog"
  aria-modal="false"
  aria-labelledby="{uid}-h"
  style:inset-block-start={pos ? `${pos.top}px` : undefined}
  style:inset-inline-start={pos ? `${pos.left}px` : undefined}
  style:max-block-size={pos ? `${pos.maxH}px` : undefined}
>
  {#if phone}<span class="ss-grab" aria-hidden="true"></span>{/if}
  <div class="ss-head">
    <h2 class="ss-title" id="{uid}-h">{sendWords.sheet}</h2>
    <button type="button" class="ss-x tap" aria-label={sendWords.close} onclick={onclose}><Icon name="close" size="s" /></button>
  </div>

  <div class="ss-body">
    <fieldset class="ss-to">
      <legend class="ss-vh">{sendWords.sheet}</legend>
      <label class="ss-opt" data-on={choice === 'auto' ? '' : undefined}>
        <input type="radio" name="{uid}-to" value="auto" bind:group={choice} />
        <span class="ss-words"><span class="ss-name">{sendWords.auto}</span><span class="ss-line">{auto}</span></span>
      </label>
      <label class="ss-opt" data-on={choice === 'slash' ? '' : undefined}>
        <input type="radio" name="{uid}-to" value="slash" bind:group={choice} />
        <span class="ss-words"><span class="ss-name">{sendWords.slash}</span></span>
        <span class="segmented ss-mode" role="group" aria-label={sendWords.slash}>
          <button type="button" class="segment" data-on={mode === 'quick' ? '' : undefined} aria-pressed={mode === 'quick'} onclick={() => ((mode = 'quick'), (choice = 'slash'))}>{sendWords.quick}</button>
          <button type="button" class="segment" data-on={mode === 'deep' ? '' : undefined} aria-pressed={mode === 'deep'} onclick={() => ((mode = 'deep'), (choice = 'slash'))}>{sendWords.deep}</button>
        </span>
      </label>
      {#each macs as t (t.id)}
        <label class="ss-opt" data-on={choice === t.id ? '' : undefined}>
          <input type="radio" name="{uid}-to" value={t.id} bind:group={choice} />
          <span class="ss-words"><span class="ss-name" dir="auto">{t.label}</span>{#if t.detail}<span class="ss-line" dir="auto">{t.detail}</span>{/if}</span>
        </label>
        {#if choice === t.id && (t.profiles || t.repos)}
          <div class="ss-picks">
            {#if t.profiles}
              <label class="ss-pick"><span class="ss-vh">{sendWords.profile}</span>
                <select class="ss-select" bind:value={profile} aria-label={sendWords.profile}>
                  <option value="">{sendWords.anyProfile}</option>
                  {#each t.profiles as p (p)}<option value={p}>{p}</option>{/each}
                </select>
              </label>
            {/if}
            {#if t.repos}
              <label class="ss-pick"><span class="ss-vh">{sendWords.repo}</span>
                <select class="ss-select" bind:value={repo} aria-label={sendWords.repo}>
                  <option value="">{sendWords.anyRepo}</option>
                  {#each t.repos as r (r)}<option value={r}>{r}</option>{/each}
                </select>
              </label>
            {/if}
          </div>
        {/if}
      {/each}
      {#if sessions.length > 0}
        <p class="ss-group" aria-hidden="true">{sendWords.running}</p>
        {#each sessions as t (t.id)}
          <label class="ss-opt" data-on={choice === t.id ? '' : undefined}>
            <input type="radio" name="{uid}-to" value={t.id} bind:group={choice} />
            <span class="ss-words">
              <span class="ss-name" dir="auto">{#if t.live}<span class="ss-live" aria-hidden="true"></span>{/if}{t.label}</span>
              {#if t.detail}<span class="ss-line" dir="auto">{t.detail}</span>{/if}
            </span>
          </label>
        {/each}
      {/if}
      {#each nexts as t (t.id)}
        <label class="ss-opt" data-on={choice === t.id ? '' : undefined}>
          <input type="radio" name="{uid}-to" value={t.id} bind:group={choice} />
          <span class="ss-words"><span class="ss-name" dir="auto">{t.label}</span>{#if t.detail}<span class="ss-line" dir="auto">{t.detail}</span>{/if}</span>
        </label>
      {/each}
      {#if list === undefined}<p class="ss-wait" role="status"><span class="ss-bar"></span></p>{/if}
    </fieldset>

    <label class="ss-label" for="{uid}-note">{sendWords.note}</label>
    <textarea id="{uid}-note" class="ss-note" rows="2" bind:value={note} placeholder={sendWords.notePlaceholder}></textarea>

    <div class="ss-attached" role="group" aria-label={sendWords.attached}>
      <span class="ss-label">{sendWords.attached}</span>
      <ul class="ss-chips">
        {#each attach as a (a.ref)}
          <li class="ss-chip">
            <span class="ss-chip-name" dir="auto">{a.label}</span>
            <button type="button" class="ss-chip-x tap" aria-label={sendWords.remove(a.label)} onclick={() => remove(a.ref)}><Icon name="close" size="s" /></button>
          </li>
        {/each}
        <li>
          <button type="button" class="ss-add tap" aria-label={sendWords.attach} aria-expanded={picking} onclick={() => (picking = !picking)}><Icon name="plus" size="s" /></button>
        </li>
      </ul>
      {#if picking}<AttachPicker onpick={add} onclose={() => (picking = false)} taken={attach.map((a) => a.ref)} />{/if}
    </div>

    <label class="ss-may">
      <input type="checkbox" bind:checked={mayChange} />
      <span class="ss-words"><span class="ss-name">{sendWords.mayChange}</span><span class="ss-line">{sendWords.mayLine}</span></span>
    </label>
  </div>

  <div class="ss-foot">
    {#if fix}<p class="ss-fix" role="status">{fix}</p>{/if}
    <Button weight="primary" kbd="⌘↵" disabled={sending} onclick={() => void go()}>{sending ? sendWords.sending : sendWords.send}</Button>
  </div>
</div>

<style>
  /* A TILE HUNG FROM WHAT OPENED IT: flat, the tile's colour, one 1px edge as every menu has, radius 16, no shadow. */
  .ss {
    position: fixed;
    z-index: var(--z-palette);
    display: flex;
    flex-direction: column;
    inline-size: min(400px, calc(100vw - 32px));
    max-block-size: min(640px, calc(100dvh - 32px));
    background: var(--tile);
    border: 1px solid var(--rule-strong);
    border-radius: var(--r-tile);
    color: var(--ink);
    font-size: var(--fs-body);
    animation: ss-drop var(--d-menu) var(--ease-out);
  }

  @keyframes ss-drop {
    from {
      opacity: 0;
    }
  }

  /* ON A PHONE, THE BOTTOM SHEET: the window's width, its top corners 16, above the keyboard, up from below. */
  .ss[data-phone] {
    inset-inline: 0;
    inset-block-end: var(--kb);
    inline-size: auto;
    max-block-size: calc(88dvh - var(--kb));
    border: 0;
    border-end-start-radius: 0;
    border-end-end-radius: 0;
    padding-block-end: env(safe-area-inset-bottom);
    animation: ss-rise var(--d-panel) var(--ease-sheet);
  }

  @keyframes ss-rise {
    from {
      transform: translateY(100%);
    }
  }

  .ss-scrim {
    position: fixed;
    inset: 0;
    z-index: var(--z-palette);
    background: var(--scrim);
  }

  .ss-grab {
    align-self: center;
    inline-size: 36px;
    block-size: 4px;
    margin-block-start: var(--sp-2);
    background: var(--rule-strong);
    border-radius: var(--r-xs);
  }

  .ss-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding-block: var(--sp-3) 0;
    padding-inline: var(--sp-4) var(--sp-3);
  }

  .ss-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--fs-head);
    font-weight: var(--fw-semi);
  }

  .ss-x {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .ss-body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .ss-to {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .ss-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* ONE TARGET A ROW: its radio, its name and one line, the chosen one on the hover fill. */
  .ss-opt,
  .ss-may {
    display: flex;
    align-items: flex-start;
    gap: var(--sp-3);
    min-block-size: 40px;
    padding: var(--sp-2) var(--sp-2);
    border-radius: var(--r-ctl);
    cursor: pointer;
  }

  .ss-opt[data-on] {
    background: var(--tile-2);
  }

  @media (hover: hover) and (pointer: fine) {
    .ss-opt:hover:not([data-on]) {
      background: var(--hover);
    }
  }

  .ss-opt input,
  .ss-may input {
    flex: none;
    margin: 0;
    margin-block-start: 3px;
    accent-color: var(--ink);
  }

  .ss-words {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .ss-name {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
  }

  .ss-line {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    line-height: 1.4;
  }

  .ss-mode {
    flex: none;
    align-self: center;
  }

  .ss-live {
    flex: none;
    inline-size: 7px;
    block-size: 7px;
    background: var(--live);
    border-radius: var(--r-round);
  }

  .ss-group {
    margin: 0;
    margin-block-start: var(--sp-2);
    padding-inline: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .ss-picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding-inline-start: calc(var(--sp-2) + 13px + var(--sp-3));
  }

  .ss-select {
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-2);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  .ss-wait {
    margin: 0;
    padding: var(--sp-2);
  }

  .ss-bar {
    display: block;
    block-size: 12px;
    inline-size: 60%;
    background: var(--tile-2);
    border-radius: var(--r-xs);
  }

  .ss-label {
    color: var(--ink-2);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  .ss-note {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 64px;
    margin-block-start: calc(var(--sp-2) * -1);
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    resize: vertical;
  }

  .ss-attached {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }

  .ss-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CHIP IS A RECTANGLE, the quiet fill, its name cut, and its × to take it off. */
  .ss-chip {
    display: inline-flex;
    align-items: center;
    max-inline-size: 100%;
    min-block-size: 28px;
    padding-inline-start: var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    font-size: var(--fs-ctl);
  }

  .ss-chip-name {
    overflow: hidden;
    max-inline-size: 240px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ss-chip-x,
  .ss-add {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
    background: none;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .ss-add {
    background: var(--tile-2);
    color: var(--ink-2);
  }

  @media (hover: hover) and (pointer: fine) {
    .ss-x:hover,
    .ss-chip-x:hover,
    .ss-add:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  .ss-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .ss-fix {
    flex: 1 1 100%;
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .ss[data-phone] .ss-foot :global(.btn) {
    flex: 1;
  }

  @media (pointer: coarse) {
    .ss-opt,
    .ss-may {
      min-block-size: var(--tap);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ss,
    .ss[data-phone] {
      animation: ss-drop 120ms linear;
    }
  }
</style>
