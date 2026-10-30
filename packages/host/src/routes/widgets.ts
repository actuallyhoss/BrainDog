/**
 * The route rows for the widget sheet and the widgets offered from use (`packages/record/src/methods/widgets.ts`).
 *
 * BOTH ARE READ+ AND CHANGE NOTHING. `widgetGallery` is asked when the sheet opens, never on Today's open; `widgetSuggest`
 * is what Slash would add to Today, which Today already carries in its own read, and which the palette and the sheet ask.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'widgetGallery', group: 'READ+', writes: false, what: 'Every widget this BrainDog can show on Today, each drawn small on its own data or saying what would fill it, and the few suggested from use. It changes nothing.',
    takes: { group: 'text', q: 'text', board: 'json', addon: 'text' } },
  { name: 'widgetSuggest', group: 'READ+', writes: false, what: 'The widgets Slash would add to Today from how this BrainDog is used, each with its reason in one line, three at most. It changes nothing.',
    takes: { board: 'json', cell: 'json' } },
  { name: 'widgetCompose', group: 'READ+', writes: false, what: 'A widget made from what was said, as a draft, drawn on this BrainDog: rules first, and the model only when they cannot, which an owner asks and which says what it cost. It changes nothing.',
    takes: { said: 'text', from: 'json', not: 'json', draw: 'json', sizes: 'json' } },
  { name: 'widgetDraft', group: 'DATA', writes: true, what: "Put a widget on Today as a draft with the caller's name and reason, for the owner to keep or throw away, or take the caller's own draft back. What propose with body_kind widget does.",
    takes: { question: 'text', body: 'json' } },
];
