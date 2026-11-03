/**
 * eCourts CNR (Case Number Record): 16 characters, e.g. MHPU010012342026 —
 * state (2 letters) + district (2 letters) + establishment (2 digits) + case serial (6 digits) + year (4 digits).
 * Spaces and hyphens people type are removed; letters are upper-cased.
 */
export type CnrParts = { state: string; district: string; establishment: string; serial: string; year: number };

export function normaliseCnr(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

/** The CNR's parts, or null when it is not a valid CNR (format, or a year outside 1950–nextYear). */
export function parseCnr(input: string, nextYear = new Date().getUTCFullYear() + 1): CnrParts | null {
  const cnr = normaliseCnr(input);
  const m = /^([A-Z]{2})([A-Z]{2})(\d{2})(\d{6})(\d{4})$/.exec(cnr);
  if (!m) return null;
  const [, state = "", district = "", establishment = "", serial = "", yearText = ""] = m;
  const year = Number(yearText);
  if (year < 1950 || year > nextYear) return null;
  return { state, district, establishment, serial, year };
}
