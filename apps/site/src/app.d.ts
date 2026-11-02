// The constants `vite.config.ts` defines at build time.

declare global {
  /** The app's `--nav` for each scheme, read from the palette this build ships: the browser's bar colour. */
  const __SITE_NAV__: { light: string; dark: string };
}

export {};
