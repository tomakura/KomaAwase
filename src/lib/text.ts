/**
 * Text as it is saved and searched: full-width letters, digits and spaces become half-width
 * (NFKC, so Ⅰ becomes I too), runs of spaces become one, and the ends are trimmed.
 * The same name typed two ways is then one name.
 */
export function cleanText(input: string) {
  return input.normalize("NFKC").replace(/\s+/g, " ").trim();
}
