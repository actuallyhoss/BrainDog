/**
 * The shape copy, the record's half: `shapeGrant` and `shapeExport`, both INTERNAL (PRF-A13, `area-proof-a.md`).
 *
 * WHAT A SHAPE GRANT OPENS IS ONE THING. A device grant of reach `shape`, approved once by the owner with six digits,
 * lives ninety days and is not spent on use (`shapeGrant` in the kernel's `device.ts`). Its bearer is held on
 * `device_grant` alone, so `verifyToken` never finds it and no `/api` route takes it. The host's shape door
 * (`packages/host/src/shape.ts`) hands it to `shapeExport`, and the answer is the record's export with every value
 * scrambled: the shape of the record and not a word of it.
 *
 * THE GRANT IS CHECKED HERE, NOT ONLY AT THE DOOR. `shapeExport` takes the bearer and reads it before it reads a row,
 * so a host that wires the door wrong, or a later route that calls the method by name, still hands out nothing without
 * the grant. `shapeGrant` is the check alone, as `vaultGrant` is, for a host that wants to know who approved one.
 *
 * THE EXPORT IS THE REDACTED ONE. The sealed bytes never leave for a shape copy (the scrambler would zero them anyway),
 * `local` never travels, and the kernel writes its `export` event under the person who approved the grant, so the
 * record's history says a copy was taken and by whose leave.
 *
 * THE HOST'S CUT-OFF (`RecordDeps.validFrom`) IS READ AT EACH CALL, as for every other grant reader: a shape grant
 * approved before it is refused in the same sentence as one nobody made.
 */

import { ok, type Result } from '@braindog/ports';
import { shapeBrainl, type Published, type ShapeGrant } from '@braindog/kernel';

import type { RecordDeps } from './index.ts';

/** What the copy is made with. `published` is the catalogue's declarations; left out, every one is scrambled. */
export type ShapeAsk = { published?: readonly Published[] | undefined };

export function methods(deps: Pick<RecordDeps, 'kernel' | 'clock' | 'validFrom'>) {
  const { kernel, clock } = deps;

  return {
    /**
     * A shape-grant bearer, checked: who approved it and until when. INTERNAL, and no route reaches it.
     *
     * NOT SPENT. Each check writes `last_used`, so the sweep's fourteen silent days count from the last copy taken.
     */
    async shapeGrant(bearer: string): Promise<Result<ShapeGrant>> {
      return kernel.shapeGrant(bearer, deps.validFrom?.());
    },

    /**
     * The record's shape copy for a shape-grant bearer: the lines of a `.brainl` file whose second line is
     * `#shape: true`, with every value scrambled. INTERNAL: the host's shape door calls it, and no route reaches it.
     *
     * ANY OTHER BEARER IS REFUSED BEFORE A ROW IS READ, in the kernel's one sentence: a login, a vault grant, an
     * operation grant, an agent's key, another record's grant, one past its life, one revoked.
     */
    async shapeExport(bearer: string, ask?: ShapeAsk): Promise<Result<string[]>> {
      const grant = await kernel.shapeGrant(bearer, deps.validFrom?.());
      if (!grant.ok) return grant;
      const lines = await kernel.export({ redactGrants: true, actor: grant.value.person });
      if (!lines.ok) return lines;
      return ok(
        await shapeBrainl(lines.value, {
          ...(ask?.published === undefined ? {} : { published: ask.published }),
          now: clock.now(),
        }),
      );
    },
  };
}
