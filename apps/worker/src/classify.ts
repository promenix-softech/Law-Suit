
/**
 * Page classification and case grouping for bulk intake, in code (no AI): keyword scores on
 * the OCR text, the loan account number as the case key, and page order. A human confirms
 * every split, so this only has to make a good first proposal.
 */

export const PAGE_CLASSES = [
  "sanction_letter",
  "loan_agreement",
  "account_statement",
  "npa_notice",
  "demand_notice",
  "guarantee",
  "kyc",
  "other",
] as const;
export type PageClass = (typeof PAGE_CLASSES)[number];

const SIGNALS: Record<Exclude<PageClass, "other">, [RegExp, number][]> = {
  sanction_letter: [[/sanction letter/i, 5], [/has been sanctioned|pleased to inform/i, 3], [/sanctioned amount/i, 2]],
  loan_agreement: [[/loan agreement|agreement is made/i, 5], [/\("?the borrower"?\)/i, 2], [/executed/i, 1]],
  account_statement: [[/statement of account|account statement/i, 5], [/debit/i, 1], [/credit/i, 1], [/balance/i, 1], [/particulars/i, 1]],
  npa_notice: [[/non[- ]performing asset/i, 4], [/\bnpa\b/i, 1], [/rbi norms/i, 2]],
  demand_notice: [[/demand notice|legal notice/i, 5], [/calling upon you|within \d+ days/i, 2]],
  guarantee: [[/deed of guarantee|guarantee agreement/i, 5], [/guarantor hereby/i, 3]],
  kyc: [[/\bkyc\b|know your customer/i, 4], [/aadhaar|permanent account number|\bpan card\b/i, 2], [/proof of (address|identity)/i, 2]],
};

export interface Classified {
  class: PageClass;
  /** 0–1: share of the winning class in the total signal, damped when the evidence is thin. */
  confidence: number;
}

export function classifyPage(text: string): Classified {
  let best: PageClass = "other";
  let bestScore = 0;
  let total = 0;
  for (const [cls, signals] of Object.entries(SIGNALS) as [Exclude<PageClass, "other">, [RegExp, number][]][]) {
    const score = signals.reduce((s, [re, w]) => s + (re.test(text) ? w : 0), 0);
    total += score;
    if (score > bestScore) {
      best = cls;
      bestScore = score;
    }
  }
  if (bestScore < 3) return { class: "other", confidence: bestScore === 0 ? 0.5 : 0.3 };
  const confidence = (bestScore / total) * Math.min(1, bestScore / 5);
  return { class: best, confidence: Math.round(confidence * 1000) / 1000 };
}

export interface CaseKey {
  /** Normalised account number (OCR look-alikes folded), or null when none is printed. */
  account: string | null;
  borrower: string | null;
}

/** OCR confuses these; fold them so the same number read twice compares equal. */
export function normaliseAccount(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}

const ACCOUNT = /(?:loan[ \t]+)?(?:a\/c|account)(?:[ \t]*(?:no\.?|number))?[ \t]*[:.\-]?[ \t]*([A-Z0-9][A-Z0-9 -]{4,24}[A-Z0-9])/gi;
const NAME_LINE = /^(?:name|borrower)\s*:\s*(.+)$/im;
const DEAR = /^[Dd]ear\s+([A-Z][A-Za-z.]+(?:\s+[A-Z][A-Za-z.]+){1,3})\s*,/m;

export function caseKey(text: string): CaseKey {
  // "STATEMENT OF ACCOUNT" also matches; take the first match that looks like a number.
  let account: string | null = null;
  for (const m of text.matchAll(ACCOUNT)) {
    const n = normaliseAccount(m[1]!.split(/\s{2,}|\n/)[0]!);
    if ((n.match(/\d/g) ?? []).length >= 4 && n.length >= 6) {
      account = n;
      break;
    }
  }
  const name = NAME_LINE.exec(text)?.[1] ?? DEAR.exec(text)?.[1] ?? null;
  return { account, borrower: name ? name.trim().replace(/\s+/g, " ").slice(0, 80) : null };
}

/** Levenshtein distance, capped (we only care whether it is ≤ 1). */
function distance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) >= cap) return cap;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.min(prev[b.length]!, cap);
}

export const sameAccount = (a: string, b: string) => a === b || (a.length >= 8 && distance(a, b) <= 1);

export interface PageKey extends CaseKey {
  pageNo: number;
}

/**
 * Groups pages into proposed cases (1-based group numbers, in page order). A page with an
 * account number joins the group holding a matching number, else starts a new group; a page
 * without one stays with the page before it (loan files are scanned one after another).
 */
export function groupPages(pages: PageKey[]): number[] {
  const groups: { accounts: string[]; borrowers: string[] }[] = [];
  const out: number[] = [];
  let current = -1;
  for (const p of pages) {
    let g = -1;
    if (p.account) g = groups.findIndex((x) => x.accounts.some((a) => sameAccount(a, p.account!)));
    else if (p.borrower) g = groups.findIndex((x) => x.borrowers.includes(p.borrower!.toLowerCase()));
    if (g < 0 && !p.account && current >= 0) g = current;
    if (g < 0) {
      groups.push({ accounts: [], borrowers: [] });
      g = groups.length - 1;
    }
    if (p.account && !groups[g]!.accounts.includes(p.account)) groups[g]!.accounts.push(p.account);
    if (p.borrower) groups[g]!.borrowers.push(p.borrower.toLowerCase());
    out.push(g + 1);
    current = g;
  }
  return out;
}
