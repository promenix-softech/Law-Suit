"use client";

import { useEffect, useMemo, useState } from "react";
import { chooseCourt, DEFAULT_DISTRICT, MAHARASHTRA_DISTRICTS, sameDistrict, type BankClaimForum, type CourtOption } from "@civil-suits/domain";

const LEGAL = "[[LEGAL_REVIEW]]";

/**
 * District (Pune unless changed) and court. The kind of court follows from the amount and the
 * office's forum setting (`chooseCourt`, computed in code); the court is preselected from the
 * office's own list and can always be changed. What the advocate must confirm is said plainly.
 */
export function CourtPicker({
  courts,
  claimPaise,
  urgent,
  officeForum,
  value,
  onChange,
}: {
  courts: CourtOption[];
  claimPaise: number | null;
  urgent: boolean;
  officeForum: BankClaimForum;
  value: string;
  onChange: (courtId: string) => void;
}) {
  const [district, setDistrict] = useState(DEFAULT_DISTRICT);

  // Districts: Maharashtra's 36, plus any district typed in the office's court list that is not one of them.
  const districts = useMemo(() => {
    const names = MAHARASHTRA_DISTRICTS.map((d) => d.name);
    const extra = [...new Set(courts.map((c) => c.district.trim()))].filter((d) => d && !names.some((n) => sameDistrict(d, n)));
    return [...names, ...extra.sort()];
  }, [courts]);

  const choice = useMemo(
    () => chooseCourt({ claimPaise, lenderIsBank: true, urgentInterimRelief: urgent, officeForum, district, courts }),
    [claimPaise, urgent, officeForum, district, courts],
  );

  // Follow the suggestion whenever the district or the amount changes, unless the person picked another court of the same kind there.
  const suggestedId = choice.suggested?.id ?? "";
  useEffect(() => {
    if (!choice.candidates.some((c) => c.id === value)) onChange(suggestedId);
  }, [suggestedId, choice.candidates, value, onChange]);

  const others = courts.filter((c) => !choice.candidates.some((x) => x.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const notes = choice.notes.map((n) => n.replace(LEGAL, "").trim());

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">District</span>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className="input-glass mt-2">
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Court</span>
          <select name="courtId" required value={value} onChange={(e) => onChange(e.target.value)} className="input-glass mt-2">
            <option value="" disabled>
              Choose…
            </option>
            {choice.candidates.length > 0 && (
              <optgroup label={choice.courtType ? "Suggested by law" : `Courts in ${district}`}>
                {choice.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label="Other courts in the office's list">
                {others.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-current/10 p-3 text-sm" data-testid="where-to-file">
        <p className="font-medium">⚖ Where to file</p>
        <p className="muted mt-1">{choice.reason}</p>
        <ul className="mt-2 space-y-1 text-xs">
          {notes.map((n) => (
            <li key={n} className="muted">
              • {n}
            </li>
          ))}
        </ul>
        {notes.some((n) => n.startsWith("No ")) && (
          <a href="/dashboard/masters" className="mt-2 inline-block text-xs underline">
            Add a court in Banks &amp; courts →
          </a>
        )}
      </div>
    </div>
  );
}
