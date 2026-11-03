/** One line of a terminal window (`TermWindow.svelte`): a command after the prompt, its output, a heading in the accent, a quiet line, a good one, or a gap. */
export type TermLine = { kind: 'cmd' | 'out' | 'head' | 'dim' | 'ok' | 'gap'; text: string };
