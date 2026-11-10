"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/** Stores the simple / full view choice; a preference only, so a plain cookie is enough. */
export async function setViewMode(input: string): Promise<void> {
  const mode = z.enum(["simple", "full"]).safeParse(input);
  if (!mode.success) return;
  (await cookies()).set("view", mode.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
