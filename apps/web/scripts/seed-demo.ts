/**
 * Seeds the demo Supabase project with a synthetic office, 4 role users and 10 fake cases.
 * Idempotent: re-running skips what already exists.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... DEMO_PASSWORD=... pnpm --filter web seed:demo
 *
 * Never point this at a production project. Synthetic data only.
 */
import { createClient } from "@supabase/supabase-js";
import { calculateInterest, commercialCheck, recoveryForum, rupees } from "@civil-suits/domain";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_PASSWORD;
if (!url || !secret || !password || password.length < 12) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and DEMO_PASSWORD (≥12 chars).");
  process.exit(1);
}

const db = createClient(url, secret, { auth: { persistSession: false } });
const ORG_NAME = "Demo Advocates (Synthetic)";
const DOMAIN = "demo.civilsuits.test";

const USERS = [
  { key: "admin", name: "Asha Demo Admin", role: "admin" },
  { key: "drafter1", name: "Deepak Demo Drafter", role: "drafter" },
  { key: "drafter2", name: "Dipti Demo Drafter", role: "drafter" },
  { key: "approver", name: "Anil Demo Approver", role: "approver" },
  { key: "field", name: "Farhan Demo Field", role: "field" },
] as const;

const BORROWERS = [
  "Ramesh Demo Patil", "Sunita Test Kulkarni", "Vijay Sample Jadhav", "Meena Fake Deshmukh",
  "Prakash Demo Shinde", "Kavita Test Pawar", "Sanjay Sample More", "Anita Fake Gaikwad",
  "Mahesh Demo Bhosale", "Rekha Test Chavan",
];
const PRINCIPALS = [85_000, 1_40_000, 2_60_000, 3_10_000, 4_75_000, 6_20_000, 8_90_000, 10_50_000, 12_40_000, 17_80_000];
const STATUSES = [
  "case_created", "docs_uploaded", "extraction_review", "notice_generated", "notice_sent",
  "mediation_12a", "drafting", "in_approval", "approved", "filed",
] as const;

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${JSON.stringify(error)}`);
  if (data == null) throw new Error(`${what}: no data returned`);
  return data;
}

async function ensureUser(email: string): Promise<string> {
  const list = await db.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw new Error(`listUsers: ${list.error.message}`);
  const existing = list.data.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await db.auth.admin.createUser({ email, password: password!, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  let org = (await must(db.from("organizations").select("id").eq("name", ORG_NAME), "org lookup"))[0];
  if (!org) org = await must(db.from("organizations").insert({ name: ORG_NAME }).select("id").single(), "org insert");
  const orgId = org.id as string;

  const ids: Record<string, string> = {};
  for (const u of USERS) {
    const id = await ensureUser(`${u.key}@${DOMAIN}`);
    ids[u.key] = id;
    await must(db.from("profiles").upsert({ id, org_id: orgId, full_name: u.name }), "profile");
    await must(db.from("user_roles").upsert({ user_id: id, org_id: orgId, role: u.role }), "role");
  }

  const bank = await must(
    db.from("banks").upsert({ org_id: orgId, name: "State Bank of India", short_code: "SBI" }, { onConflict: "org_id,short_code" })
      .select("id").single(),
    "bank",
  );
  let branch = (await must(db.from("bank_branches").select("id").eq("org_id", orgId).eq("ifsc", "SBIN0DEMO01"), "branch lookup"))[0];
  if (!branch) {
    branch = await must(
      db.from("bank_branches")
        .insert({ org_id: orgId, bank_id: bank.id, branch_name: "Demo Branch, Pune", ifsc: "SBIN0DEMO01" })
        .select("id").single(),
      "branch",
    );
  }
  let court = (await must(db.from("courts").select("id").eq("org_id", orgId).eq("name", "Civil Judge Senior Division, Pune (Demo)"), "court lookup"))[0];
  if (!court) {
    court = await must(
      db.from("courts")
        .insert({ org_id: orgId, name: "Civil Judge Senior Division, Pune (Demo)", district: "Pune", court_type: "civil", state: "MH" })
        .select("id").single(),
      "court",
    );
  }

  let drt = (await must(db.from("courts").select("id").eq("org_id", orgId).eq("name", "Debts Recovery Tribunal, Pune (Demo)"), "DRT lookup"))[0];
  if (!drt) {
    drt = await must(
      db.from("courts")
        .insert({ org_id: orgId, name: "Debts Recovery Tribunal, Pune (Demo)", district: "Pune", court_type: "drt", state: "MH" })
        .select("id").single(),
      "DRT",
    );
  }

  for (let i = 0; i < 10; i++) {
    const caseNo = `DEMO-2026-${String(i + 1).padStart(4, "0")}`;
    const exists = await must(db.from("cases").select("id").eq("org_id", orgId).eq("case_no_internal", caseNo), "case lookup");
    if (exists.length) continue;

    const principal = rupees(PRINCIPALS[i]!);
    const interest = calculateInterest({
      principalPaise: principal, rateBps: 1050, from: "2025-03-31", to: "2026-10-20", compounding: "quarterly",
    });
    const check = commercialCheck({ specifiedValuePaise: interest.totalPaise, lenderIsBank: true });
    const drafter = i % 2 === 0 ? ids.drafter1 : ids.drafter2;

    const c = await must(
      db.from("cases").insert({
        org_id: orgId,
        bank_branch_id: branch.id,
        // Bank debts of ₹20 lakh or more go to the DRT.
        court_id: recoveryForum({ claimPaise: interest.totalPaise, lenderIsBank: true }).forum === "drt" ? drt.id : court.id,
        case_no_internal: caseNo,
        status: STATUSES[i],
        suit_type: check.isCommercial ? "commercial" : "summary_o37",
        claim_amount_paise: interest.totalPaise,
        specified_value_paise: interest.totalPaise,
        is_commercial: check.isCommercial,
        needs_12a: check.needs12A,
        assigned_drafter: drafter,
        assigned_approver: ids.approver,
        created_by: ids.admin,
      }).select("id").single(),
      `case ${caseNo}`,
    );

    await must(db.from("parties").insert({
      org_id: orgId, case_id: c.id, role: "borrower", name: BORROWERS[i]!, address: "Synthetic address, Pune",
      aadhaar_last4: String(1000 + i),
    }), "party");
    await must(db.from("loans").insert({
      org_id: orgId, case_id: c.id, account_last4: String(4000 + i), facility_type: "Term Loan",
      sanction_date: "2023-06-15", sanction_amount_paise: principal, roi_bps: 1050, npa_date: "2025-03-31",
      outstanding_paise: interest.totalPaise, interest_upto_date: "2026-10-20",
    }), "loan");
    if (i % 3 === 0) {
      await must(db.from("tasks").insert({
        org_id: orgId, case_id: c.id, assignee_id: ids.field, role: "field", kind: "collect_docs",
      }), "task");
    }
  }

  console.log(`Seeded "${ORG_NAME}". Logins: ${USERS.map((u) => `${u.key}@${DOMAIN}`).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
