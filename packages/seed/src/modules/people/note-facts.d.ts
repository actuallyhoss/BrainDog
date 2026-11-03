/* The types of `note-facts.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */
export default function run(ctx: unknown): Promise<unknown>;
export declare function noteFacts(note: unknown, row: unknown): { patch: Record<string, unknown>; found: string[] } | null;
export declare function peopleFields(people: unknown[]): unknown[];
export declare const PEOPLE_FIELDS_SCRIPT: Record<string, unknown>;
