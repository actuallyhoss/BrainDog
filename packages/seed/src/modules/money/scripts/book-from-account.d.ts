/* The types of `book-from-account.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

/** A thing that holds money, as a script reads it: `spoken` is "transactions#12". */
export type BookRow = { spoken: string; version: number; fields: Record<string, unknown> };
/** One change, in the words of `ctx.update`: what it is made to, the version it was read at, and the book. */
export type BookPatch = { id: string; version: number; fields: { book: string } };

/** `inBook` is an account's id to its book's id; an account in no book is left out of it. */
export declare function bookFromAccount(rows: readonly BookRow[], inBook: Readonly<Record<string, unknown>>): BookPatch[];
export default function run(ctx: unknown): Promise<unknown>;
export declare const BOOK_FROM_ACCOUNT_SCRIPT: Record<string, unknown>;
