<!--
  "Paste a bank text" (first-hour audit AH10): the card Today tells it one real thing with, as a paste box for the text a
  bank sends, wherever a person is told their bank's texts fill Money (Settings > What comes in, "Your bank's texts").
  The same rules-only reader (`tell/read.ts`): the amount in the currency the text names, never the record's own by
  default, where it was spent, and the day; nothing is added until the press, and one Undo takes it back.

  WHAT IT READS AGAINST IS WHAT TODAY'S CARD READS: the lists this record holds as their declarations are learnt
  (`record/held.ts`), the day where the person is, the record's currency and the people and accounts this tab has named.
-->
<script lang="ts">
  import { createClient } from '@braindog/client';

  import { apiBase } from '$lib/at.ts';
  import TellOne from '$lib/home/TellOne.svelte';
  import { tellLists } from '$lib/home/first-today.ts';
  import { playedBy } from '$lib/start/parts.ts';
  import type { Shell } from '$lib/record/boot-live.ts';
  import { REGISTERS, TITLES } from '$lib/record/held.ts';
  import { learn } from '$lib/record/remote.ts';
  import type { TellOptions } from './read.ts';
  import type { ToldLine } from '$lib/home/tell-line.ts';

  let { shell }: { shell: Shell } = $props();

  /* THE DECLARATIONS ARE LEARNT ONCE, for the lists this tab has not read yet; `learnt` moves when they land. */
  let learnt = $state(0);
  const asked = new Map<string, Promise<void>>();
  $effect(() => {
    const missing = shell.lists.map((l) => l.id).filter((id) => REGISTERS[id] === undefined);
    if (missing.length === 0) return;
    const client = createClient({ base: apiBase() });
    void Promise.all(missing.map((id) => learn(client.schema, id, asked))).finally(() => (learnt += 1));
  });

  const dayOn = (now: number): string => {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const knownIn = (register: string | null | undefined) => [...(register ? (TITLES.get(register) ?? []) : [])].map(([seq, name]) => ({ seq, name }));

  const options = $derived.by((): TellOptions => {
    void learnt;
    const kept = { registers: shell.lists.map((l) => ({ id: l.id, name: l.name, count: shell.index.registers.find((r) => r.id === l.id)?.count ?? 0 })) };
    const lists = tellLists(kept, REGISTERS);
    const into = lists.flatMap((l) => l.fields.filter((f) => f.type === 'ref' && f.required && /account/i.test(`${f.id} ${f.label ?? ''}`)).map((f) => f.to));
    return { lists, today: dayOn(shell.now), currency: shell.index.currency ?? null, people: knownIn(playedBy('meets')), accounts: into.flatMap((to) => knownIn(to)) };
  });

  /* What was added from here, said under the box until the next. */
  let last = $state<ToldLine[]>([]);
</script>

<TellOne bank {options} {last} onadded={(lines) => (last = lines)} />
