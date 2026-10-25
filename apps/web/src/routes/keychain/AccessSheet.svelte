<!--
  ONE KEY'S KEYCHAIN ACCESS: the key's default for every machine, then each machine that holds keychain access with Always,
  Ask each time or Deny. A machine with no rule follows the default; with none set, that is Always. Each choice is saved as
  it is made (`setKeyAccess`), and the sheet draws what the record then says.
-->
<script lang="ts">
  import type { createClient } from '@braindog/client';
  import Button from '$lib/ui/Button.svelte';
  import Sheet from '$lib/ui/Sheet.svelte';
  import { toasts } from '$lib/ui/toast.svelte.ts';
  import { accessWords as w, defaultName, EVERY_MACHINE, ruleOfChoice, sheetOf, type Choice, type KeyRule } from './access.ts';

  let {
    client,
    credential,
    label,
    machines,
    onclose,
  }: {
    client: ReturnType<typeof createClient> | null;
    /** The key's spoken id, or its row id. `null` keeps the sheet shut. */
    credential: string | null;
    label: string;
    machines: readonly { handle: string; label: string | null }[];
    onclose: () => void;
  } = $props();

  let rules = $state.raw<KeyRule[]>([]);
  let busy = $state(false);
  const model = $derived(sheetOf(machines, rules));

  async function read() {
    if (!client || !credential) return;
    const out = await client.keyAccess({ credential }).catch(() => null);
    if (out && out.ok) rules = out.value.rules as KeyRule[];
    else toasts.push(out && 'refusal' in out ? out.refusal.fix : w.accessRefused, { intent: 'warn' });
  }
  $effect(() => {
    rules = [];
    if (credential) void read();
  });

  async function choose(machine: string, choice: Choice) {
    if (!client || !credential || busy) return;
    busy = true;
    const out = await client.setKeyAccess({ credential, machine, rule: ruleOfChoice(choice) }).catch(() => null);
    busy = false;
    if (!out || !out.ok) toasts.push(out && 'refusal' in out ? out.refusal.fix : w.accessRefused, { intent: 'warn' });
    await read();
  }
  const pick = (machine: string) => (e: Event) => void choose(machine, (e.currentTarget as HTMLSelectElement).value as Choice);
</script>

<Sheet open={credential !== null} title={w.sheetTitle(label)} subtitle={w.sheetHint} {onclose}>
  <div class="access">
    <label class="field-label" for="access-default">{w.everyMachine}</label>
    <div class="field">
      <select class="field-input" id="access-default" disabled={busy} value={model.fallbackChoice} onchange={pick(EVERY_MACHINE)}>
        <option value="default">{w.alwaysDefault}</option>
        <option value="always">{w.always}</option>
        <option value="ask">{w.ask}</option>
        <option value="deny">{w.denied}</option>
      </select>
    </div>
    {#each model.lines as l (l.machine)}
      <label class="field-label" for={`access-${l.machine}`} data-own>{l.name}</label>
      <div class="field">
        <select class="field-input" id={`access-${l.machine}`} disabled={busy} value={l.choice} onchange={pick(l.machine)}>
          <option value="default">{defaultName(model.fallback)}</option>
          <option value="always">{w.always}</option>
          <option value="ask">{w.ask}</option>
          <option value="deny">{w.denied}</option>
        </select>
      </div>
    {/each}
    {#if model.lines.length === 0}<p class="field-hint">{w.noMachines}</p>{/if}
  </div>
  {#snippet footer()}
    <Button weight="primary" onclick={onclose}>{w.close}</Button>
  {/snippet}
</Sheet>
