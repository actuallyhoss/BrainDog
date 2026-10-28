/**
 * A ROW'S "…" OPENS AT THE POINTER. The app sends a row's menu trigger `menuat` with the point a right-click or a held
 * thumb landed on (`apps/web/src/lib/ui/context-menu.ts`); this claims it and hands the point to the host's menu, so
 * the row's own menu opens there. A host that renders without the app never sends it, and the trigger stays a button.
 */
export type Point = { x: number; y: number; height: number };

export const pointed = (open: (at: Point) => unknown) => (node: HTMLElement) => {
  const on = (e: Event) => {
    const { x, y, height } = (e as CustomEvent<Point>).detail;
    /* A HOST THAT HAD NOTHING TO OPEN (a row the record did not name) says `false`, and the press goes on outward. */
    if (open({ x, y, height }) !== false) e.preventDefault();
  };
  node.addEventListener('menuat', on);
  return () => node.removeEventListener('menuat', on);
};
