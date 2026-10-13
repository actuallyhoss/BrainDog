/**
 * `layout-target` and `layout-target-edge`: every control a thumb presses is 44 by 44. One check answers both seeds:
 * the first plants a control well short of the rule and the second one a single pixel short.
 *
 * `TARGETS` RUNS IN THE PAGE, so it closes over nothing in this file. `measure.mjs` calls it under a coarse pointer
 * only, which is argued below.
 */

/**
 * AND EVERY CONTROL IS 44 x 44, WHICH NOTHING MEASURED.
 *
 * `packages/skin/a11y.css` states the rule and names the exact failure it is written against:
 * *"Both axes: a control grown only in height measures 38x44 and fails."* `13 §7` designs the
 * targets at 44 x 44 CSS px counting `::before`, and every route had been measured on a phone with
 * no target under 44px by hand, once, with no gate behind it. A review then found the six-option level segment on `/settings/people` at
 * **43 x 36**, on the primary control of that screen.
 *
 * WCAG 2.5.8 is 24px and this product designs to 44. The gate holds the product's number.
 *
 * The box is the union of the element and its `::before`, because a chevron drawn as a 20px
 * glyph inside a 44px pseudo-element is a 44px target and the element's own rect is not.
 * Anything with zero area is not on screen and is not a target.
 */
/**
 * COARSE ONLY, AND THAT IS THE DESIGN RATHER THAN A GAP IN THE GATE.
 *
 * A review suggested running this on both pointers, and doing so reports every segmented
 * control in the product: `--ctl-h` is 44 on a coarse pointer and **36 on a fine one**, and
 * `05 §6` is explicit that density follows the pointer. 36px under a mouse is what this
 * product chose, not a defect. WCAG 2.5.8 asks 24 and this design gives 36 there and 44 under a
 * thumb.
 *
 * The skip link, which is what prompted it, is a different argument and is fixed at the
 * control rather than here: its audience reaches it by keyboard, and it takes `--tap`.
 */
export const TARGETS = () => {
  const box = (el) => {
    /* A CHECKBOX OR RADIO INSIDE ITS OWN LABEL IS PRESSED THROUGH THE LABEL. The browser toggles the input on a
       press anywhere in a wrapping `<label>`, so that box is the target, the way a `::before` is below. Only the
       wrapping form counts: a `for=` label elsewhere on the screen is not round the control. A native box is
       drawn at the size of the element, so a 44px input would be a 44px square of chrome; `/packs/share` gives
       its rows `min-block-size: var(--tap)` and this is the rule that sees it. */
    const around = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
    if (around) {
      const l = around.getBoundingClientRect();
      return [l.width, l.height];
    }
    const r = el.getBoundingClientRect();
    const b = getComputedStyle(el, '::before');
    const w = parseFloat(b.width);
    const h = parseFloat(b.height);
    return [Math.max(r.width, Number.isFinite(w) ? w : 0), Math.max(r.height, Number.isFinite(h) ? h : 0)];
  };
  const small = [];
  /* THE WHOLE DOCUMENT, not `#main`. Scoping to the main region excused the shell: the skip
     link, which is the first target a keyboard user reaches on every route, and the palette's
     own text field. A target is a target wherever it is drawn. */
  for (const el of document.querySelectorAll('button, a[href], [role="button"], input:not([type="hidden"]), select, summary')) {
    if (el.closest('[hidden], [aria-hidden="true"]')) continue;
    const [w2, h2] = box(el);
    if (w2 === 0 || h2 === 0) continue;
    /* HALF A PIXEL OF SLACK. A 44px control measures 43.99 whenever a border, a transform or a
       fractional font metric lands between the box and the device pixel. `/audit`'s spoken-id
       links reported 44x44 and failed on the raw comparison. The rule is 44 CSS px; a gate
       that fires on rounding is a gate somebody switches off. */
    if (w2 >= 43.5 && h2 >= 43.5) continue;
    const name = `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`;
    small.push(`${name} is ${Math.round(w2)}x${Math.round(h2)} ("${(el.textContent ?? '').trim().slice(0, 24)}")`);
  }
  return [...new Set(small)].slice(0, 3).map((s) => `a target under 44px on a coarse pointer: ${s}`);
};

/* A CONTROL ONE OR TWO PIXELS SHORT OF THE RULE, for the two target seeds. Its own `::before` is put out, because the
   rule counts a pseudo-element's box as the target and a skin that grows every button's would grow this one too. */
export const seedTarget = async (page, w, h) => {
  await page.addStyleTag({ content: '.seeded-target::before,.seeded-target::after{content:none !important}' });
  await page.evaluate(
    ([w, h]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seeded-target';
      b.textContent = 'seeded';
      b.style.cssText =
        `all:unset;display:block;box-sizing:border-box;inline-size:${w};block-size:${h};` +
        'min-inline-size:0;min-block-size:0;padding:0;border:0;overflow:hidden';
      document.getElementById('main')?.prepend(b);
    },
    [w, h],
  );
};
