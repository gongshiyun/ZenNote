/**
 * Read the currently active UI font stack (applied via the data-font attribute
 * on <html>, which sets the --zn-font-stack CSS custom property).
 */
export function currentFontStack(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--zn-font-stack")
      .trim() || "sans-serif"
  );
}
