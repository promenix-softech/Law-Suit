"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { firmOrigin, normaliseFirmCode } from "@/lib/firm";
import { FIRM_SUBDOMAINS, ROOT_DOMAIN, findFirm, forgetFirm, myFirmCode, onRootHost, rememberFirm, requestFirm } from "@/lib/firm-server";
import { createClient } from "@/lib/supabase/server";

const Credentials = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginState = { error?: string };

/** Step 1: the firm code. Goes to the firm's own address when firm subdomains are live. */
export async function chooseFirm(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const code = normaliseFirmCode(formData.get("firm"));
  if (!code) return { error: "Enter your firm code (letters, digits and hyphens)." };
  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured yet." };
  if (!(await findFirm(supabase, code))) return { error: "No firm has this code. Check it with your office admin." };

  if (FIRM_SUBDOMAINS && ROOT_DOMAIN && (await onRootHost())) redirect(`${firmOrigin(code, ROOT_DOMAIN)}/login`);
  await rememberFirm(code);
  redirect("/login");
}

/** "Not your firm?" — back to the firm code. */
export async function changeFirm() {
  await forgetFirm();
  const firm = await requestFirm();
  if (firm?.fromHost && ROOT_DOMAIN) redirect(`https://${ROOT_DOMAIN}/login`);
  redirect("/login");
}

/** Step 2: email and password, accepted only for an account of this firm. */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = Credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };
  const firm = await requestFirm();
  if (!firm) return { error: "Enter your firm code first." };

  const supabase = await createClient();
  if (!supabase) return { error: "Database is not configured yet." };

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "Invalid email or password." };
  // Same answer as a wrong password: the sign-in page of one firm says nothing about another's users.
  const own = await myFirmCode(supabase, data.user.id);
  if (own !== firm.code) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: "Invalid email or password." };
  }
  await rememberFirm(firm.code);
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  redirect("/login");
}
