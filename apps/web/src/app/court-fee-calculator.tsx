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
    fee = "Pending legal verification (below ₹1 lakh)";
  }
  const c = commercialCheck({ specifiedValuePaise: paise, lenderIsBank: true, urgentInterimRelief: urgent });
  return { fee, claim: formatINR(paise), ...c };
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass-card p-4">
      <p className="label">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export function CourtFeeCalculator() {
  const [amount, setAmount] = useState("1000000");
  const [urgent, setUrgent] = useState(false);
  const r = compute(amount, urgent);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="label">Claim incl. interest to filing (₹)</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="input-glass mt-2 text-lg" />
        </label>
        <label className="btn cursor-pointer select-none">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="accent-violet-500" />
          Urgent interim relief
        </label>
      </div>

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Court fee" value={r.fee} tone="gradient-text" />
          <Stat label="Suit type" value={r.isCommercial ? "Commercial" : "Ordinary / summary"} />
          <Stat label="Sec 12A mediation" value={r.needs12A ? "Required" : "Not required"} />
          <Stat label="Verification" value={r.needsStatementOfTruth ? "Statement of truth" : "CPC verification"} />
        </div>
      )}
    </div>
  );
}
