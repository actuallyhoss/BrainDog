<!--
  The files one thing holds, where the thing shows: a task's page, a project's page, a row's drawer. A drop zone, the
  files one line each (an icon for what it is, its name, "PDF · 1.2 MB · Maya, 2h ago"), and under each its verbs:
  Rename, Download, Remove. Pressed, a file opens in its viewer (`AttachmentViewer.svelte`, loaded by `import()` then).

  DROP FILES ANYWHERE ON IT, or press "Attach a file" for the picker, several at once. Each one sent says so on its own
  line while it goes, and the record's own sentence if it is refused (too big, a key in it). The bytes go to the file
  door first and the record is told after (`attached.ts` `attach`).

  REMOVE LEAVES ITS UNDO WHERE THE FILE WAS: "Removed brief.pdf. Undo", which puts it back at the version it stood at.
  The record keeps the bytes and the history either way.

  READ WHEN IT NEARS THE SCREEN, as `VisualStrip` is, so a long page asks the record only for what is scrolled to.
  `tile` wraps it in its own tile with a heading, for a page of tiles; elsewhere it is a heading and its rows.
  `on` names the thing as the record takes it: `tasks#3`, `SG12`, `D4`.
-->
<script lang="ts">
  import { page } from '$app/state';
  import { apiBase } from '$lib/at.ts';
  import { actor } from '$lib/record/names.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { IconName } from '$lib/ui/icons.ts';
  import Tile from '$lib/ui/Tile.svelte';
  import { since } from 'braindog-render';
  import { attach, attachWords as words, change, download, iconOf, kindWord, readList, sizeOf, type Listed } from './attached.ts';

  let { on, tile = false }: { on: string; tile?: boolean | undefined } = $props();

  const uid = $props.id();
  let box = $state<HTMLElement>();
  let picker = $state<HTMLInputElement>();
  let near = $state(false);
  let files = $state.raw<Listed[]>([]);
  let over = $state(false);
  /** Files on their way, each with what it is doing or why it was refused. */
  let going = $state<{ key: number; name: string; fix: string }[]>([]);
  let key = 0;
  /** The file whose verbs are open, the one being renamed, and the last one removed (its Undo). */
  let opened = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let newName = $state('');
  let removed = $state.raw<Listed | null>(null);
  let said = $state('');
  /** The file pressed, and whether its viewer is up; the viewer stays mounted once opened, to close the way it came. */
  let pressed = $state.raw<Listed | null>(null);
  let viewing = $state(false);

  const me = $derived(String(page.data.me?.person ?? '') || null);
  const names = $derived(new Map(Object.entries((page.data.names ?? {}) as Record<string, string>)));
  const now = $derived(Date.now());
  const madeLine = (f: Listed): string => {
    const who = actor(f.by, me, names).name;
    return f.at === '' ? who : words.made(who, since(f.at, now));
  };

  $effect(() => {
    if (!box || near) return;
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        near = true;
        seen.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    seen.observe(box);
    return () => seen.disconnect();
  });

  async function load() {
    const got = await readList(apiBase(), on);
    files = got.ok ? got.value : [];
  }

  $effect(() => {
    void on;
    if (near) void load();
  });

  async function send(list: FileList | File[]) {
    said = '';
    const all = [...list];
    for (const file of all) {
      const mine = ++key;
      going = [...going, { key: mine, name: file.name, fix: '' }];
      const out = await attach(apiBase(), on, file);
      if (out.ok) {
        going = going.filter((g) => g.key !== mine);
        said = out.value.said;
      } else going = going.map((g) => (g.key === mine ? { ...g, fix: out.fix } : g));
    }
    await load();
  }

  function chosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) void send(input.files);
    input.value = '';
  }

  /* A DROP: only one that carries files is taken, so text dragged across the page is left to what it was meant for. */
  const carriesFiles = (e: DragEvent): boolean => [...(e.dataTransfer?.types ?? [])].includes('Files');
  function ondragover(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    over = true;
  }
  function ondragleave(e: DragEvent) {
    if (box && e.relatedTarget instanceof Node && box.contains(e.relatedTarget)) return;
    over = false;
  }
  function ondrop(e: DragEvent) {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    over = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) void send(e.dataTransfer.files);
  }

  function startRename(f: Listed) {
    renaming = f.id;
    newName = f.name;
    said = '';
  }

  async function saveRename(f: Listed) {
    const name = newName.trim();
    if (name === '' || name === f.name) {
      renaming = null;
      return;
    }
    const out = await change(apiBase(), 'renameAttachment', { id: f.id, name });
    said = out.ok ? out.value : out.fix;
    if (out.ok) renaming = null;
    await load();
  }

  async function remove(f: Listed) {
    const out = await change(apiBase(), 'removeAttachment', { id: f.id });
    opened = null;
    if (!out.ok) {
      said = out.fix;
      return;
    }
    removed = f;
    said = '';
    await load();
  }

  async function undo() {
    if (removed === null) return;
    const back = removed;
    const out = await change(apiBase(), 'restoreAttachment', { id: back.id });
    said = out.ok ? out.value : out.fix;
    if (out.ok) removed = null;
    await load();
  }

  async function save(f: Listed) {
    if (!(await download(apiBase(), f))) said = words.notReached;
  }

  function open(f: Listed) {
    pressed = f;
    viewing = true;
  }
</script>

{#snippet body()}
  <div class="at-drop" data-over={over ? '' : undefined}>
    <Button size="sm" onclick={() => picker?.click()}>
      <Icon name="plus" size="s" />
      {words.add}
    </Button>
    <span class="at-hint" id="{uid}-hint">{over ? words.drop : words.dropHint}</span>
    <input bind:this={picker} class="at-picker" type="file" multiple tabindex="-1" aria-hidden="true" onchange={chosen} />
  </div>

  {#if going.length > 0}
    <ul class="at-going" aria-live="polite">
      {#each going as g (g.key)}
        <li class="at-go" data-fix={g.fix ? '' : undefined}>
          <span class="at-go-name" dir="auto">{g.fix ? g.fix : words.sending(g.name)}</span>
          {#if g.fix}
            <button type="button" class="at-x tap" aria-label={words.close} onclick={() => (going = going.filter((x) => x.key !== g.key))}><Icon name="close" size="s" /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if removed}
    <p class="at-said" role="status">
      {words.removed(removed.name)}
      <button type="button" class="at-undo" onclick={() => void undo()}>{words.undo}</button>
    </p>
  {:else if said}
    <p class="at-said" role="status">{said}</p>
  {/if}

  {#if files.length > 0}
    <ul class="at-list">
      {#each files as f (f.id)}
        <li class="at-one">
          {#if renaming === f.id}
            <form class="at-rename" onsubmit={(e) => (e.preventDefault(), void saveRename(f))}>
              <label class="at-sr" for="{uid}-{f.id}">{words.renameTo(f.name)}</label>
              <input id="{uid}-{f.id}" class="at-input" bind:value={newName} maxlength="200" />
              <Button size="sm" type="submit" weight="primary">{words.save}</Button>
              <Button size="sm" onclick={() => (renaming = null)}>{words.cancel}</Button>
            </form>
          {:else}
            <div class="at-row">
              <button type="button" class="at-file tap" aria-label={words.open(f.name)} onclick={() => open(f)}>
                <span class="at-icon" data-kind={f.kind} aria-hidden="true"><Icon name={iconOf(f.kind) as IconName} size="m" /></span>
                <span class="at-words">
                  <span class="at-name" dir="auto">{f.name}</span>
                  <span class="at-meta">{kindWord(f.kind, f.name)} · {sizeOf(f.bytes)} · {madeLine(f)}{#if f.versions > 1}{' · '}{words.version(f.version)}{/if}</span>
                </span>
              </button>
              <button
                type="button"
                class="at-more tap"
                aria-label={words.menu(f.name)}
                aria-expanded={opened === f.id}
                aria-controls="{uid}-do-{f.id}"
                onclick={() => (opened = opened === f.id ? null : f.id)}
              >
                <Icon name="more" size="m" />
              </button>
            </div>
            {#if opened === f.id}
              <div class="at-do" id="{uid}-do-{f.id}">
                <Button size="sm" weight="bare" onclick={() => ((opened = null), startRename(f))}><Icon name="edit" size="s" />{words.rename}</Button>
                <Button size="sm" weight="bare" onclick={() => void save(f)}><Icon name="download" size="s" />{words.download}</Button>
                <Button size="sm" weight="bare" onclick={() => void remove(f)}><Icon name="trash" size="s" />{words.remove}</Button>
              </div>
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<div
  class="at"
  bind:this={box}
  role="group"
  aria-label={words.heading}
  aria-describedby="{uid}-hint"
  {ondragover}
  ondragenter={ondragover}
  {ondragleave}
  {ondrop}
>
  {#if tile}
    <Tile icon="link" title={words.heading} count={files.length || undefined}>{@render body()}</Tile>
  {:else}
    <section class="at-part" aria-label={words.heading}>
      <h3 class="at-h">{words.heading}{#if files.length > 0}<span class="at-count">{files.length}</span>{/if}</h3>
      {@render body()}
    </section>
  {/if}
</div>

{#if pressed}
  {#await import('./AttachmentViewer.svelte') then { default: AttachmentViewer }}
    {#key pressed.id}<AttachmentViewer bind:open={viewing} id={pressed.id} name={pressed.name} />{/key}
  {/await}
{/if}

<style>
  .at-part {
    display: grid;
    gap: 8px;
  }

  .at-h {
    display: flex;
    gap: 6px;
    margin: 0;
    color: var(--ink-3);
    font-size: var(--fs-meta);
    font-weight: 600;
  }

  .at-count {
    font-weight: 500;
  }

  /* THE DROP ZONE: the verb, and what it takes in words. Under a dragged file it says so and takes the accent's ring. */
  .at-drop {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 8px;
    border: 1px dashed var(--rule);
    border-radius: var(--r-ctl);
  }

  .at-drop[data-over] {
    border-style: solid;
    border-color: var(--accent, var(--ink-2));
    background: var(--tile-2);
  }

  .at-hint {
    flex: 1 1 200px;
    color: var(--ink-3);
    font-size: var(--fs-meta);
  }

  .at-picker {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .at-going,
  .at-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .at-go {
    display: flex;
    align-items: center;
    gap: 8px;
    min-block-size: 32px;
    padding: 0 8px;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .at-go[data-fix] {
    color: var(--ink);
    background: var(--tile-2);
    border-radius: var(--r-ctl);
  }

  .at-go-name {
    flex: 1;
    min-inline-size: 0;
  }

  .at-x {
    display: grid;
    place-items: center;
    inline-size: 32px;
    block-size: 32px;
    padding: 0;
    background: transparent;
    border: 0;
    color: var(--ink-3);
    cursor: pointer;
  }

  .at-said {
    margin: 0;
    color: var(--ink-2);
    font-size: var(--fs-meta);
  }

  .at-undo {
    margin-inline-start: 6px;
    padding: 0;
    background: none;
    border: 0;
    color: var(--ink);
    font: inherit;
    font-weight: 600;
    text-decoration: underline;
    cursor: pointer;
  }

  .at-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .at-file {
    flex: 1;
    min-inline-size: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    min-block-size: 52px;
    padding: 6px 8px;
    text-align: start;
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }

  .at-file:hover {
    background: var(--tile-2);
  }

  .at-icon {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: 36px;
    block-size: 36px;
    border-radius: var(--r-xs);
    background: var(--tile-2);
    color: var(--ink-2);
  }

  .at-words {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
  }

  .at-name {
    font-size: var(--fs-body);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .at-meta {
    color: var(--ink-3);
    font-size: var(--fs-meta);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .at-more {
    flex: none;
    display: grid;
    place-items: center;
    inline-size: var(--ctl-h);
    block-size: var(--ctl-h);
    padding: 0;
    background: transparent;
    border: 0;
    border-radius: var(--r-ctl);
    color: var(--ink-3);
    cursor: pointer;
  }

  .at-more:hover,
  .at-more[aria-expanded='true'] {
    background: var(--tile-2);
    color: var(--ink);
  }

  .at-do {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 0 6px 56px;
  }

  .at-rename {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
  }

  .at-input {
    flex: 1 1 200px;
    min-inline-size: 0;
    block-size: var(--ctl-h);
    padding: 0 10px;
    background: var(--tile-2);
    border: 1px solid var(--rule);
    border-radius: var(--r-ctl);
    color: var(--ink);
    font: inherit;
  }

  .at-sr {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (width < 640px) {
    .at-do {
      padding-inline-start: 8px;
    }
  }
</style>
