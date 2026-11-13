"use client";

import { useEffect, useMemo, useState } from "react";
import {
  chooseCourt,
  DEFAULT_DISTRICT,
  formatINR,
  MAHARASHTRA_DISTRICTS,
  sameDistrict,
  type BankClaimForum,
  type CourtChoice,
  type CourtOption,
} from "@civil-suits/domain";
import { translator, type Lang } from "@/lib/i18n";

const LEGAL = "[[LEGAL_REVIEW]]";

/**
 * The "where to file" box in Marathi, built from the same decision (`chooseCourt`) as the English
 * text. Terms per marathi-legal-glossary; terms marked † there (summary suit, commercial suit) stay
 * in English until the advocate confirms them.
 */
function whereToFileMr(choice: CourtChoice, claimPaise: number | null, district: string): { reason: string; notes: string[] } {
  const amount = claimPaise != null ? formatINR(claimPaise) : "";
  const reason =
    choice.courtType == null
      ? "न्यायालयाचा प्रकार दाव्याच्या रकमेवरून ठरतो; सध्या जिल्ह्यातील न्यायालय निवडा."
      : choice.courtType === "drt"
        ? `${amount}: ₹20 लाख किंवा अधिक बँक कर्ज — Debts Recovery Tribunal (RDB Act, 1993).`
        : choice.courtType === "commercial"
          ? `${amount}: commercial suit (₹3 लाख किंवा अधिक, Commercial Courts Act, 2015)${choice.needs12A ? "; आधी कलम 12A मध्यस्थी." : "; तातडीची अंतरिम मागणी असल्याने 12A मध्यस्थी नाही."}`
          : choice.suitType === "summary_o37"
            ? `${amount}: दिवाणी न्यायालयात Order XXXVII CPC खालील summary suit (office चे setting).`
            : `${amount}: दिवाणी दावा.`;
  const notes: string[] = [];
  if (choice.flags.place) {
    notes.push(
      "ठिकाण: कर्जदार राहतो किंवा व्यवसाय करतो तेथे, किंवा दाव्याचे कारण घडले तेथे (साधारणपणे कर्ज देणारी शाखा) दावा दाखल होतो — CPC कलम 20. जिल्हा तुम्ही निवडता; वकील निश्चित करतात.",
    );
  }
  if (choice.flags.drtBench) {
    notes.push("कोणत्या जिल्ह्याचे प्रकरण कोणत्या DRT bench पुढे जाते हे केंद्र सरकार अधिसूचित करते; ते येथे नोंदलेले नाही — वकील bench निश्चित करतात.");
  }
  if (choice.flags.noCourt) {
    notes.push(
      choice.courtType === "drt"
        ? "Office च्या न्यायालय यादीत Debts Recovery Tribunal नाही — 'बँका व न्यायालये' मध्ये जोडा."
        : `Office च्या यादीत ${district} साठी ${choice.courtType === "commercial" ? "commercial court" : "दिवाणी न्यायालय"} नाही — 'बँका व न्यायालये' मध्ये जोडा किंवा दुसरा जिल्हा निवडा.`,
    );
  }
  if (choice.flags.several) {
    notes.push("या जिल्ह्यात असे एकापेक्षा जास्त न्यायालय आहे; ही रक्कम कोणते न्यायालय ऐकते हे त्याच्या आर्थिक मर्यादेवर अवलंबून — वकील निश्चित करतात.");
  }
  return { reason, notes };
}

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
  lang = "en",
}: {
  courts: CourtOption[];
  claimPaise: number | null;
  urgent: boolean;
  officeForum: BankClaimForum;
  value: string;
  onChange: (courtId: string) => void;
  lang?: Lang;
}) {
  const t = translator(lang);
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
  const text =
    lang === "mr"
      ? whereToFileMr(choice, claimPaise, district)
      : { reason: choice.reason, notes: choice.notes.map((n) => n.replace(LEGAL, "").trim()) };

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t("District")}</span>
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className="input-glass mt-2">
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{t("Court")}</span>
          <select name="courtId" required value={value} onChange={(e) => onChange(e.target.value)} className="input-glass mt-2">
            <option value="" disabled>
              {t("Choose…")}
            </option>
            {choice.candidates.length > 0 && (
              <optgroup label={choice.courtType ? t("Suggested by law") : `${t("Courts in")} ${district}`}>
                {choice.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {others.length > 0 && (
              <optgroup label={t("Other courts in the office's list")}>
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
        <p className="font-medium">⚖ {t("Where to file")}</p>
        <p className="muted mt-1">{text.reason}</p>
        <ul className="mt-2 space-y-1 text-xs">
          {text.notes.map((n) => (
            <li key={n} className="muted">
              • {n}
            </li>
          ))}
        </ul>
        {choice.flags.noCourt && (
          <a href="/dashboard/masters" className="mt-2 inline-block text-xs underline">
            {t("Add a court in Banks & courts")} →
          </a>
        )}
      </div>
    </div>
  );
}
