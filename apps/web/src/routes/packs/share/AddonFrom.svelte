<!--
  The second mode of `/packs/share`: an add-on from what a person made (SHL-B09). The record offers its own things
  (`exportPack` with no `declarations`), the person ticks some and names the add-on, and the record writes the file and
  says what it would add, asked again once the ticks and the title rest. Download saves the file under its name.

  DECLARATIONS ONLY: the ticked ids, a title and one line go to the record, never `rows`. PUBLISH SENDS THE SAME FILE TO
  THE STORE (the Kennel) as this person, signed by the key this browser keeps; it waits for the operator's review, who
  approves or declines with a reason, and is listed to everyone once approved. Under the form, what this person has
  published can be taken back out (a yank: copies already installed keep working).

  A HOST WITHOUT `exportPack` says one quiet line and nothing else. Its CSS lives here: the route is lazy and nothing
  of this joins the entry.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiBase, at } from '$lib/at.ts';
  import { createClient } from '@braindog/client';
  import { read } from '$lib/data/record.ts';
  import { saveDog } from '$lib/dog/source.ts';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import Section from '$lib/ui/Section.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { kennelFetch, publishedHref, publishedLink, publishedSaid, submitToKennel, type Submitted } from '$lib/market/publish.ts';
  import { minesOf, personOf, readIndex, unpublish, unpublishWords, type Mine } from '$lib/market/unpublish.ts';
  import { addonId, argsOf, asksOf, fileName, groupsOf, offeredOf, previewLines, quietOf, summaryOf, words, writtenOf, type Line, type Offered, type Written } from './addon-from.ts';

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
  let summary = $state('');
  let publishing = $state(false);
  let sent = $state.raw<(Submitted & { title: string }) | null>(null);
  /** What the file asks permission for, read as the store reads it, once a draft is ready. */
  let asks = $state.raw<string[]>([]);
  let mine = $state.raw<Mine[]>([]);
  let taking = $state<string | null>(null);
  let took = $state<string | null>(null);
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
      void loadMine(c);
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
    asks = written ? await asksFrom(written.text) : [];
  }

  /* READ AS THE STORE READS THE FILE (`reachOf`), so the words shown here are the ones a stranger is asked before installing. */
  async function asksFrom(file: string): Promise<string[]> {
    try {
      const { readCatalogueFile, reachOf } = await import('@braindog/declare/catalogue');
      const read = await readCatalogueFile(file, { kind: 'kennel' });
      return read.ok ? asksOf(reachOf(read.value)) : [];
    } catch {
      return [];
    }
  }

  /** The listings this browser's key or this person published, for the list under the form. */
  async function loadMine(c: Asks) {
    try {
      const [{ authorKey }, index, me] = await Promise.all([import('$lib/market/author-key.ts'), readIndex(kennelFetch), c.call('whoami', {})]);
      mine = minesOf(index, { keyId: (await authorKey())?.key_id ?? null, personId: me.ok ? personOf(me.value) : null });
    } catch {
      mine = [];
    }
  }

  /* ASKED AGAIN ONCE THE TICKS AND THE TITLE REST: a change to either restarts the wait, and leaving clears it. */
  $effect(() => {
    if (!client || !offered) return;
    const c = client;
    const args = argsOf(offered, ticks, title, VERSION, summary);
    const timer = setTimeout(() => void redraft(c, args), DRAFT_WAIT_MS);
    return () => clearTimeout(timer);
  });

  async function download() {
    if (!client || !offered || busy || ticks.size === 0) return;
    busy = true;
    wrong = null;
    try {
      const args = argsOf(offered, ticks, title, VERSION, summary);
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

  const ready = $derived(ticks.size > 0 && title.trim() !== '' && summaryOf(summary) !== '');

  /* ONE PRESS, ONE SEND OF THE FILE THE RECORD WRITES NOW, never of a draft shown earlier. The store answers waiting for
     review; its own refusal sentence is said as it is written. */
  async function publish() {
    if (!client || !offered || busy || publishing || !ready) return;
    publishing = true;
    wrong = null;
    sent = null;
    try {
      const out = await ask(client, argsOf(offered, ticks, title, VERSION, summary));
      const written = out.ok ? writtenOf(out.value, fallbackFile) : null;
      if (!written) {
        wrong = fixOf(out);
        return;
      }
      const result = await submitToKennel(kennelFetch, written.text);
      if (!result.ok) {
        wrong = result.fix;
        return;
      }
      sent = { ...result.value, title: title.trim() };
      if (client) void loadMine(client);
    } finally {
      publishing = false;
    }
  }

  async function takeOut(one: Mine) {
    if (taking !== null) return;
    taking = one.id;
    took = null;
    wrong = null;
    try {
      const { yankSignatureFor } = await import('$lib/market/author-key.ts');
      const out = await unpublish(kennelFetch, one, (kind, id, version, reason) => yankSignatureFor(kind, id, version, reason));
      if (!out.ok) {
        wrong = out.fix;
        return;
      }
      took = unpublishWords.done(one.title);
      if (client) await loadMine(client);
    } finally {
      taking = null;
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
      <!-- A ZERO IS NO COUNT, which Section already draws as none; a spread here would put Svelte's prop merging in the
           chunk every screen loads. -->
      <Section title={words.picks} count={ticks.size}>
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

      <div class="pair">
        <label class="field-label" for="addon-line">{words.oneLine}</label>
        <div class="field"><input class="field-input" id="addon-line" type="text" autocomplete="off" maxlength="140" aria-describedby="addon-line-hint" bind:value={summary} /></div>
        <p class="quiet" id="addon-line-hint">{words.oneLineHint}</p>
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

      <Tile icon="lock" title={words.asks}>
        {#if draft?.state === 'ready'}
          <ul class="lines">
            {#each asks as line, i (i)}<li>{line}</li>{/each}
          </ul>
        {:else}
          <p class="quiet">{words.previewNone}</p>
        {/if}
        <p class="quiet">{words.picture}</p>
        <p class="quiet">{words.keeps}</p>
      </Tile>

      {#if wrong}<p class="quiet" role="alert">{wrong}</p>{/if}
      {#if sent}<p class="quiet" role="status">{publishedSaid(sent)} <a href={at(publishedHref(sent))}>{publishedLink(sent)}</a></p>{/if}
      {#if ticks.size > 0 && summaryOf(summary) === ''}<p class="quiet">{words.oneLineNeeded}</p>{/if}
      <div class="actions">
        <Button weight="primary" type="submit" disabled={busy || ticks.size === 0}>{words.download}</Button>
        <Button disabled={publishing || !ready} aria-busy={publishing ? 'true' : undefined} onclick={() => void publish()}>
          {publishing ? words.publishing : words.publish}
        </Button>
      </div>
    </form>

    <Section title={unpublishWords.heading} count={mine.length}>
      {#if took}<p class="quiet" role="status">{took}</p>{/if}
      {#if mine.length === 0}
        <p class="quiet">{unpublishWords.none}</p>
      {:else}
        <ul class="lines">
          {#each mine as one (one.id)}
            <li>
              <span>{one.title}</span>
              <span class="detail">{one.versions.map((v) => unpublishWords.version(v)).join(', ')}</span>
              <div class="actions">
                <Button disabled={taking !== null} aria-busy={taking === one.id ? 'true' : undefined} onclick={() => void takeOut(one)}>
                  {taking === one.id ? unpublishWords.working : unpublishWords.unpublish}
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Section>
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
