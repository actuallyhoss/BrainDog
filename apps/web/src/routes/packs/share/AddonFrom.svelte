<!--
  The second mode of `/packs/share`: an add-on from what a person made (SHL-B09). The record offers its own things
  (`exportPack` with no `declarations`), the person ticks some and names the add-on, and the record writes the file and
  says what it would add, asked again once the ticks and the title rest. Download saves the file under its name.

  DECLARATIONS ONLY: the ticked ids and a title go to the record, never `rows`. NOTHING IS PUBLISHED FROM HERE:
  publishing an add-on goes through the Kennel's own door, which this mode does not open.

  A HOST WITHOUT `exportPack` says one quiet line and nothing else. Its CSS lives here: the route is lazy and nothing
  of this joins the entry.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase } from '$lib/at.ts';
  import { createClient } from '@braindog/client';
  import { read } from '$lib/data/record.ts';
  import { saveDog } from '$lib/dog/source.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { addonId, argsOf, fileName, groupsOf, offeredOf, previewLines, quietOf, words, writtenOf, type Line, type Offered, type Written } from './addon-from.ts';

  /** How long the ticks and the title rest before the record is asked again: one ask per pause, never one per key. */
  const DRAFT_WAIT_MS = 600;
  const VERSION = '1.0.0';

  type Answer = { ok: true; value: unknown } | { ok: false; refusal?: { code: string; fix: string } };
  type Asks = { exportPack?: (args: Record<string, unknown>) => Promise<Answer>; call: (name: string, args: Record<string, unknown>) => Promise<Answer> };

  let client = $state.raw<Asks | null>(null);
  let offered = $state.raw<Offered[] | null>(null);
  /** One sentence instead of the form: the quiet line, or the record's own refusal. */
  let said = $state<string | null>(null);
  let ticks = $state.raw<ReadonlySet<string>>(new Set());
  let title = $state('');
  let busy = $state(false);
  let wrong = $state<string | null>(null);
  let draft = $state.raw<{ state: 'reading' } | { state: 'ready'; written: Written; lines: Line[] } | { state: 'refused'; fix: string } | null>(null);

  const groups = $derived(offered ? groupsOf(offered) : []);
  const fallbackFile = $derived(fileName(addonId(title || words.untitledAddon), VERSION));

  /* THE SAME CALL AS `exportUseCase` ON THE USE CASE MODE, by its name on the client; a client built before the name
     was added asks for it by name, and a host that has none answers ROUTE_UNKNOWN, which is the quiet line. */
  const ask = (c: Asks, args: Record<string, unknown>): Promise<Answer> => (c.exportPack ? c.exportPack(args) : c.call('exportPack', args));
  const fixOf = (out: Answer): string => (!out.ok && out.refusal ? (quietOf(out.refusal) ?? out.refusal.fix) : words.cannot);

  onMount(() => {
    void read(async () => {
      const c = createClient({ base: apiBase() }) as unknown as Asks;
      client = c;
      const out = await ask(c, {});
      if (!out.ok) {
        said = fixOf(out);
        return false;
      }
      offered = offeredOf(out.value);
      return true;
    });
  });

  function tick(id: string, on: boolean) {
    const next = new Set(ticks);
    if (on) next.add(id);
    else next.delete(id);
    ticks = next;
  }

  /** Each draft carries its number, so an answer that arrives after a later one began is dropped. */
  let drafts = 0;

  async function redraft(c: Asks, args: ReturnType<typeof argsOf>) {
    const mine = ++drafts;
    if (args.declarations.length === 0) {
      draft = null;
      return;
    }
    if (draft === null) draft = { state: 'reading' };
    const out = await ask(c, args);
    if (mine !== drafts) return;
    const written = out.ok ? writtenOf(out.value, fileName(addonId(args.title), args.version)) : null;
    draft = written ? { state: 'ready', written, lines: previewLines(written, offered ?? []) } : { state: 'refused', fix: fixOf(out) };
  }

  /* ASKED AGAIN ONCE THE TICKS AND THE TITLE REST: a change to either restarts the wait, and leaving clears it. */
  $effect(() => {
    if (!client || !offered) return;
    const c = client;
    const args = argsOf(offered, ticks, title, VERSION);
    const timer = setTimeout(() => void redraft(c, args), DRAFT_WAIT_MS);
    return () => clearTimeout(timer);
  });

  async function download() {
    if (!client || !offered || busy || ticks.size === 0) return;
    busy = true;
    wrong = null;
    try {
      const args = argsOf(offered, ticks, title, VERSION);
      const out = await ask(client, args);
      const written = out.ok ? writtenOf(out.value, fallbackFile) : null;
      if (!written) {
        wrong = fixOf(out);
        return;
      }
      saveDog(written.file, written.text);
      toasts.push(words.downloaded(written.file), { intent: 'good' });
    } finally {
      busy = false;
    }
  }
</script>

<div class="addon">
  {#if said}
    <p class="quiet">{said}</p>
  {:else if offered === null}
    <p class="quiet" role="status">{words.reading}</p>
  {:else if offered.length === 0}
    <p class="quiet">{words.nothing}</p>
  {:else}
    <form
      class="addon-form"
      onsubmit={(e) => {
        e.preventDefault();
        void download();
      }}
    >
      <Section title={words.picks} {...ticks.size > 0 ? { count: ticks.size } : {}}>
        {#each groups as group (group.kind)}
          <fieldset class="group">
            <legend class="group-h">{group.heading}</legend>
            {#each group.items as item (item.id)}
              <label class="pick">
                <input type="checkbox" checked={ticks.has(item.id)} onchange={(e) => tick(item.id, e.currentTarget.checked)} />
                <span>{item.title}</span>
              </label>
            {/each}
          </fieldset>
        {/each}
      </Section>

      <div class="pair">
        <label class="field-label" for="addon-title">{words.title}</label>
        <div class="field"><input class="field-input" id="addon-title" type="text" autocomplete="off" placeholder={words.untitledAddon} bind:value={title} /></div>
      </div>

      <Tile icon="eye" title={words.preview} count={draft?.state === 'ready' && draft.lines.length > 0 ? draft.lines.length : undefined}>
        {#if draft === null}
          <p class="quiet">{words.previewNone}</p>
        {:else if draft.state === 'reading'}
          <p class="quiet" role="status">{words.drafting}</p>
        {:else if draft.state === 'refused'}
          <p class="quiet">{draft.fix}</p>
        {:else}
          <ul class="lines">
            {#each draft.lines as line, i (i)}
              <li>{line.text}{#if line.detail}<span class="detail">{line.detail}</span>{/if}</li>
            {/each}
          </ul>
        {/if}
      </Tile>

      {#if wrong}<p class="quiet" role="alert">{wrong}</p>{/if}
      <div class="actions">
        <Button weight="primary" type="submit" disabled={busy || ticks.size === 0}>{words.download}</Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .addon,
  .addon-form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    min-inline-size: 0;
  }

  /* EVERY LINE OF THIS MODE IS 15 OR MORE, in the ink or the quiet ink: red is the primary button's alone. */
  .quiet {
    margin: 0;
    max-inline-size: var(--measure);
    color: var(--dim);
    font-size: var(--t-base);
    line-height: 22px;
  }

  .group {
    display: flex;
    flex-direction: column;
    margin: var(--sp-3) 0 0;
    padding: 0;
    border: 0;
  }

  .group-h {
    padding: 0;
    margin-block-end: var(--sp-1);
    color: var(--ink);
    font-size: var(--t-row);
    font-weight: 600;
    line-height: 20px;
  }

  /* A TICK IS THE WHOLE LINE, 44 tall, so the box and its name are one target. */
  .pick {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-block-size: var(--tap);
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .pair {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-inline-size: var(--measure);
    min-inline-size: 0;
  }

  .pair .field-label {
    margin: 0;
  }

  /* WHAT IT WOULD ADD, ONE LINE EACH, the reason under a thing brought along. */
  .lines {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--ink);
    font-size: var(--t-base);
    line-height: 20px;
  }

  .lines li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: var(--sp-2);
  }

  .lines li + li {
    border-block-start: 1px solid var(--line);
  }

  .detail {
    color: var(--dim);
    font-size: var(--t-base);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
