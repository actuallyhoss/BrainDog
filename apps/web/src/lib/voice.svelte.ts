/**
 * The voice this tab's record speaks in, and the labels it gives its lists, read once per `boot` and drawn by the
 * rail, the tab bar, Home and the list screen.
 *
 * READ AGAIN WHEN `boot` IS. The layout hands over the answer it drew the shell from, and a write that
 * drops that answer (an install at `/start`, a pack switched off) is a new object here, so the voice is
 * asked for again with it. A record without a use-case pack, a refusal, and the sample all speak in the
 * house voice.
 */

import { heardLabels, homePageOf, labelsOf, lineOf, relabelAll, speaking, voiceOf, withSpeaks, type Labels, type SpeakingState, type Voice, type VoiceKey } from './voice.ts';

export { labels, listNamed } from './voice.ts';

const state = $state<{ voice: Voice; pack: string | null; labels: Labels }>({ voice: {}, pack: null, labels: {} });
let heardFor: unknown = null;

/** The line to draw for a voice key. Reactive where it is read in markup. */
export const said = (key: VoiceKey): string => lineOf(state.voice, key);

/**
 * The page this record's use case declares as its Home, `home-<use case>`, or `null` when no use case speaks here
 * and Home is the house one.
 */
export const homePage = (): string | null => (state.pack === null ? null : homePageOf(state.pack));

/** The words the record gives its lists now, as the rail draws them. Reactive where it is read, so a screen drawn before the voice was heard catches up. */
export const heard = (): Labels => state.labels;

/**
 * The words a record gives its lists, heard: kept for the list reader, and drawn over the build's own lists, which a
 * page, Home and the palette read by id (People on a team's Board).
 */
async function hear(labels: Labels): Promise<void> {
  heardLabels(labels);
  state.labels = labels;
  /* THE TABLE `learn` KEEPS, in `held.ts`: only a test copies the seed into it (`fixtures/fill.ts`), and asking the
     fixture for it named the sample as the place a record's lists are kept. */
  const { REGISTERS } = await import('./record/held.ts');
  relabelAll(REGISTERS, labels);
}

/** The voice as a `boot` of shape 2 sends it (`voice`), or `null` from a host older than the field. */
function sentVoice(boot: object): { pack: string | null; values: Record<string, unknown>; labels: Record<string, string> } | null {
  const v = (boot as { voice?: unknown }).voice;
  if (v === null || typeof v !== 'object') return null;
  const { pack, values, labels } = v as { pack?: unknown; values?: unknown; labels?: unknown };
  if (pack !== null && typeof pack !== 'string') return null;
  const isMap = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
  if (!isMap(values)) return null;
  const said = isMap(labels) ? Object.fromEntries(Object.entries(labels).filter((e): e is [string, string] => typeof e[1] === 'string')) : {};
  return { pack, values, labels: said };
}

/**
 * Ask the record for its voice, once per `boot` answer. `null` for the sample or a refused boot.
 *
 * `boot` SAYS IT NOW (`voice`): the use case that speaks, its settings and their labels, worked out by the record
 * while it answered. It was the add-ons list and one or more add-on settings reads, one after another, before the first
 * screen. A host older than the field is asked the old way, which is what the fallback below still does.
 */
export async function listen(boot: object | null, base: string): Promise<void> {
  if (boot === heardFor) return;
  heardFor = boot;
  if (boot === null) {
    state.voice = {};
    state.pack = null;
    await hear({});
    return;
  }
  const sent = sentVoice(boot);
  if (sent !== null) {
    state.voice = sent.pack === null ? {} : voiceOf(sent.values);
    state.pack = sent.pack;
    const config = Object.fromEntries(Object.entries(sent.labels).map(([setting, label]) => [setting, { label }]));
    await hear(sent.pack === null ? {} : labelsOf(sent.values, config));
    return;
  }
  /* LOADED HERE AND NOT AT THE TOP: the rail imports this module, and the client does not belong in the entry chunk. */
  const { createClient } = await import('@braindog/client');
  const client = createClient({ base });
  const packs = await client.packs();
  const id = packs.ok
    ? speaking(
        await withSpeaks(packs.value as SpeakingState[], async (pack) => {
          const read = await client.packConfig({ id: pack });
          return read.ok ? ((read.value as { values?: Record<string, unknown> }).values ?? null) : null;
        }),
      )
    : null;
  if (id === null) {
    state.voice = {};
    state.pack = null;
    await hear({});
    return;
  }
  const settings = await client.packConfig({ id });
  const read = settings.ok ? (settings.value as { values?: Record<string, unknown>; config?: Record<string, { label?: unknown }> }) : {};
  const values = read.values ?? {};
  if (heardFor !== boot) return;
  state.voice = voiceOf(values);
  state.pack = id;
  /* AND THE WORDS IT GIVES ITS LISTS, FIELDS AND STATES, read by the list reader and the rail. */
  await hear(labelsOf(values, read.config ?? {}));
}
