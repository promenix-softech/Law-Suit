"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LANG_COOKIE } from "@/lib/i18n";

/** Stores the UI language; a preference only, so a plain cookie is enough. */
export async function setLanguage(input: string): Promise<void> {
  const lang = z.enum(["en", "mr"]).safeParse(input);
  if (!lang.success) return;
  (await cookies()).set(LANG_COOKIE, lang.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
