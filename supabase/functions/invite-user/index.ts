// Invites a person into the caller's office. Only an office admin may call it.
//
// The service-role key stays on Supabase's servers and is used for two things only: sending the
// invitation (auth admin API) and recording the attempt. The profile and roles are written AS THE
// CALLER, so RLS (profile_admin / roles_admin) and the audit log's actor apply; the same-office
// triggers refuse any link to another office whatever the client.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

const ROLES = ["admin", "drafter", "approver", "field"] as const;
type Role = (typeof ROLES)[number];
type Outcome = "sent" | "existing_member" | "refused" | "failed";

/** Attempts per office per rolling day, successful or not (so probing uses up the limit). */
const MAX_ATTEMPTS_PER_DAY = 20;
/** One answer for every refusal, so nobody can learn whether an email has an account elsewhere. */
const REFUSED = "Could not invite this email. If the person already has a Civil Suits login, ask Promenix to move it.";

type Input = { email: string; fullName: string; roles: Role[] };

/** Plain validation (no libraries): the web app validates with zod first; this is the gate. */
function parse(body: unknown): Input | string {
  const b = body as Record<string, unknown> | null;
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  const fullName = typeof b?.fullName === "string" ? b.fullName.trim().replace(/\s+/g, " ") : "";
  const roles = Array.isArray(b?.roles) ? [...new Set(b.roles)] : [];
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email)) return "Enter a valid email address.";
  if (fullName.length < 2 || fullName.length > 120) return "Enter the person's full name.";
  if (!roles.length || !roles.every((r) => (ROLES as readonly unknown[]).includes(r))) return "Choose at least one role.";
  return { email, fullName, roles: roles as Role[] };
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only." });
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json(401, { error: "Sign in again." });

  // Who is calling, as themselves (RLS applies).
  const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: me } = await asCaller.auth.getUser();
  if (!me.user) return json(401, { error: "Sign in again." });
  const [{ data: isAdmin }, { data: profile }] = await Promise.all([
    asCaller.rpc("has_role", { r: "admin" }),
    asCaller.from("profiles").select("org_id").eq("id", me.user.id).single(),
  ]);
  if (!isAdmin || !profile) return json(403, { error: "Only an office admin can invite people." });
  const orgId = profile.org_id as string;

  let input: Input | string;
  try {
    input = parse(await req.json());
  } catch {
    input = "Invalid request.";
  }
  if (typeof input === "string") return json(400, { error: input });

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const emailHash = await sha256Hex(input.email);
  const record = (outcome: Outcome) =>
    admin.from("invite_attempts").insert({ org_id: orgId, invited_by: me.user!.id, email_sha256: emailHash, outcome });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("invite_attempts").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", since);
  if ((count ?? 0) >= MAX_ATTEMPTS_PER_DAY) return json(429, { error: "Daily invitation limit reached. Try again tomorrow." });

  const redirectTo = Deno.env.get("APP_URL") ? `${Deno.env.get("APP_URL")}/auth/set-password` : undefined;
  const invited = await admin.auth.admin.inviteUserByEmail(input.email, { redirectTo, data: { full_name: input.fullName } });

  let userId: string;
  let newUser = true;
  if (invited.error) {
    // Already a login: allowed only if that person is already in this office (then: roles only).
    const existing = await findUserByEmail(admin, input.email);
    const { data: theirs } = existing ? await admin.from("profiles").select("org_id").eq("id", existing).maybeSingle() : { data: null };
    if (!existing || theirs?.org_id !== orgId) {
      await record("refused");
      return json(400, { error: REFUSED });
    }
    userId = existing;
    newUser = false;
  } else {
    userId = invited.data.user.id;
    const { error } = await asCaller.from("profiles").insert({ id: userId, org_id: orgId, full_name: input.fullName });
    if (error) {
      // Do not leave a login without an office: it would block this email for good.
      await admin.auth.admin.deleteUser(userId);
      await record("failed");
      return json(500, { error: "Could not create the person. Nothing was sent; try again." });
    }
  }

  const { error: rolesError } = await asCaller
    .from("user_roles")
    .upsert(input.roles.map((role) => ({ user_id: userId, org_id: orgId, role })), { onConflict: "user_id,org_id,role", ignoreDuplicates: true });
  if (rolesError) {
    await record("failed");
    return json(500, {
      error: newUser
        ? "Invitation sent, but the roles could not be given. Give them from the team list."
        : "Could not give the roles. Try again from the team list.",
    });
  }

  await record(newUser ? "sent" : "existing_member");
  return json(200, {
    message: newUser
      ? `Invitation sent to ${input.email}. They set their own password from the email.`
      : `${input.email} is already in this office; roles updated.`,
  });
});

/** auth.users is not exposed through the API; page through the admin list (small offices). */
async function findUserByEmail(admin: Pick<SupabaseClient, "auth">, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data.users.length) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}
