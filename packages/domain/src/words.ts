import { assertPaise, type Paise } from "./money";

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/** Integer to words in the Indian system (Crore, Lakh, Thousand). */
export function numberToWordsIndian(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("n must be a non-negative integer");
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberToWordsIndian(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** Words with "and" before the last group, as pleadings write it: 1234 → "One Thousand Two Hundred and Thirty-Four". */
function wordsWithAnd(n: number): string {
  if (n < 100) return numberToWordsIndian(n);
  const tail = n % 100;
  const head = n - tail;
  return tail ? `${numberToWordsIndian(head)} and ${below100(tail)}` : numberToWordsIndian(head);
}

/** Pleading style: 144531000 paise → "Fourteen Lakh Forty-Five Thousand Three Hundred and Ten Rupees Only". */
export function rupeesInWords(paise: Paise): string {
  assertPaise(paise);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `${wordsWithAnd(r)} Rupees${p ? ` and ${below100(p)} Paise` : ""} Only`;
}

/** e.g. 9987713 paise → "Rupees Ninety-Nine Thousand Eight Hundred Seventy-Seven and Paise Thirteen Only". */
export function amountInWordsINR(paise: Paise): string {
  assertPaise(paise);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${numberToWordsIndian(r)}${p ? ` and Paise ${below100(p)}` : ""} Only`;
}
