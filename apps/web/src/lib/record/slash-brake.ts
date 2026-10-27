/**
 * The brake, said where the owner sees Slash (health shown).
 *
 * PURE, SO `node --test` CAN IMPORT IT: the client is handed in, as `slash.ts` takes it.
 *
 * WHEN SLASH ASKS LESS, ONE SENTENCE SAYS WHY. The record works the brake out from how his last answers to Slash went
 * (`packages/kernel/src/observe.ts` `slashBrake`) and hands it on in `engineReadings` as `braked`. Without a sentence a
 * Slash that holds back reads as a Slash that is broken. Off, or not read, nothing is said. THE WORDS ONLY: nothing
 * here lifts the brake or changes what Slash may ask.
 */

/** The brake as `engineReadings` answers it: on or off, the share he took up, and how many answers it was read from. */
export type Braked = { on: boolean; share: number; of: number; lapsed?: number };

type Refused = { ok: false; refusal: { code: string; fix: string } } | { ok: false; conflict: unknown };
type Answer<T> = { ok: true; value: T } | Refused;
export type BrakeClient = { call: <T>(name: string, args?: Record<string, unknown>) => Promise<Answer<T>> };

/**
 * The sentence for the brake, or `null` when it is off or was not read.
 *
 * WHOLE ANSWERS, NEVER A PERCENT. The share is turned back into the count of the `of` answers it came from, so "7 of
 * its last 10" adds up to what he did. A brake whose numbers do not hold together is said as nothing, never guessed at.
 */
export function brakeLine(braked: Braked | null | undefined): string | null {
  if (!braked || braked.on !== true) return null;
  const { share, of } = braked;
  if (!Number.isSafeInteger(of) || of < 1 || !Number.isFinite(share) || share < 0 || share > 1) return null;
  const down = of - Math.round(share * of);
  if (down < 1) return null;
  if (typeof braked.lapsed === 'number' && braked.lapsed > 0) return `Slash stopped offering: you took up ${of - down} of its last ${of}, counting the ones you let pass.`;
  const what = of === 1 ? 'its last suggestion' : `${down} of its last ${of} suggestions`;
  return `Slash is asking less: you turned down ${what}. It asks again as you accept more.`;
}

/** The brake as the record reads it, or `null` on a refusal, a host with no readings, or an answer of another shape. */
export async function readBrake(client: BrakeClient): Promise<Braked | null> {
  try {
    const out = await client.call<{ braked?: Braked | null } | null>('engineReadings', {});
    if (!out.ok || out.value === null || typeof out.value !== 'object') return null;
    const braked = out.value.braked;
    return braked && typeof braked === 'object' && typeof braked.on === 'boolean' ? braked : null;
  } catch {
    return null;
  }
}
