/**
 * The words a thread's page says an update's health in: on each update's chip and in the composer's menu, by the
 * labels the `updates` declaration's health field carries.
 *
 * THE THREAD SPELT THE STORED VALUE. Each update's chip read `String(u.fields.health).replace(/_/g, ' ')` and the
 * composer offered `v.replace(/_/g, ' ')`, the same two lines the row's page had before it drew through `lead.ts`
 * (`loop/research-batch-forty-nine-audit.md` §6). So the menu offered "on track" in lower case under a header chip
 * reading "On track", and a record that labels `updates.health.on_track` still read the stored id in both places. Out
 * of the component so `node --test` can run it, since a Svelte page does not mount there (`ui/enum-label-sites.test.ts`).
 */

import { valueSaid } from '../../../lib/voice.ts';

type Labelled = { labels?: Readonly<Record<string, string>> };
type Declared = { fields: readonly ({ id: string; values?: readonly string[] } & Labelled)[] };

const healthOf = (decl: Declared | undefined) => decl?.fields.find((f) => f.id === 'health');

/** One update's health, by the label the field carries or else the value's own words. */
export const healthSaid = (decl: Declared | undefined, value: string): string => valueSaid(healthOf(decl) ?? {}, value);

/** Each health the composer offers, in its declared order, beside the words a person reads for it. */
export const healthChoices = (decl: Declared | undefined): (readonly [value: string, said: string])[] =>
  (healthOf(decl)?.values ?? []).map((v) => [v, healthSaid(decl, v)] as const);
