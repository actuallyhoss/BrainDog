/**
 * The read `flowGrammar`: the kernel's grammar of an automation, every trigger and step with its arguments, and the
 * ceilings (`packages/kernel/src/flow-grammar.ts`).
 *
 * ONE DEFINITION, TWO EDITORS (D22.51). The canvas copied the lint's tables by hand and the copy drifted, so it reads
 * them here instead, as an agent may. The answer is the kernel's as it stands: nothing in it is about this record, and
 * whether a body's named lists, doors and calls are there is `checkAutomation`'s to say.
 *
 * WHOEVER MAY READ AUTOMATIONS MAY READ THEIR GRAMMAR, and nobody else: the guard is the one `automations` takes,
 * `scoped(ctx, 'read')`, so an appender who cannot open the editor is not handed the shape of what it would draw.
 */

import type { Result } from '@braindog/ports';
import { ok } from '@braindog/ports';
import { flowGrammar, type FlowGrammar } from '@braindog/kernel/flow-grammar';

import type { CallContext } from '../index.ts';
import type { RecordDeps } from './index.ts';

export type { FlowGrammar };

export function methods(deps: RecordDeps) {
  const { scoped, no } = deps;

  return {
    /**
     * The grammar of an automation: `{ triggers, steps, ceilings }`, each trigger and step with its arguments (name,
     * type, whether the lint requires it, what it picks from), a step's group, whether it needs a row and `once_per`.
     * READ+, at the level `automations` takes. Takes nothing.
     */
    async flowGrammar(args: Record<string, unknown> | undefined, ctx: CallContext): Promise<Result<FlowGrammar>> {
      const stop = scoped(ctx, 'read');
      if (stop) return { ok: false, refusal: stop };
      const extra = Object.keys(args ?? {})[0];
      if (extra !== undefined) return no('FIELD_UNKNOWN', `${extra} is not something this call takes. It takes nothing, and answers the whole grammar.`, { at: extra, allowed: [] });
      return ok(flowGrammar());
    },
  };
}
