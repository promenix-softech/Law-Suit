import { BULK_KINDS, confidenceOf, editable, FIELDS, LOW_CONFIDENCE, normalise, rawText, type FieldKind } from "@/lib/extract/fields";

/**
 * One value read from the bank's file, as the "open a case from the file" review shows it.
 * `value` is what goes in the input box (the normalised value in its editable form, or the text
 * as read when it did not validate). `checked` starts ticked only for plain text the reader was
 * sure of; amounts, dates, rates, account numbers, tenure and document lists are always ticked by
 * a person, one by one (the same rule as on the case page).
 */
export interface IntakeField {
  key: string;
  label: string;
  kind: FieldKind;
  /** Exactly as read, for the person to compare; null when nothing was found. */
  asRead: string | null;
  value: string;
  confidence: number | null;
  /** Why the value as read was not accepted, if it was not. */
  problem: string | null;
  checked: boolean;
}

export function intakeFields(result: Record<string, unknown>, annotations: Record<string, unknown>): IntakeField[] {
  return FIELDS.map((f) => {
    const asRead = rawText(result[f.key]);
    const confidence = asRead ? confidenceOf(annotations, f.key) : null;
    if (!asRead) return { key: f.key, label: f.label, kind: f.kind, asRead: null, value: "", confidence: null, problem: null, checked: false };
    const n = normalise(f.kind, asRead);
    const sure = confidence != null && confidence >= LOW_CONFIDENCE;
    return {
      key: f.key,
      label: f.label,
      kind: f.kind,
      asRead,
      value: n.ok ? editable(f.kind, n.stored) : asRead,
      confidence,
      problem: n.ok ? null : n.reason,
      checked: n.ok && sure && BULK_KINDS.includes(f.kind),
    };
  });
}

/** Kinds a person must tick one by one (never pre-ticked, never ticked in bulk). */
export const needsOwnTick = (kind: FieldKind) => !BULK_KINDS.includes(kind);
