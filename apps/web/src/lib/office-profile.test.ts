import { describe, expect, it } from "vitest";
import { loadOfficeConfig } from "./office-profile";

const rpc = (data: unknown, error: unknown = null) => ({ rpc: async () => ({ data, error }) });

describe("loadOfficeConfig", () => {
  it("returns null (never defaults) when office_config() fails", async () => {
    expect(await loadOfficeConfig(rpc(null, { message: "boom" }))).toBeNull();
  });

  it("returns null for users who may not see the settings (field staff get null)", async () => {
    expect(await loadOfficeConfig(rpc(null))).toBeNull();
  });

  it("reads the admin's forum and margins, defaulting only missing keys", async () => {
    const c = await loadOfficeConfig(rpc({ office_profile: { firmName: "Demo Legal Associates" }, settings: { forum: "commercial" } }));
    expect(c?.settings).toEqual({ forum: "commercial", margins: "office" });
    expect(c?.profile?.firmName).toBe("Demo Legal Associates");
  });
});
