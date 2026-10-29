/* The types of `post-due.js`, so a `.ts` import of it typechecks under strict without `allowJs`. */

export type PostRow = { id: string; seq?: number; version?: number; fields: Record<string, unknown> };
export declare function postable(account: PostRow | null): { ok: true } | { ok: false; why: string };
export declare function postedTwin(charge: PostRow, posted: readonly PostRow[]): { twin: PostRow } | { none: string; quiet?: true };
