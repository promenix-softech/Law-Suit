import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { purgeIntakeLeftovers } from "./supabase";

/** A tiny stand-in for the storage + table calls the sweep makes. */
function fakeClient(tree: Record<string, { name: string; created_at: string }[]>) {
  const removed: string[] = [];
  const updates: { values: unknown; statuses: unknown; before: unknown }[] = [];
  const bucket = {
    list: async (prefix: string) => ({ data: tree[prefix] ?? [], error: null }),
    remove: async (paths: string[]) => {
      removed.push(...paths);
      return { data: [], error: null };
    },
  };
  const sb = {
    storage: { from: (name: string) => (name === "case-intake" ? bucket : null) },
    from: () => ({
      update: (values: unknown) => ({
        in: (_col: string, statuses: unknown) => ({
          lt: async (_c: string, before: unknown) => {
            updates.push({ values, statuses, before });
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { sb, removed, updates };
}

describe("purgeIntakeLeftovers", () => {
  it("deletes intake files older than a day in every office, keeps fresh ones, discards unfinished intakes", async () => {
    const old = new Date(Date.now() - 30 * 3_600_000).toISOString();
    const fresh = new Date(Date.now() - 10 * 60_000).toISOString();
    const { sb, removed, updates } = fakeClient({
      "": [{ name: "org-a", created_at: "" }, { name: "org-b", created_at: "" }],
      "org-a": [{ name: "user-1", created_at: "" }],
      "org-b": [{ name: "user-2", created_at: "" }],
      "org-a/user-1": [
        { name: "1-old.pdf", created_at: old },
        { name: "2-new.pdf", created_at: fresh },
      ],
      "org-b/user-2": [{ name: "3-old.png", created_at: old }],
    });
    expect(await purgeIntakeLeftovers(sb, 24)).toBe(2);
    expect(removed.sort()).toEqual(["org-a/user-1/1-old.pdf", "org-b/user-2/3-old.png"]);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.values).toEqual({ status: "discarded" });
    expect(updates[0]!.statuses).toEqual(["reading", "read", "failed"]);
  });
});
