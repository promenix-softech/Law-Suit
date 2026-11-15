/**
 * How many cases the Ctrl K palette keeps in the browser for instant search. It is also the most
 * rows the API returns for one request, so an office with more cases than this needs the database
 * to search the rest (`remoteTerm`).
 */
export const PALETTE_LOCAL_CASES = 1000;

/**
 * The word sent to the database when the office has more cases than the palette keeps locally.
 *
 * Only letters (any script), digits, "-", "/" and "." survive, so nothing in it can act as a LIKE
 * wildcard ("%", "_", "*") or as filter syntax (",", "(", ")", quotes, backslash). The longest
 * word is asked for; the whole query is still matched in the browser afterwards, as for local
 * cases. Null when there is nothing worth asking for.
 */
export function remoteTerm(query: string): string | null {
  const words = query
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\p{N}\-/.]+/gu, " ")
    .split(" ")
    .filter(Boolean);
  const longest = words.reduce((a, w) => (w.length > a.length ? w : a), "");
  return longest.length >= 2 ? longest.slice(0, 40) : null;
}

/** Adds newly found cases to those already known, by id; earlier entries keep their place. */
export function mergeById<T extends { id: string }>(known: T[], found: T[], max = 300): T[] {
  const seen = new Set(known.map((k) => k.id));
  const out = [...known];
  for (const f of found) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out.slice(-max);
}
