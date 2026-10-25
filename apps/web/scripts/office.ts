/**
 * Onboards advocate offices (tenants). Run by Promenix only, with the service-role key, never
 * from the web app. Each office is fully separate: its own users, courts, banks and cases.
 * A user (email) belongs to exactly one office.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... pnpm --filter web office <command> [options]
 *
 *   list
 *   create   --name "Patil & Associates" --admin-email admin@firm.in --admin-name "A. Patil" [--gstin ...]
 *   add-user --office <org id> --email ... --name ... --role admin|drafter|approver|field
 *   add-court --office <org id> --name "Civil Judge Senior Division, Pune" --district Pune --type civil|commercial|drt
 *   add-bank  --office <org id> --bank "State Bank of India" --code SBI --branch "Shivajinagar, Pune" --ifsc SBIN0001234
 *
 * New users get an invitation email from Supabase Auth to set their own password.
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  process.exit(1);
}
const db = createClient(url, secret, { auth: { persistSession: false } });

const ROLES = ["admin", "drafter", "approver", "field"] as const;
const Name = z.string().trim().min(2).max(120);
const Email = z.email().transform((e) => e.toLowerCase());
const OrgId = z.uuid();

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  if (data == null) throw new Error(`${what}: no data returned`);
  return data;
}

async function findUser(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit || data.users.length < 1000) return hit ?? null;
  }
}

async function office(orgId: string) {
  const org = await must(db.from("organizations").select("id, name").eq("id", orgId).maybeSingle(), "office lookup");
  return org as { id: string; name: string };
}

/** Invites (or reuses) a user and attaches them to one office; refuses users of another office. */
async function addUser(orgId: string, email: string, fullName: string, role: (typeof ROLES)[number]) {
  const existing = await findUser(email);
  let userId = existing?.id;
  if (userId) {
    const { data: profile } = await db.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    if (profile && profile.org_id !== orgId) {
      throw new Error(`${email} already belongs to another office. Use a different email for this office.`);
    }
  } else {
    const { data, error } = await db.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) throw new Error(`invite ${email}: ${error?.message}`);
    userId = data.user.id;
  }
  await must(db.from("profiles").upsert({ id: userId, org_id: orgId, full_name: fullName }).select("id").single(), "profile");
  await must(db.from("user_roles").upsert({ user_id: userId, org_id: orgId, role }).select("user_id").single(), "role");
  return userId;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values: v } = parseArgs({
    args: rest,
    options: Object.fromEntries(
      ["name", "admin-email", "admin-name", "gstin", "office", "email", "role", "district", "type", "bank", "code", "branch", "ifsc"].map(
        (k) => [k, { type: "string" as const }],
      ),
    ),
  });

  if (command === "list") {
    const orgs = await must(db.from("organizations").select("id, name, plan, created_at").order("created_at"), "offices");
    for (const o of orgs) {
      const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("org_id", o.id);
      console.log(`${o.id}  ${o.name}  (${o.plan}, ${count ?? 0} users)`);
    }
    return;
  }

  if (command === "create") {
    const name = Name.parse(v.name);
    const email = Email.parse(v["admin-email"]);
    const adminName = Name.parse(v["admin-name"]);
    const gstin = v.gstin ? z.string().regex(/^[0-9A-Z]{15}$/).parse(v.gstin) : null;
    const dup = await must(db.from("organizations").select("id").ilike("name", name), "name check");
    if (dup.length) throw new Error(`An office named "${name}" already exists (${dup[0].id}).`);
    if (await findUser(email)) throw new Error(`${email} is already a user. Each office's admin needs its own email.`);
    const org = await must(db.from("organizations").insert({ name, gstin }).select("id").single(), "office insert");
    await addUser(org.id, email, adminName, "admin");
    console.log(`Created office "${name}" (${org.id}); invitation sent to ${email}.`);
    console.log("Next: add its courts and banks (add-court, add-bank); its admin adds cases from the web app.");
    return;
  }

  const orgId = OrgId.parse(v.office);
  const org = await office(orgId);

  if (command === "add-user") {
    const role = z.enum(ROLES).parse(v.role);
    await addUser(orgId, Email.parse(v.email), Name.parse(v.name), role);
    console.log(`Added ${v.email} as ${role} to "${org.name}".`);
  } else if (command === "add-court") {
    const type = z.enum(["civil", "commercial", "drt"]).parse(v.type);
    await must(
      db.from("courts").insert({ org_id: orgId, name: Name.parse(v.name), district: Name.parse(v.district), court_type: type }).select("id").single(),
      "court",
    );
    console.log(`Added court "${v.name}" to "${org.name}".`);
  } else if (command === "add-bank") {
    const code = z.string().regex(/^[A-Z0-9]{2,12}$/).parse(v.code);
    const ifsc = z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).parse(v.ifsc);
    const bank = await must(
      db.from("banks").upsert({ org_id: orgId, name: Name.parse(v.bank), short_code: code }, { onConflict: "org_id,short_code" }).select("id").single(),
      "bank",
    );
    await must(
      db.from("bank_branches").insert({ org_id: orgId, bank_id: bank.id, branch_name: Name.parse(v.branch), ifsc }).select("id").single(),
      "branch",
    );
    console.log(`Added ${code} / ${v.branch} to "${org.name}".`);
  } else {
    console.error("Commands: list | create | add-user | add-court | add-bank (see the header of scripts/office.ts)");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
