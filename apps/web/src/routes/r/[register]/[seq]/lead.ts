/**
 * The word a row's page leads with for where the row stands: its state, by the label the state field carries.
 *
 * THE LEAD SAID THE STORED VALUE. A Personal project's page led with Earning over a Status field reading Ongoing, the
 * one place on the page that drew the state without its label (`loop/research-batch-forty-seven-audit.md` §3). Out of
 * the component so `node --test` can run it, since a Svelte page does not mount there (`ui/enum-label-sites.test.ts`).
 */

import { valueSaid } from '../../../../lib/voice.ts';

type Declared = { state?: string; fields: readonly { id: string; labels?: Readonly<Record<string, string>> }[] };

export const stateSaid = (decl: Declared | undefined, value: string): string =>
  valueSaid(decl?.fields.find((f) => f.id === decl.state) ?? {}, value);
