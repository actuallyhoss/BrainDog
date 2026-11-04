<!--
  THE SEND SHEET: where a row, a question, a project, a run or a sign goes, and what goes with it.

  THE APP'S ONE SHEET (`Sheet.svelte`, narrow): from 900 up a drawer in from the right edge over a dimmed page, 420 wide
  and the window's height; below 900 the bottom sheet with its handle. Esc, a press on the dimmed page and Close shut it,
  the focus stays inside while it is open and goes back to what opened it after (the owner, 3 Nov: "on pc it should show from
  the right side, not from the bottom"). It used to hang under the button as a popover, and rose from the bottom on a
  desk whenever a menu opened it, since a closed menu left nothing to hang from.

  TOP TO BOTTOM: the title names what goes ("Send “Ship webhook retries”"); a search where there are enough to choose
  from; who takes it, one row each with its glyph, its name and one line, the chosen one ticked (Auto, Slash with Quick or
  Deep, each session running now, Claude on each machine with its profile and repository, the next agent to start); a
  note; what is attached, each removable, and + to find more; "Let it make changes", off. The foot's button names where
  it goes. ⌘↵ sends.

  A HOST WITHOUT THE TARGETS DOOR LISTS AUTO AND SLASH ALONE, and Auto goes to Slash.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { apiBase } from '../at.ts';
  import Button from '../ui/Button.svelte';
  import Icon from '../ui/Icon.svelte';
  import type { IconName } from '../ui/icons.ts';
  import IconWell from '../ui/IconWell.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import { toasts } from '../ui/toast.svelte.ts';
  import AttachPicker from './AttachPicker.svelte';
  import { deliver } from './convos.svelte.ts';
  import { autoLine, lastFor, sendWords, targets as readTargets, type Attached, type Target } from './send.ts';
  import type { SheetAsk } from './open.ts';

  let { ask, onclose }: { ask: SheetAsk; onclose: () => void } = $props();

  /** How long the drawer takes to go, so it is unmounted after its close has played and not in the middle of it. */
  const GONE_MS = 320;

  const uid = `send-${Math.random().toString(36).slice(2, 8)}`;
  let open = $state(true);
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
  let q = $state('');
  let body = $state<HTMLElement>();

  /** One way to send, as the sheet draws it: the target, or Auto and Slash, which are the sheet's own. */
  type Way = { id: string; name: string; line: string; icon: IconName; live?: boolean; t?: Target };

  const auto = $derived(autoLine(list ?? null, ask.project ?? null));
  const own = $derived<Way[]>([
    { id: 'auto', name: sendWords.auto, line: auto, icon: 'git-branch' },
    { id: 'slash', name: sendWords.slash, line: '', icon: 'slash' },
  ]);
  const wayOf = (t: Target, icon: IconName): Way => ({ id: t.id, name: t.label, line: t.detail, icon, live: t.live, t });
  const groups = $derived<{ key: string; head: string | null; ways: Way[] }[]>([
    { key: 'own', head: null, ways: own },
    { key: 'session', head: sendWords.running, ways: (list ?? []).filter((t) => t.kind === 'session').map((t) => wayOf(t, 'session')) },
    { key: 'mac', head: sendWords.machines, ways: (list ?? []).filter((t) => t.kind === 'mac').map((t) => wayOf(t, 'monitor')) },
    { key: 'next', head: sendWords.nextUp, ways: (list ?? []).filter((t) => t.kind === 'next').map((t) => wayOf(t, 'clock')) },
  ]);
  const count = $derived(groups.reduce((n, g) => n + g.ways.length, 0));
  /* THE SEARCH SHOWS WHERE THERE ARE ENOUGH TO LOOK THROUGH: two or three rows are read faster than they are searched. */
  const searchable = $derived(count > 3);
  const words = (w: Way) => `${w.name} ${w.line}`.toLocaleLowerCase();
  const shown = $derived.by(() => {
    const said = q.trim().toLocaleLowerCase();
    if (!said) return groups.filter((g) => g.ways.length > 0);
    return groups.map((g) => ({ ...g, ways: g.ways.filter((w) => words(w).includes(said)) })).filter((g) => g.ways.length > 0);
  });
  const chosen = $derived(list?.find((t) => t.id === choice) ?? null);
  /* THE BUTTON SAYS WHERE IT GOES: "Send" for Auto, else "Send to" the target's first name ("Cursor", not its machine). */
  const goWord = $derived(choice === 'auto' ? sendWords.send : sendWords.sendToFull(choice === 'slash' ? sendWords.slash : (chosen?.label.split(' · ')[0] ?? sendWords.slash)));
  const title = $derived(attach.length > 1 ? sendWords.titleMany(attach.length) : sendWords.titleOne(attach[0]?.label ?? ''));

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

  onMount(() => {
    const ctl = new AbortController();
    /* ON A DESK THE CARET GOES TO THE CHOSEN ROW, so the arrows walk the list and typing a letter is not lost; the search
       is one Shift+Tab back. On a phone nothing is focused, which would raise the keyboard over the list. */
    const desk = matchMedia('(width >= 900px) and (pointer: fine)').matches;
    void readTargets(apiBase(), ctl.signal).then((got) => {
      list = got;
      settle(got);
      if (desk)
        queueMicrotask(() => body?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus());
    });
    return () => ctl.abort();
  });

  /** Close: the drawer plays its way out, then the sheet is taken off the page. */
  function shut() {
    open = false;
  }

  function closed() {
    setTimeout(onclose, GONE_MS);
  }

  function onkeydown(e: KeyboardEvent) {
    /* ESC SHUTS THE ATTACH SEARCH FIRST, and the sheet only on the next press; the sheet's own Esc closes it. */
    if (e.key === 'Escape' && picking) {
      e.preventDefault();
      e.stopPropagation();
      picking = false;
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && open) {
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
    shut();
  }

  const remove = (ref: string) => (attach = attach.filter((a) => a.ref !== ref));
  const add = (a: Attached) => {
    if (!attach.some((x) => x.ref === a.ref)) attach = [...attach, a];
    picking = false;
  };
</script>

<svelte:window onkeydowncapture={onkeydown} />

<Sheet bind:open {title} narrow caret={false} onclose={closed}>
  <div class="ss" bind:this={body}>
    <section class="ss-part" aria-labelledby="{uid}-to">
      <h3 class="ss-label" id="{uid}-to">{sendWords.to}</h3>
      {#if searchable}
        <label class="ss-find">
          <Icon name="search" size="s" />
          <span class="ss-vh">{sendWords.find}</span>
          <input type="search" bind:value={q} placeholder={sendWords.find} autocomplete="off" spellcheck="false" />
        </label>
      {/if}

      <div class="ss-ways" role="radiogroup" aria-labelledby="{uid}-to">
        {#each shown as g (g.key)}
          {#if g.head}<p class="ss-group" aria-hidden="true">{g.head}</p>{/if}
          {#each g.ways as w (w.id)}
            <label class="ss-way" data-on={choice === w.id ? '' : undefined}>
              <input class="ss-vh" type="radio" name="{uid}-way" value={w.id} bind:group={choice} />
              <span class="ss-well">
                <IconWell name={w.icon} size="l" tone={choice === w.id ? 'ink' : undefined} />
                {#if w.live}<span class="ss-live" aria-hidden="true"></span>{/if}
              </span>
              <span class="ss-words">
                <span class="ss-name" dir="auto">{w.name}</span>
                {#if w.line}<span class="ss-line" dir="auto">{w.line}</span>{/if}
              </span>
              {#if w.id === 'slash'}
                <Segmented class="ss-mode" role="group" aria-label={sendWords.slash}>
                  <button type="button" class="segment" data-on={mode === 'quick' ? '' : undefined} aria-pressed={mode === 'quick'} onclick={() => ((mode = 'quick'), (choice = 'slash'))}>{sendWords.quick}</button>
                  <button type="button" class="segment" data-on={mode === 'deep' ? '' : undefined} aria-pressed={mode === 'deep'} onclick={() => ((mode = 'deep'), (choice = 'slash'))}>{sendWords.deep}</button>
                </Segmented>
              {:else}
                <span class="ss-tick" aria-hidden="true">{#if choice === w.id}<Icon name="check" size="s" />{/if}</span>
              {/if}
            </label>
            {#if choice === w.id && w.t && (w.t.profiles || w.t.repos)}
              <div class="ss-picks">
                {#if w.t.profiles}
                  <select class="ss-select" bind:value={profile} aria-label={sendWords.profile}>
                    <option value="">{sendWords.anyProfile}</option>
                    {#each w.t.profiles as p (p)}<option value={p}>{p}</option>{/each}
                  </select>
                {/if}
                {#if w.t.repos}
                  <select class="ss-select" bind:value={repo} aria-label={sendWords.repo}>
                    <option value="">{sendWords.anyRepo}</option>
                    {#each w.t.repos as r (r)}<option value={r}>{r}</option>{/each}
                  </select>
                {/if}
              </div>
            {/if}
          {/each}
        {/each}
        {#if list === undefined}
          <p class="ss-wait" role="status" aria-label={sendWords.running}><span class="ss-bar"></span><span class="ss-bar ss-bar-short"></span></p>
        {:else if shown.length === 0}
          <p class="ss-none" role="status">{sendWords.findNone(q.trim())}</p>
        {/if}
      </div>
    </section>

    <section class="ss-part">
      <label class="ss-label" for="{uid}-note">{sendWords.note}</label>
      <textarea id="{uid}-note" class="ss-note" rows="3" bind:value={note} placeholder={sendWords.notePlaceholder}></textarea>
    </section>

    <section class="ss-part" aria-labelledby="{uid}-att">
      <h3 class="ss-label" id="{uid}-att">{sendWords.attached}</h3>
      <ul class="ss-chips">
        {#each attach as a (a.ref)}
          <li class="ss-chip">
            <Icon name="link" size="s" />
            <span class="ss-chip-name" dir="auto">{a.label}</span>
            <button type="button" class="ss-chip-x tap" aria-label={sendWords.remove(a.label)} title={sendWords.remove(a.label)} onclick={() => remove(a.ref)}><Icon name="close" size="s" /></button>
          </li>
        {/each}
        <li>
          <button type="button" class="ss-add tap" aria-label={sendWords.attach} title={sendWords.attach} aria-expanded={picking} onclick={() => (picking = !picking)}><Icon name="plus" size="s" /></button>
        </li>
      </ul>
      {#if picking}<AttachPicker onpick={add} onclose={() => (picking = false)} taken={attach.map((a) => a.ref)} />{/if}
    </section>

    <div class="ss-may">
      <span class="ss-words">
        <span class="ss-name" id="{uid}-may">{sendWords.mayChange}</span>
        <span class="ss-line">{sendWords.mayLine}</span>
      </span>
      <button type="button" class="switch" role="switch" aria-checked={mayChange} aria-labelledby="{uid}-may" onclick={() => (mayChange = !mayChange)}>
        <span class="switch-track" aria-hidden="true"></span>
      </button>
    </div>
  </div>

  {#snippet footer()}
    {#if fix}<p class="ss-fix" role="status">{fix}</p>{/if}
    <Button weight="primary" kbd="⌘↵" disabled={sending} onclick={() => void go()}>{sending ? sendWords.sending : goWord}</Button>
  {/snippet}
</Sheet>

<style>
  /* THREE PARTS 24 APART, each a 12/500 label 8 above what it names, on the sheet body's own 16 edge. */
  .ss {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    font-size: var(--fs-body);
  }

  .ss-part {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-inline-size: 0;
  }

  .ss-label {
    margin: 0;
    font-family: var(--font-ui);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
    line-height: calc(16px * var(--type, 1));
  }

  .ss-vh {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* THE SEARCH: the control's height, the quiet fill, its glyph at the start. */
  .ss-find {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-block-size: var(--ctl-h);
    padding-inline: var(--sp-3);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
  }

  .ss-find:focus-within {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .ss-find input {
    flex: 1;
    min-inline-size: 0;
    block-size: 100%;
    padding: 0;
    background: none;
    border: 0;
    outline: 0;
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-ctl);
  }

  .ss-find input::-webkit-search-cancel-button {
    display: none;
  }

  .ss-ways {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .ss-group {
    margin: var(--sp-3) 0 var(--sp-1);
    padding-inline: var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: var(--fw-medium);
  }

  /* ONE WAY A ROW: its glyph in a 32 well, its name and one line, and a tick at the end on the chosen one, which also
     sits on the quiet fill. The radio is there for a keyboard and a reader, not drawn. */
  .ss-way {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: 52px;
    padding: var(--sp-2);
    border-radius: var(--r-ctl);
    cursor: pointer;
  }

  .ss-way[data-on] {
    background: var(--tile-2);
  }

  .ss-way:has(input:focus-visible) {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  @media (hover: hover) and (pointer: fine) {
    .ss-way:hover:not([data-on]) {
      background: var(--hover);
    }
  }

  .ss-well {
    position: relative;
    display: grid;
  }

  .ss-live {
    position: absolute;
    inset-block-end: -2px;
    inset-inline-end: -2px;
    inline-size: 10px;
    block-size: 10px;
    background: var(--live);
    border: 2px solid var(--tile);
    border-radius: var(--r-round);
  }

  .ss-words {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }

  .ss-name {
    overflow: hidden;
    font-size: var(--fs-ctl);
    font-weight: var(--fw-medium);
    line-height: calc(20px * var(--type, 1));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ss-line {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    line-height: calc(16px * var(--type, 1));
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .ss-tick {
    display: grid;
    place-items: center;
    inline-size: 20px;
    color: var(--ink);
  }

  .ss-way :global(.ss-mode) {
    flex: none;
  }

  .ss-picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: var(--sp-1) var(--sp-2) var(--sp-2) calc(var(--sp-2) + 32px + var(--sp-3));
  }

  .ss-select {
    flex: 1 1 140px;
    min-inline-size: 0;
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
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-3) var(--sp-2);
  }

  .ss-bar {
    display: block;
    block-size: 12px;
    inline-size: 70%;
    background: var(--tile-2);
    border-radius: var(--r-xs);
  }

  .ss-bar-short {
    inline-size: 40%;
  }

  .ss-none {
    margin: 0;
    padding: var(--sp-3) var(--sp-2);
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .ss-note {
    box-sizing: border-box;
    inline-size: 100%;
    min-block-size: 76px;
    padding: var(--sp-2) var(--sp-3);
    background: var(--tile-2);
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    font-size: var(--fs-body);
    line-height: calc(20px * var(--type, 1));
    resize: vertical;
  }

  .ss-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A CHIP: the link glyph, the name cut, and its × to take it off, on the quiet fill. */
  .ss-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    max-inline-size: 100%;
    min-block-size: 32px;
    padding-inline-start: var(--sp-2);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    font-size: var(--fs-ctl);
  }

  .ss-chip-name {
    overflow: hidden;
    max-inline-size: 260px;
    color: var(--ink);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ss-chip-x,
  .ss-add {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
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
    .ss-chip-x:hover,
    .ss-add:hover {
      background: var(--hover);
      color: var(--ink);
    }
  }

  /* LET IT MAKE CHANGES: its name and one line, and the switch at the end, on a hairline above. */
  .ss-may {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding-block-start: var(--sp-4);
    border-block-start: 1px solid var(--rule);
  }

  .ss-may .ss-words {
    flex: 1;
  }

  .ss-fix {
    flex: 1 1 100%;
    margin: 0;
    color: var(--red, var(--ink-2));
    font-size: var(--fs-meta);
  }

  @media (pointer: coarse) {
    .ss-way {
      min-block-size: 56px;
    }

    .ss-find,
    .ss-select {
      min-block-size: var(--tap);
    }
  }
</style>
