"use client";

import { useState } from "react";
import { commercialCheck, formatINR, maharashtraCourtFee, rupees } from "@civil-suits/domain";

function compute(input: string, urgent: boolean) {
  const value = Number(input.replace(/,/g, ""));
  if (!input || !Number.isFinite(value) || value <= 0) return null;
  const paise = rupees(value);
  let fee: string;
  try {
    fee = formatINR(maharashtraCourtFee(paise));
  } catch {
    fee = "Slabs below ₹1,00,000 pending legal verification";
  }
  const c = commercialCheck({ specifiedValuePaise: paise, lenderIsBank: true, urgentInterimRelief: urgent });
  return { fee, claim: formatINR(paise), ...c };
}

export function CourtFeeCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [urgent, setUrgent] = useState(false);
  const r = compute(amount, urgent);

  return (
    <div className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Claim incl. interest to filing (₹)</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        Urgent interim relief sought
      </label>

      {r && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-zinc-500">Claim</dt>
          <dd>{r.claim}</dd>
          <dt className="text-zinc-500">Court fee</dt>
          <dd className="font-medium">{r.fee}</dd>
          <dt className="text-zinc-500">Suit type</dt>
          <dd>{r.isCommercial ? "Commercial suit" : "Ordinary / summary suit"}</dd>
          <dt className="text-zinc-500">Sec 12A mediation</dt>
          <dd>{r.needs12A ? "Required before filing" : "Not required"}</dd>
          <dt className="text-zinc-500">Verification</dt>
          <dd>{r.needsStatementOfTruth ? "Statement of truth" : "CPC verification"}</dd>
        </dl>
      )}
    </div>
  );
}
