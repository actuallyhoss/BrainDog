/**
 * The seeded violation, in the shape it actually arrives in.
 *
 * NOBODY ADDS A YAML FILE TO THE KERNEL. Somebody adds a default page the first-run screen needs,
 * one line, and it looks like configuration — and now that name is one no pack can own, uninstalling
 * it is a special case, and the record has a schema somebody has to migrate.
 */
export const DEFAULT_PAGE = {
  id: 'page.home',
  kind: 'page',
  body: { page: 'home', title: 'Home', blocks: [] },
};
