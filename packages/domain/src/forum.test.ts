import { describe, expect, it } from "vitest";
import { recoveryForum } from "./forum";
import { rupees } from "./money";

describe("recoveryForum", () => {
  it.each([
    [2_99_999, "civil"],
    [3_00_000, "commercial"],
    [19_99_999, "commercial"],
    [20_00_000, "drt"],
    [1_00_00_000, "drt"],
  ] as const)("bank claim of ₹%i goes to %s", (amount, forum) => {
    expect(recoveryForum({ claimPaise: rupees(amount), lenderIsBank: true }).forum).toBe(forum);
  });

  it("only banks and financial institutions go to the DRT", () => {
    expect(recoveryForum({ claimPaise: rupees(25_00_000), lenderIsBank: false }).forum).toBe("civil");
  });

  it("explains a DRT decision with the threshold and fee", () => {
    const r = recoveryForum({ claimPaise: rupees(25_00_000), lenderIsBank: true });
    expect(r.feePaise).toBe(rupees(27_000));
    expect(r.reason).toMatch(/₹20,00,000/);
  });

  it("leaves the civil-court fee to the court-fee function", () => {
    expect(recoveryForum({ claimPaise: rupees(5_00_000), lenderIsBank: true }).feePaise).toBeNull();
  });
});
