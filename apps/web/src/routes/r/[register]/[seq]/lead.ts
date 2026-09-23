/**
 * The words a row's page says a declared value in: its state, by the label the state field carries, and an enum's
 * choices in the inline editor, by the labels that field carries.
 *
 * THE LEAD SAID THE STORED VALUE. A Personal project's page led with Earning over a Status field reading Ongoing, the
 * one place on the page that drew the state without its label (`loop/research-batch-forty-seven-audit.md` §3). Out of
 * the component so `node --test` can run it, since a Svelte page does not mount there (`ui/enum-label-sites.test.ts`).
 *
 * AND IT WAS NOT THE ONLY ONE. Beside the fixed lead, the state field's chip still read "earning" and the inline
 * editor still offered a person's Role as `registrar` where the People list reads Agency
 * (`loop/research-batch-forty-eight-audit.md` §6). The chip draws through `stateSaid` with the lead, and the editor's
 * options through `choicesOf`, so the three say a value by the function the tests run.
 */

import { valueSaid } from '../../../../lib/voice.ts';

type Labelled = { labels?: Readonly<Record<string, string>> };
type Declared = { state?: string; fields: readonly ({ id: string } & Labelled)[] };

export const stateSaid = (decl: Declared | undefined, value: string): string =>
  valueSaid(decl?.fields.find((f) => f.id === decl.state) ?? {}, value);

/** Each value an enum field offers, in its declared order, beside the words a person reads for it. */
export const choicesOf = (f: { values?: readonly string[] } & Labelled): (readonly [value: string, said: string])[] =>
  (f.values ?? []).map((v) => [v, valueSaid(f, v)] as const);
