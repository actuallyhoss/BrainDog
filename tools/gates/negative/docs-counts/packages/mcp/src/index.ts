/* A stand-in for the MCP surface: `docs-counts` counts the tools by their names four spaces in, and the templates. */
export const TOOLS = [
  {
    name: 'first',
  },
  {
    name: 'second',
  },
];

export const TEMPLATES = [{ uriTemplate: 'braindog:page/{slug}', name: 'page' }] as const;
