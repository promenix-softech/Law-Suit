"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { OfficeProfileSchema, OfficeSettingsSchema } from "@/lib/office-profile";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../cases/[id]/actions";

const Input = z.object({
  profile: OfficeProfileSchema,
  settings: z.object({ forum: z.enum(["summary_suit", "commercial"]), margins: z.enum(["office", "efiling_rules"]) }),
});

/** Office admin only — the database refuses anyone else (update_office_settings) and audits the change. */
export async function saveOfficeSettings(input: unknown): Promise<ActionResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Check the field: ${parsed.error.issues[0]?.path.join(".") ?? "settings"}.` };
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "Database is not configured." };

  const { error } = await supabase.rpc("update_office_settings", {
    p_profile: parsed.data.profile,
    p_settings: OfficeSettingsSchema.parse(parsed.data.settings),
  });
  if (error) return { ok: false, error: error.code === "42501" ? "Only an office admin can change these settings." : "Could not save the settings." };

  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Office settings saved." };
}
