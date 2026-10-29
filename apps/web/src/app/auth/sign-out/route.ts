import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Ends the session and goes to the sign-in page. Used when a signed-in account opens another
 * firm's address: pages cannot clear cookies while rendering, a route handler can.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase?.auth.signOut();
  const url = new URL("/login", request.url);
  url.searchParams.set("signed_out", "other_firm");
  return NextResponse.redirect(url);
}
