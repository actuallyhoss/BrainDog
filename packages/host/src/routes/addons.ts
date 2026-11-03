/**
 * The route rows for the add-on marketplace as an agent reads it, and the start of an add-on of its own
 * (`packages/record/src/methods/addons.ts`, and `addonCheck` in `packages/record/src/index.ts` beside `planPack`).
 *
 * READ+, AND NONE OF THEM WRITES. `addonCheck` is a read sent as a POST (`postRead`), since a whole add-on file is no
 * query string, as `previewPage` is. Each method opens with `guard(ctx, 'read')`; `addonCheck` and a file read ask besides
 * that the caller reads the whole BrainDog, as `exportPack` does. Installing stays `installPack`, ADMIN, which an agent
 * reaches through `act` as a question the person answers on Decide. `publishAddon` is the same for publishing: an agent's
 * ask for the store is filed as a question (the owner's browser signs the file), and for GitHub it answers the line the
 * person runs, so no credential passes through BrainDog.
 */

import type { Route } from '../index.ts';

export const ROUTES: readonly Route[] = [
  { name: 'addons', group: 'READ+', writes: false, what: 'The plugin store and what this BrainDog holds: search by words or shelf, or installed ones only, each with who made it, how far it is trusted, its newest version, what it reaches of yours and whether it is here.',
    takes: { q: 'text', shelf: 'text', installed: 'json', limit: 'integer' } },
  { name: 'addon', group: 'READ+', writes: false, what: 'One plugin whole: what it adds and asks for of yours, who made it, its versions and notes, and when it is here its settings and what it may do. file true hands back its plugin file to change or start from.',
    takes: { id: 'text', file: 'json' } },
  { name: 'addonNew', group: 'READ+', writes: false, what: 'Start a plugin for something BrainDog does not do: a file with a list, a page and a Today card from an id, a title and the fields wanted. It writes nothing.',
    takes: { id: 'text', title: 'text', summary: 'text', fields: 'json' } },
  { name: 'addonCheck', group: 'READ+', writes: true, postRead: true, what: 'Check a plugin file against this BrainDog without installing it: what is wrong with it, or what installing it adds, changes and asks the person to approve.',
    takes: { doc: 'json' } },
  { name: 'publishAddon', group: 'READ+', writes: false, what: 'Publish a plugin made here. to github answers the line the person runs on their own GitHub; to the store, the owner signs and sends it from the app, and an agent\'s ask is filed on Decide.',
    takes: { id: 'text', to: 'text' } },
];
