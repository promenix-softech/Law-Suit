import { z } from "zod";
import type { OfficeProfile } from "@civil-suits/templates";

const s = (max: number) => z.string().trim().max(max);

/**
 * organizations.office_profile — the advocates' office details printed on the vakalatnama and
 * the court-fee letter. Written by scripts/office.ts (service role) and re-validated on read.
 */
export const OfficeProfileSchema = z.object({
  firmName: s(200).min(2),
  firmTagline: s(100).nullish(),
  advocateCode: s(50).nullish(),
  sanadNo: s(100).nullish(),
  address: s(400).nullish(),
  contact: s(100).nullish(),
  email: s(200).nullish(),
  advocates: z.array(s(100).min(2)).max(20).optional(),
  feeAccount: z
    .object({
      accountName: s(200),
      accountNo: z.string().regex(/^\d{6,20}$/),
      accountType: s(40).nullish(),
      bank: s(200),
      branch: s(200).nullish(),
      ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).nullish(),
    })
    .nullish(),
  pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/).nullish(),
  refPrefix: s(40).nullish(),
  noticeDays: z.int().min(1).max(90).nullish(),
  noticeFeeRupees: z.int().min(0).max(1_00_000).nullish(),
}) satisfies z.ZodType<OfficeProfile>;

/** Office profile as stored, or null when the office has not set one (templates then print blanks). */
export function readOfficeProfile(stored: unknown): OfficeProfile | null {
  const parsed = OfficeProfileSchema.safeParse(stored ?? {});
  return parsed.success ? parsed.data : null;
}

/**
 * organizations.settings — drafting choices only the office admin sees and changes.
 * Defaults follow the office's own practice: Order XXXVII summary suits for bank claims, and the
 * margins of its filed papers.
 */
export const OfficeSettingsSchema = z.object({
  forum: z.enum(["summary_suit", "commercial"]).catch("summary_suit"),
  margins: z.enum(["office", "efiling_rules"]).catch("office"),
});
export type OfficeSettings = z.infer<typeof OfficeSettingsSchema>;

export interface OfficeConfig {
  profile: OfficeProfile | null;
  settings: OfficeSettings;
}

type Rpc = { rpc: (fn: "office_config") => PromiseLike<{ data: unknown; error: unknown }> };

export const OFFICE_CONFIG_ERROR = "Could not load the office settings — try again, or ask the office admin.";

/**
 * Profile + settings through office_config() (admin, drafter, approver). Returns null when the call
 * fails or the user may not see them (field staff): callers must stop rather than fall back to
 * defaults, because the forum setting decides whether a case needs Sec 12A mediation.
 */
export async function loadOfficeConfig(supabase: Rpc): Promise<OfficeConfig | null> {
  const { data, error } = await supabase.rpc("office_config");
  if (error || data == null || typeof data !== "object") return null;
  const row = data as { office_profile?: unknown; settings?: unknown };
  return { profile: readOfficeProfile(row.office_profile), settings: OfficeSettingsSchema.parse(row.settings ?? {}) };
}
