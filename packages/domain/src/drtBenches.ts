/**
 * Debts Recovery Tribunals sitting in Maharashtra. Territorial jurisdiction (which districts
 * go to which bench) is notified by the Central Government and changes; it is deliberately
 * not encoded here. The advocate confirms the bench per case until the notification is
 * checked ([[LEGAL_REVIEW]] in docs/open-questions.md).
 */
export interface DrtBench {
  code: string;
  name: string;
  place: string;
}

export const MAHARASHTRA_DRT_BENCHES: readonly DrtBench[] = [
  { code: "DRT-MUM-1", name: "Debts Recovery Tribunal-I", place: "Mumbai" },
  { code: "DRT-MUM-2", name: "Debts Recovery Tribunal-II", place: "Mumbai" },
  { code: "DRT-MUM-3", name: "Debts Recovery Tribunal-III", place: "Mumbai" },
  { code: "DRT-PUN", name: "Debts Recovery Tribunal", place: "Pune" },
  { code: "DRT-NAG", name: "Debts Recovery Tribunal", place: "Nagpur" },
  { code: "DRT-AUR", name: "Debts Recovery Tribunal", place: "Aurangabad" },
];
