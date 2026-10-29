import { NextResponse, type NextRequest } from "next/server";
import { myFirmCode, requestFirm } from "@/lib/firm-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Ends this browser's session when a signed-in account is on another firm's address (pages cannot
 * clear cookies while rendering, a route handler can). It acts only on a real mismatch, so a link
 * from elsewhere cannot sign anyone out, and only this device's session ends.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const firm = await requestFirm();
  if (!supabase || !data.user || !firm) return NextResponse.redirect(new URL("/login", request.url));

  const own = await myFirmCode(supabase, data.user.id);
  if (!own || own === firm.code) return NextResponse.redirect(new URL("/dashboard", request.url));

  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url));
}
