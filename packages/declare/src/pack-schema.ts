/**
 * A JSON Schema for an add-on file, so an editor can suggest keys and catch a typo while the file is written.
 *
 * MADE FROM THE SAME LISTS THE RECORD READS: the manifest's keys are `MANIFEST_KEYS`, a declaration's kind is one of
 * the kernel's `KINDS`, a field's type one of `FIELD_TYPES`, a block's kind one of `BLOCK_KINDS`. A key added to any of
 * them is in the schema the next time `node packages/declare/scripts/pack-schema.ts` writes it, and `--check` says when
 * the file on disk has fallen behind.
 *
 * A HINT, NEVER THE AUTHORITY. The record's own check (`braindog addon check`, `act check`) decides; the schema stays
 * loose wherever a declaration's own grammar has more to say than a type can, so it never refuses a file the record
 * takes. A manifest key nobody reads is the one thing it holds tight, as the Kennel does.
 */

import { BLOCK_KINDS, FIELD_TYPES, KINDS } from '@braindog/kernel';

import { MANIFEST_KEYS } from './catalogue.ts';

/** Where the schema is published, and what `braindog addon new` writes as a new file's `$schema`. */
export const PACK_SCHEMA_URL = 'https://brain.dog/schema/pack.schema.json';

type Schema = Record<string, unknown>;

const text = (description: string): Schema => ({ type: 'string', description });
const ID = '^[a-z][a-z0-9-]{0,62}$';

/** The manifest keys the schema says more about than "any value". Every other key in `MANIFEST_KEYS` is still allowed. */
function manifestShapes(): Record<string, Schema> {
  const field: Schema = {
    type: 'object',
    required: ['id', 'type'],
    properties: {
      id: { type: 'string', pattern: '^[a-z][a-z0-9_]*$', description: 'The field id: lower-case letters, digits and underscores.' },
      type: { enum: [...FIELD_TYPES], description: 'What the field holds.' },
      of: { enum: FIELD_TYPES.filter((t) => t !== 'list'), description: 'A list field: the type of each item.' },
      values: { type: 'array', items: { type: 'string' }, description: 'An enum field: its values.' },
      label: text('The name a person reads. Left out, the id with underscores as spaces.'),
      required: { type: 'boolean' },
    },
  };
  return {
    $schema: text('The schema an editor reads this file with. BrainDog passes over it.'),
    pack: { type: 'string', pattern: ID, description: 'The add-on id: lower-case letters, digits and dashes.' },
    version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$', description: 'Its version, as 1.0.0. A version that takes a list, page or field away is a major.' },
    title: text('The name the store shows.'),
    summary: text('What it adds, in one sentence.'),
    author: text('Who made it.'),
    license: text('Its licence, such as MIT.'),
    note: text('A longer note for the listing.'),
    icon: text('An icon name from BrainDog\'s set, such as board or graduation-cap.'),
    unlisted: { type: 'boolean', description: 'Kept out of search in the store; installs by its id or link.' },
    requires: {
      type: 'object',
      properties: {
        format: { type: 'integer' },
        primitives: { type: 'integer' },
        packs: { type: 'object', additionalProperties: { type: 'string' }, description: 'Other add-ons it needs, by id, with a version range such as >=1.0.0.' },
      },
    },
    uses: { type: 'array', items: { type: 'string' }, description: 'The places of yours it reads or changes, such as register.ledger. Each is shown to the person before they install.' },
    declarations: {
      type: 'array',
      description: `What it adds. Each declaration begins with its kind: one of ${KINDS.join(', ')}.`,
      items: {
        type: 'object',
        anyOf: KINDS.map((k) => ({ required: [k] })),
        properties: {
          ...Object.fromEntries(KINDS.map((k) => [k, { type: 'string', description: `The ${k}'s name.` }])),
          fields: { type: 'array', items: field },
          blocks: {
            type: 'array',
            items: { type: 'object', required: ['kind'], properties: { kind: { enum: [...BLOCK_KINDS] }, span: { type: 'integer', minimum: 1, maximum: 12 } } },
          },
          source: { type: 'string', description: 'A script: its code, the text of the .js file beside this one. `braindog addon dev` copies it in on each save.' },
          egress: { type: 'array', items: { type: 'string', pattern: '^https://' }, description: 'A script: the https hosts it may call, each shown to the person.' },
          keys: { type: 'array', items: { type: 'string' }, description: 'A script: the key labels it may send, each only to the host its key opens.' },
        },
      },
    },
    seeds: {
      type: 'array',
      description: 'Example rows written when it is installed.',
      items: { type: 'object', required: ['register', 'fields'], properties: { register: { type: 'string' }, fields: { type: 'object' } } },
    },
    widgets: { type: 'array', items: { type: 'object', required: ['id'] }, description: 'Today cards it offers. Installing never places one.' },
    skills: { type: 'array', items: { type: 'object' }, description: 'What it teaches your agents.' },
    config: { type: 'object', description: 'Its settings form: each key a setting, typed like a field.' },
  };
}

/** The schema, as `pack.schema.json` holds it. */
export function packSchema(): Schema {
  const shapes = manifestShapes();
  const properties: Record<string, Schema> = {};
  for (const key of MANIFEST_KEYS) properties[key] = shapes[key] ?? { description: `${key}: see braindog:grammar/pack for what it holds.` };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: PACK_SCHEMA_URL,
    title: 'BrainDog add-on',
    description: 'An add-on file (.pack.json). Made from the lists BrainDog reads; the record\'s own check decides, run braindog addon check.',
    type: 'object',
    required: ['pack', 'version', 'summary', 'author', 'license'],
    additionalProperties: false,
    properties,
  };
}
