import { assertPaise, type Paise } from "./money";

/**
 * Amounts in Marathi words (Indian system: हजार, लाख, कोटी), for Marathi papers. Every Marathi
 * number from 1 to 99 has its own word, so the table is written out rather than composed.
 * Spellings follow the standard written forms (…सष्ट, …ऐंशी, …ण्णव).
 */
const BELOW_100 = [
  "शून्य", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात", "आठ", "नऊ",
  "दहा", "अकरा", "बारा", "तेरा", "चौदा", "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस",
  "वीस", "एकवीस", "बावीस", "तेवीस", "चोवीस", "पंचवीस", "सव्वीस", "सत्तावीस", "अठ्ठावीस", "एकोणतीस",
  "तीस", "एकतीस", "बत्तीस", "तेहतीस", "चौतीस", "पस्तीस", "छत्तीस", "सदतीस", "अडतीस", "एकोणचाळीस",
  "चाळीस", "एक्केचाळीस", "बेचाळीस", "त्रेचाळीस", "चव्वेचाळीस", "पंचेचाळीस", "सेहेचाळीस", "सत्तेचाळीस", "अठ्ठेचाळीस", "एकोणपन्नास",
  "पन्नास", "एक्कावन्न", "बावन्न", "त्रेपन्न", "चोपन्न", "पंचावन्न", "छप्पन्न", "सत्तावन्न", "अठ्ठावन्न", "एकोणसाठ",
  "साठ", "एकसष्ट", "बासष्ट", "त्रेसष्ट", "चौसष्ट", "पासष्ट", "सहासष्ट", "सदुसष्ट", "अडुसष्ट", "एकोणसत्तर",
  "सत्तर", "एकाहत्तर", "बाहत्तर", "त्र्याहत्तर", "चौऱ्याहत्तर", "पंचाहत्तर", "शहात्तर", "सत्त्याहत्तर", "अठ्ठ्याहत्तर", "एकोणऐंशी",
  "ऐंशी", "एक्याऐंशी", "ब्याऐंशी", "त्र्याऐंशी", "चौऱ्याऐंशी", "पंच्याऐंशी", "शहाऐंशी", "सत्त्याऐंशी", "अठ्ठ्याऐंशी", "एकोणनव्वद",
  "नव्वद", "एक्याण्णव", "ब्याण्णव", "त्र्याण्णव", "चौऱ्याण्णव", "पंच्याण्णव", "शहाण्णव", "सत्त्याण्णव", "अठ्ठ्याण्णव", "नव्व्याण्णव",
] as const;

/** 100 is "शंभर"; other hundreds are "<n>शे" (एकशे, दोनशे …), followed by the rest. */
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (!h) return BELOW_100[r]!;
  if (h === 1 && !r) return "शंभर";
  return [`${BELOW_100[h]}शे`, r ? BELOW_100[r]! : ""].filter(Boolean).join(" ");
}

/** Integer to Marathi words in the Indian system (कोटी, लाख, हजार). */
export function numberToWordsMarathi(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("n must be a non-negative integer");
  if (n === 0) return BELOW_100[0];
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberToWordsMarathi(crore)} कोटी`);
  if (lakh) parts.push(`${BELOW_100[lakh]} लाख`);
  if (thousand) parts.push(`${BELOW_100[thousand]} हजार`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** e.g. 117748000 paise → "रुपये अकरा लाख सत्त्याहत्तर हजार चारशे ऐंशी फक्त". */
export function rupeesInWordsMr(paise: Paise): string {
  assertPaise(paise);
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `रुपये ${numberToWordsMarathi(r)}${p ? ` आणि ${BELOW_100[p]} पैसे` : ""} फक्त`;
}
