/**
 * Text lookup. `t(key, vars)` searches story text (STORY.text) then UI strings.
 * Missing keys return ⟦key⟧ and are reported once — never throw.
 */
const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
/** 1899 → ١٨٩٩ */
export const arDigits = v => String(v).replace(/\d/g, d => AR_DIGITS[+d]);

export function makeT(story, ui) {
  const missing = new Set();
  return function t(key, vars) {
    let s = (story && story.text && story.text[key]);
    if (s === undefined) s = ui && ui[key];
    if (s === undefined) {
      if (!missing.has(key)) { missing.add(key); console.warn('[strings] missing key:', key); }
      return `⟦${key}⟧`;
    }
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? (typeof vars[k] === 'number' ? arDigits(vars[k]) : vars[k]) : m));
    return s;
  };
}
