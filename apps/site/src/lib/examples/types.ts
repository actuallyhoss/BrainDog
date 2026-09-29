/**
 * The shape of the example records the home page's drawn app shows, one per kind of person.
 *
 * EACH PAGE IS DIALECT TEXT, the same text a record's page is written in (docs/05 §2), so what the
 * window draws is what `braindog-render` draws for a real record and the Source switch shows the
 * page exactly as it is written. Nothing here is a picture of a page.
 *
 * `layout` places the page's segments on twelve columns by their index in `parse(src, { page: true })`,
 * and a segment it does not name takes its kind's `minSpan`. `links[segment][cell]` is the page of the
 * same example a figure opens, or `null` for a figure that opens nothing.
 */

/** Where one segment sits on the page's twelve columns at 900px and wider. */
export type Span = { at: number; cols: 3 | 4 | 6 | 8 | 12; tall?: boolean };

/** One page of an example record. The first page of every example is its Home. */
export type ExamplePage = {
  id: string;
  title: string;
  /** A name `lib/icons.ts` draws, for the rail and the phone's bar. */
  glyph: string;
  src: string;
  layout?: readonly Span[];
  links?: Readonly<Record<number, readonly (string | null)[]>>;
  /**
   * THE LINE UNDER A CHART, by segment index: one written sentence saying what the chart means, specific and read off
   * the rows it draws (the design system). The drawn app sets it under the chart's tile; a list or a set of figures needs none.
   */
  reads?: Readonly<Record<number, string>>;
};

export type Example = {
  id: 'personal' | 'student' | 'founder' | 'team' | 'project';
  label: string;
  glyph: string;
  pages: readonly ExamplePage[];
};
