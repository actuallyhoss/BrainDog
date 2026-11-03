/**
 * "ASK ABOUT THIS" (3 Nov): Slash opened with a project, a task or any row already named, so the question is asked in
 * the person's own words about the thing on the screen. The address is Slash's (`/slash?with=<spoken id>`, the tools
 * lane's contract): the row's spoken id, `things#21` or `tasks#399`, its `#` written as `%23` so it stays in the query.
 */
export const askWords = {
  askAbout: 'Ask about this',
  /** On a phone, where the head's controls share one line. */
  askShort: 'Ask',
} as const;

export const askHref = (spoken: string): string => `/slash?with=${encodeURIComponent(spoken)}`;
