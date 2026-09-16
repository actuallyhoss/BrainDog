/**
 * The voice this tab's record speaks in, read once per `boot` and drawn by the rail, the tab bar and Home.
 *
 * READ AGAIN WHEN `boot` IS. The layout hands over the answer it drew the shell from, and a write that
 * drops that answer (an install at `/start`, a pack switched off) is a new object here, so the voice is
 * asked for again with it. A record without a use-case pack, a refusal, and the sample all speak in the
 * house voice.
 */

import { lineOf, speaking, voiceOf, type Voice, type VoiceKey } from './voice.ts';

const state = $state<{ voice: Voice }>({ voice: {} });
let heardFor: unknown = null;

/** The line to draw for a voice key. Reactive where it is read in markup. */
export const said = (key: VoiceKey): string => lineOf(state.voice, key);

/** Ask the record for its voice, once per `boot` answer. `null` for the sample or a refused boot. */
export async function listen(boot: object | null, base: string): Promise<void> {
  if (boot === heardFor) return;
  heardFor = boot;
  if (boot === null) {
    state.voice = {};
    return;
  }
  /* LOADED HERE AND NOT AT THE TOP: the rail imports this module, and the client does not belong in the entry chunk. */
  const { createClient } = await import('@braindog/client');
  const client = createClient({ base });
  const packs = await client.packs();
  const id = packs.ok ? speaking(packs.value as { id: string; disabled_at: string | null }[]) : null;
  if (id === null) {
    state.voice = {};
    return;
  }
  const settings = await client.packConfig({ id });
  const values = settings.ok ? ((settings.value as { values?: Record<string, unknown> }).values ?? {}) : {};
  if (heardFor === boot) state.voice = voiceOf(values);
}
