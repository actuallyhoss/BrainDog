<!--
  Run a rule again over what is already there (SHL-D07). A rule fires on a write, so one written today never saw what
  was there before it; this fills the gaps it would have filled.

  THE OWNER'S PRESS, NOTHING BY ITSELF. The page mounts this only for the owner (`ruleApply` is ADMIN) and only for an
  inline rule that sets a field. The quiet button reads the dry run first and says it ("Would fill 7. 3 are already set
  by hand. 2 are taken by Rent rule."), with Run and Cancel; Run fills them as one batch, and the receipt's Undo takes
  the batch back the way every other write's does (`data/optimistic.svelte.ts`).

  LOADED BY `import()` FROM THE PAGE, so none of it is in what every screen loads, and its CSS is its own.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';
  import { apiBase } from '$lib/at.ts';
  import { run } from '$lib/data/optimistic.svelte.ts';
  import Button from '$lib/ui/Button.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Tile from '$lib/ui/Tile.svelte';
  import { againWords, applyRule, doneSaid, dryLines, dryRule, labelOf, type Call, type Done, type Dry, type Wire } from './run-again.ts';

  let {
    id,
    body,
    field,
    register,
    nameOf,
    start = false,
  }: {
    /** The rule's handle, as `ruleApply` takes it. Never drawn. */
    id: string;
    /** The installed body, for the dry run that names which other rule takes what. */
    body: unknown;
    /** The field it sets, by id: said by its label. */
    field: string;
    register: string | null;
    nameOf: (rule: string) => string;
    /** Opened from a page's link that asks for it (`?again=1`, Money's File old entries): read the dry run at once. */
    start?: boolean;
  } = $props();

  const client = createClient({ base: apiBase() });
  const call: Call = (name, args) => client.call(name, args) as Promise<Wire>;

  let label = $state('');
  let stage = $state<'idle' | 'reading' | 'ready' | 'running'>('idle');
  let dry = $state<Dry | null>(null);
  let fix = $state('');
  let said = $state('');

  /* THE FIELD BY ITS LABEL, asked of its list once; a list that will not say leaves it its id in words. */
  $effect(() => {
    const r = register;
    const f = field;
    label = labelOf(null, f);
    if (r === null) return;
    void client
      .schema(r)
      .then((out) => {
        if (out.ok) label = labelOf(out.value, f);
      })
      .catch(() => undefined);
  });

  const lines = $derived(dry ? dryLines(dry, nameOf) : []);

  async function read() {
    stage = 'reading';
    fix = '';
    said = '';
    const out = await dryRule(call, id, body);
    if (!out.ok) {
      fix = out.fix;
      stage = 'idle';
      return;
    }
    dry = out.value;
    stage = 'ready';
  }

  /* ASKED FOR BY THE LINK THAT OPENED THE PAGE, the dry run is read once, and nothing is written until Run. */
  let started = false;
  $effect(() => {
    if (start && !started) {
      started = true;
      void read();
    }
  });

  function cancel() {
    dry = null;
    stage = 'idle';
  }

  /* ONE PRESS, ONE BATCH. Nothing is drawn ahead of the answer: what it fills is on other screens, and the receipt says
     the count. `run` offers the record's Undo for the batch the answer carries, and holds it for Mod+Z. */
  async function go() {
    stage = 'running';
    const out = await run<Done>({
      apply: () => undefined,
      revert: () => undefined,
      send: () => applyRule(call, id),
      said: (done) => doneSaid(done),
    });
    if (out.ok) said = doneSaid(out.value);
    dry = null;
    stage = 'idle';
  }
</script>

{#if stage === 'ready' && dry}
  <Tile icon="refresh" title={againWords.heading(label)}>
    <ul class="again-lines">
      {#each lines as line (line)}<li>{line}</li>{/each}
    </ul>
    <p class="again-note">{againWords.wroteNothing}</p>
    <div class="again-acts">
      {#if dry.fill > 0}<Button weight="primary" onclick={() => void go()}>{againWords.run}</Button>{/if}
      <Button onclick={cancel}>{againWords.cancel}</Button>
    </div>
  </Tile>
{:else}
  <div class="again-offer">
    <Button disabled={stage !== 'idle'} onclick={() => void read()}>
      {stage === 'reading' ? againWords.reading : stage === 'running' ? againWords.running : againWords.offer(label)}
    </Button>
    {#if fix}<p class="again-said" data-tone="warn" role="status"><span class="again-glyph" aria-hidden="true"><Icon name="alert" /></span>{fix}</p>{/if}
    {#if said}<p class="again-said" role="status">{said}</p>{/if}
  </div>
{/if}

<style>
  .again-offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--sp-2) var(--sp-3);
  }

  .again-lines {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--fs-body);
    color: var(--ink);
  }

  .again-note,
  .again-said {
    margin: 0;
    font-size: var(--fs-body);
    color: var(--ink-2);
  }

  /* A REFUSAL IS INK WITH A GLYPH, never colour alone. */
  .again-said[data-tone='warn'] {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-1);
    color: var(--ink);
  }

  .again-glyph {
    display: inline-flex;
    color: var(--red);
  }

  .again-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
</style>
