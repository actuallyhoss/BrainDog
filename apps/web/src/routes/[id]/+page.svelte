<!--
  The spoken-id resolver: `/D41`, `/SG31`, `/tasks#7`.

  Resolved by the SHELL, not by a server 302 — no server renders a request here (50 §13 D17). It
  asks the record and replaces the address with the canonical one, so Back does not bounce.

  `brain.dog/D41` is a sentence one person can say to another and a string an agent can emit with no
  lookup. It is the cheapest legibility win available (19 §5).

  The one exception is the display default `#`: `#125` NEVER resolves bare, because every register
  has a `#1`. Type `tasks#125`.

  THE RECORD FIRST, AND THE SAMPLE ONLY WHEN THERE IS NO RECORD. It looked ids up in the in-browser
  sample alone, so on a live record `/SG5` answered "Nothing answers to SG5" for a question that
  exists. A question is read through `governance` as `/decide` reads it, a row through `get` with the
  spoken id, and `UNREACHABLE` or `UNAUTHORIZED` is what sends it to the sample.
-->
<script lang="ts">
  import { apiBase, at } from '$lib/at.ts';
  import { titleOf } from '$lib/title.ts';
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  /* Imported here and nowhere in the layout, so the client stays out of the entry chunk. */
  import { createClient } from '@braindog/client';
  import { copy } from '$lib/copy.ts';
  import { openPalette } from '$lib/palette/open.svelte.ts';
  import { DECIDED, QUESTIONS, REGISTERS, entry } from '$lib/record/api.ts';
  import { noRecord } from '$lib/record/device.ts';
  import Empty from '$lib/ui/Empty.svelte';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import { closed, drew, opened } from '../../lib/ui/screen.svelte.ts';

  const raw = $derived(decodeURIComponent(page.params.id ?? ''));
  const bare = $derived(/^#?\d+$/.test(raw));

  const PREFIXED = /^[A-Za-z]{1,3}\d+$/;
  const QUALIFIED = /^([a-z][a-z0-9_]*)#(\d+)$/;

  /** Where an id goes in the sample. */
  function sampled(said: string): string | null {
    if (PREFIXED.test(said)) {
      const id = said.toUpperCase();
      return [...QUESTIONS, ...DECIDED].some((q) => q.id === id) ? `/decide/${id}` : null;
    }
    const q = QUALIFIED.exec(said);
    return q && REGISTERS[q[1]!] && entry(q[1]!, Number(q[2])) ? `/r/${q[1]}/${q[2]}` : null;
  }

  type Wire = { ok: true; value: unknown } | { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };

  /** No record here is the sample; any other refusal of a question is the record's own sentence. */
  const missed = (out: Wire, said: string, quote: boolean): { to: string | null; fix: string } =>
    'refusal' in out && noRecord(out.refusal.code)
      ? { to: sampled(said), fix: '' }
      : { to: null, fix: quote && 'refusal' in out ? out.refusal.fix : '' };

  /** Where an id goes on the record behind this host. */
  async function resolved(said: string): Promise<{ to: string | null; fix: string }> {
    const client = createClient({ base: apiBase() });
    if (/^(?:SG|D)\d+$/iu.test(said)) {
      const id = said.toUpperCase();
      const out = await client.governance({ register: id.startsWith('D') ? 'decision' : 'suggestion', id });
      if (!out.ok) return missed(out, said, true);
      return { to: out.value ? `/decide/${id}` : null, fix: '' };
    }
    if (!PREFIXED.test(said) && !QUALIFIED.test(said)) return { to: null, fix: '' };
    /* A ROW THE READER CANNOT NAME is not found, in the words this page already has for that. */
    const out = await client.call<{ register?: string; seq?: number | null } | null>('get', { spoken: said });
    if (!out.ok) return missed(out, said, false);
    const row = out.value;
    return { to: row?.register && typeof row.seq === 'number' ? `/r/${row.register}/${row.seq}` : null, fix: '' };
  }

  let done = $state(false);
  let fix = $state('');

  async function resolve(said: string) {
    done = false;
    fix = '';
    if (bare) {
      done = true;
      return;
    }
    const began = opened();
    const out = await resolved(said);
    if (decodeURIComponent(page.params.id ?? '') !== said) return closed(true, began);
    closed(out.fix === '', began);
    if (out.to) {
      await goto(at(out.to), { replaceState: true });
      return;
    }
    fix = out.fix;
    done = true;
  }

  $effect(() => {
    const said = raw;
    untrack(() => void resolve(said));
  });

  /**
   * DRAWN ONCE THE RECORD HAS ANSWERED THAT NOTHING IS THERE. The read is bracketed by `opened()` and
   * `closed()`, so a call still out takes `data-screen` away whatever this says, and an id that
   * resolves hands the claim to the screen it goes to.
   */
  $effect(() => {
    if (done && !fix) drew('ready');
  });
</script>

<svelte:head><title>{titleOf(done ? `Nothing answers to “${raw}”` : raw)}</title></svelte:head>

{#if done && fix}
  <div class="page">
    <Empty kind="error" heading title={fix}>
      {#snippet actions()}<Button href="/decide">{copy.decide}</Button>{/snippet}
    </Empty>
  </div>
{:else if done}
  <div class="page">
    <!-- `no-results`, not `error`. Nothing failed here — a string was typed and it does not name a
         row, which is the same class of event as a search with no hits. `error` paints the heading
         in `danger`, and spending the alarm colour on "you typed an id that doesn't exist" is how a
         product teaches people that red means nothing in particular. -->
    <Empty
      kind="no-results"
      heading
      title={bare ? `“${raw}” could be in any of your lists.` : `Nothing answers to “${raw}”.`}
      body={bare
        ? 'Every list has a #1, so a number on its own does not say which. Put the list in front of it: obligations#4, or tasks#7.'
        : 'An id is a list and a number, like obligations#4, or the short code a thing was given, like SG31.'}
    >
      <!-- IT SAID `Search` AND WENT HOME, beside a second button that also went home. Two controls,
           one behaviour, and the one with the magnifying glass was named for something it did not
           do — on the screen whose whole purpose is that somebody was looking for something. -->
      {#snippet actions()}
        <Button weight="primary" onclick={openPalette}><Icon name="search" size="s" />{copy.search}</Button>
        <Button href="/">{copy.home}</Button>
      {/snippet}
    </Empty>
  </div>
{/if}

<style>
  .page {
    padding: var(--sp-8) var(--sp-6);
    max-inline-size: 900px;
  }
</style>
