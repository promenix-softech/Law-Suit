import type { Block } from "./model";

export type SuitType = "ordinary" | "summary_o37" | "commercial";
export type PartyRole = "borrower" | "co_borrower" | "guarantor";

export const ROLE_LABEL: Record<PartyRole, string> = {
  borrower: "Borrower",
  co_borrower: "Co-Borrower",
  guarantor: "Guarantor",
};

export interface CaptionInput {
  court: { name: string; place: string };
  year: number;
  suitType: SuitType;
  bank: { name: string; branch: string };
  defendants: { name: string; role: PartyRole; address?: string | null }[];
}

/** Court heading, suit number line and parties — shared by every pleading in the suit. */
export function caption(input: CaptionInput, opts: { addresses?: boolean } = {}): Block[] {
  if (!input.defendants.length) throw new Error("At least one defendant is required");
  const commercial = input.suitType === "commercial";
  return [
    { kind: "center", bold: true, lines: [`IN THE COURT OF THE ${input.court.name.toUpperCase()}`, `AT ${input.court.place.toUpperCase()}`] },
    {
      kind: "center",
      lines: [
        `${commercial ? "COMMERCIAL SUIT" : "SPECIAL CIVIL SUIT"} NO. ________ OF ${input.year}`,
        ...(input.suitType === "summary_o37" ? ["(Under Order XXXVII of the Code of Civil Procedure, 1908)"] : []),
      ],
    },
    { kind: "para", text: `${input.bank.name}, ${input.bank.branch}, through its authorised officer` },
    { kind: "center", lines: ["… PLAINTIFF"] },
    { kind: "center", bold: true, lines: ["VERSUS"] },
    {
      kind: "list",
      items: input.defendants.map(
        (d) => `${d.name} (${ROLE_LABEL[d.role]})${opts.addresses !== false && d.address ? `, ${d.address}` : ""}`,
      ),
    },
    { kind: "center", lines: ["… DEFENDANTS"] },
  ];
}
