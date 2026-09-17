/**
 * What each starter use case is called, by its id, and nothing else.
 *
 * APART FROM THE USE CASES THEMSELVES, so a line that names one (the feed's "Added the Team board use case") can read
 * the name without loading every declaration they carry. `names.test.ts` holds each name to its use case's `title`.
 */
export const USE_CASE_NAMES: Readonly<Record<string, string>> = {
  student: 'Student',
  founder: 'Solo founder',
  team: 'Team board',
  guide: 'New project guide',
  personal: 'Personal',
  business: 'Small business',
};

/** A use case's name by its id, or its id in words for one this build does not ship. */
export const useCaseName = (id: string): string =>
  USE_CASE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replaceAll('-', ' ');
