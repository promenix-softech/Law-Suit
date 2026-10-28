import { BLANK } from "./format";
import type { Block } from "./model";

export type SuitType = "ordinary" | "summary_o37" | "commercial";
export type PartyRole = "borrower" | "co_borrower" | "guarantor";

export const ROLE_LABEL: Record<PartyRole, string> = {
  borrower: "Borrower",
  co_borrower: "Co-Borrower",
  guarantor: "Guarantor",
};

/** Suffix printed after a defendant's name in the caption (the borrower carries none). */
const ROLE_SUFFIX: Record<PartyRole, string> = { borrower: "", co_borrower: " (CO-BORROWER)", guarantor: " (GUARANTOR)" };

export interface Defendant {
  name: string;
  role: PartyRole;
  address?: string | null;
  /** A firm or company sued through a natural person: "Through its Proprietor" + name. */
  through?: { capacity: string; name: string } | null;
}

export interface CaptionInput {
  /** heading: the court's own caption line when the office has set one (courts.header_template). */
  court: { name: string; place: string; heading?: string | null };
  year: number;
  suitType: SuitType;
  bank: { name: string; branch: string; address?: string | null };
  /** Officer who signs and verifies for the bank; blanks are printed when unknown. */
  officer?: { name: string; designation?: string | null; age?: number | null } | null;
  defendants: Defendant[];
}

export const suitTypeOf = (c: { suit_type: SuitType | null; is_commercial: boolean }): SuitType =>
  c.suit_type ?? (c.is_commercial ? "commercial" : "ordinary");

/** "Civil Judge Senior Division, Pune (Demo)" → "Civil Judge Senior Division" (place is printed separately). */
export function courtTitle(name: string, district: string): string {
  const base = name.replace(/\s*\(Demo\)$/, "");
  const suffix = `, ${district}`;
  return base.endsWith(suffix) ? base.slice(0, -suffix.length) : base;
}

export const O37_INSCRIPTION = "(Under Order XXXVII of the Code of Civil Procedure, 1908)";

/**
 * Registry name of the suit. Order XXXVII suits before a Senior Division court are
 * "Special Summary Suits", before a Junior Division court "Summary Suits"; money suits
 * likewise "Special Civil Suit" / "Regular Civil Suit".
 */
export function suitTitle(suitType: SuitType, courtName: string): string {
  const junior = /junior/i.test(courtName);
  if (suitType === "commercial") return "COMMERCIAL SUIT";
  if (suitType === "summary_o37") return junior ? "SUMMARY SUIT" : "SPECIAL SUMMARY SUIT";
  return junior ? "REGULAR CIVIL SUIT" : "SPECIAL CIVIL SUIT";
}

/** Suit-number line, numbers left blank for the registry: "SPECIAL SUMMARY SUIT NO. __________/2026". */
export const suitNoLine = (input: Pick<CaptionInput, "suitType" | "court" | "year">): string =>
  `${suitTitle(input.suitType, input.court.name)} NO. ${BLANK}/${input.year}`;

/** "IN THE COURT OF CIVIL JUDGE SENIOR DIVISION PUNE, AT PUNE" (office style). */
export function courtLine(court: CaptionInput["court"]): string {
  if (court.heading?.trim()) return court.heading.trim().toUpperCase();
  const place = court.place.toUpperCase();
  return `IN THE COURT OF ${court.name.toUpperCase()} ${place}, AT ${place}`;
}

/**
 * Constitution line for the plaintiff bank. Only banks whose incorporating statute is certain
 * are listed; any other bank gets a flagged blank instead of a guess.
 */
const ACT_1970 = "the Banking Companies (Acquisition and Transfer of Undertakings) Act, 1970 (Act V of 1970)";
const ACT_1980 = "the Banking Companies (Acquisition and Transfer of Undertakings) Act, 1980 (Act 40 of 1980)";
const CONSTITUTION: [RegExp, string][] = [
  [/^state bank of india$/i, "A body corporate constituted under the State Bank of India Act, 1955"],
  [/^punjab (and|&) sind bank$/i, `A Banking Corporation constituted under ${ACT_1980}`],
  [
    /^(bank of maharashtra|bank of india|central bank of india|punjab national bank|bank of baroda|uco bank|canara bank|union bank of india|indian bank|indian overseas bank)$/i,
    `A Banking Corporation constituted under ${ACT_1970}`,
  ],
];

export function bankConstitution(bankName: string): string | null {
  return CONSTITUTION.find(([re]) => re.test(bankName.trim()))?.[1] ?? null;
}

const up = (s: string) => s.trim().toUpperCase();

/** Defendant block lines: "1. NAME (GUARANTOR)", then "Through its Proprietor" / NAME indented. */
function defendantLines(d: Defendant, i: number, multi: boolean): Block[] {
  const head = `${multi ? `${i + 1}. ` : ""}${up(d.name)}${ROLE_SUFFIX[d.role]}`;
  const blocks: Block[] = [{ kind: "lines", bold: true, lines: [head] }];
  if (d.through) blocks.push({ kind: "lines", bold: true, indent: true, lines: [`Through its ${d.through.capacity}`, up(d.through.name)] });
  return blocks;
}

/**
 * Court heading, suit number and parties in the office's caption style, shared by every
 * paper in the suit. The full caption (plaint, address memo, decree) carries the bank's
 * officer, constitution and all addresses; the short one (affidavit, vakalatnama, list of
 * documents) carries names only.
 */
export function caption(input: CaptionInput, opts: { full?: boolean } = {}): Block[] {
  if (!input.defendants.length) throw new Error("At least one defendant is required");
  const full = opts.full !== false;
  const multi = input.defendants.length > 1;

  const blocks: Block[] = [
    { kind: "lines", align: "center", bold: true, lines: [courtLine(input.court)] },
    {
      kind: "lines",
      align: "center",
      bold: true,
      lines: [suitNoLine(input), ...(input.suitType === "summary_o37" ? [O37_INSCRIPTION] : [])],
    },
  ];

  const plaintiff = [`${up(input.bank.name)},`, up(input.bank.branch)];
  if (full) {
    const o = input.officer;
    plaintiff.push(`Through its ${o?.designation?.trim() || "Authorised Officer"}`, o ? up(o.name) : BLANK, `AGE: ${o?.age ?? "____"} YEARS`);
  }
  blocks.push({ kind: "lines", bold: true, lines: plaintiff });
  if (full) {
    const constitution = bankConstitution(input.bank.name);
    blocks.push({
      kind: "lines",
      lines: [
        constitution ?? "[[LEGAL_REVIEW]] Constitution of the plaintiff bank (statute under which it is incorporated)",
        `ADDRESS: ${input.bank.address?.trim() ? up(input.bank.address) : BLANK}`,
      ],
    });
  }
  blocks.push({ kind: "lines", align: "right", bold: true, lines: ["...PLAINTIFF"] }, { kind: "lines", align: "center", bold: true, lines: ["Versus"] });

  blocks.push(...partyList(input.defendants, { addresses: full }));
  blocks.push({ kind: "lines", align: "right", bold: true, lines: [multi ? "...DEFENDANTS" : "...DEFENDANT"] });
  return blocks;
}

/**
 * Numbered defendants with "Through its …" and role suffixes — the caption's party block, also
 * the addressee block of the demand notice. One shared address is printed once ("ADDRESS OF
 * 1, 2 & 3"), as the office does.
 */
export function partyList(defendants: Defendant[], opts: { addresses: boolean }): Block[] {
  const multi = defendants.length > 1;
  const addrs = defendants.map((d) => d.address?.trim() ?? "");
  const shared = opts.addresses && multi && addrs[0] && addrs.every((a) => a === addrs[0]);
  const blocks: Block[] = [];
  defendants.forEach((d, i) => {
    blocks.push(...defendantLines(d, i, multi));
    if (opts.addresses && !shared) blocks.push({ kind: "lines", indent: multi, lines: [`ADDRESS: ${addrs[i] ? up(addrs[i]!) : BLANK}`] });
  });
  if (shared) {
    const nums = defendants.map((_, i) => String(i + 1));
    const label = `${nums.slice(0, -1).join(", ")} & ${nums[nums.length - 1]}`;
    blocks.push({ kind: "lines", indent: true, lines: [`ADDRESS OF ${label}:`, up(addrs[0]!)] });
  }
  return blocks;
}

/** "the Defendant" / "the Defendants" — keeps running text grammatical for one or many. */
export const defs = (input: Pick<CaptionInput, "defendants">): string => (input.defendants.length > 1 ? "the Defendants" : "the Defendant");
