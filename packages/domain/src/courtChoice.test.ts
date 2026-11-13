import { describe, expect, it } from "vitest";
import { chooseCourt, DEFAULT_DISTRICT, MAHARASHTRA_DISTRICTS, sameDistrict, type CourtOption } from "./courtChoice";
import { rupees } from "./money";

const COURTS: CourtOption[] = [
  { id: "pune-civil", name: "Civil Judge Senior Division, Pune", district: "Pune", courtType: "civil" },
  { id: "pune-comm", name: "Commercial Court, Pune", district: "Pune", courtType: "commercial" },
  { id: "pune-drt", name: "Debts Recovery Tribunal, Pune", district: "Pune", courtType: "drt" },
  { id: "nashik-civil", name: "Civil Judge Senior Division, Nashik", district: "Nashik", courtType: "civil" },
  { id: "abad-civil", name: "Civil Judge Senior Division, Aurangabad", district: "Aurangabad", courtType: "civil" },
];
const base = { lenderIsBank: true, urgentInterimRelief: false, officeForum: "commercial" as const, district: DEFAULT_DISTRICT, courts: COURTS };

describe("districts", () => {
  it("lists the 36 districts of Maharashtra, Pune by default", () => {
    expect(MAHARASHTRA_DISTRICTS).toHaveLength(36);
    expect(new Set(MAHARASHTRA_DISTRICTS.map((d) => d.name)).size).toBe(36);
    expect(DEFAULT_DISTRICT).toBe("Pune");
  });

  it("matches a court's district by name, old name, case and spacing", () => {
    expect(sameDistrict(" pune ", "Pune")).toBe(true);
    expect(sameDistrict("Aurangabad", "Chhatrapati Sambhajinagar")).toBe(true);
    expect(sameDistrict("Chhatrapati  Sambhajinagar", "Aurangabad")).toBe(true);
    expect(sameDistrict("Nashik", "Pune")).toBe(false);
  });
});

describe("chooseCourt", () => {
  it("below ₹3 lakh: the civil court of the district", () => {
    const c = chooseCourt({ ...base, claimPaise: rupees(2_50_000) });
    expect(c.courtType).toBe("civil");
    expect(c.suggested?.id).toBe("pune-civil");
    expect(c.needs12A).toBe(false);
    expect(c.reason).toContain("civil suit");
  });

  it("₹3 lakh to under ₹20 lakh, office files commercial suits: the commercial court, 12A first", () => {
    const c = chooseCourt({ ...base, claimPaise: rupees(5_00_000) });
    expect(c.courtType).toBe("commercial");
    expect(c.suitType).toBe("commercial");
    expect(c.suggested?.id).toBe("pune-comm");
    expect(c.needs12A).toBe(true);
    expect(c.reason).toContain("Sec 12A");
  });

  it("urgent interim relief: still the commercial court, without 12A", () => {
    const c = chooseCourt({ ...base, claimPaise: rupees(5_00_000), urgentInterimRelief: true });
    expect(c.needs12A).toBe(false);
    expect(c.reason).toContain("no 12A");
  });

  it("office files Order XXXVII summary suits: the civil court even above ₹3 lakh", () => {
    const c = chooseCourt({ ...base, officeForum: "summary_suit", claimPaise: rupees(5_00_000) });
    expect(c.courtType).toBe("civil");
    expect(c.suitType).toBe("summary_o37");
    expect(c.suggested?.id).toBe("pune-civil");
    expect(c.needs12A).toBe(false);
  });

  it("₹20 lakh or more owed to a bank: the DRT, the bench left to the advocate", () => {
    const c = chooseCourt({ ...base, claimPaise: rupees(20_00_000) });
    expect(c.courtType).toBe("drt");
    expect(c.suggested?.id).toBe("pune-drt");
    expect(c.notes.join(" ")).toContain("[[LEGAL_REVIEW]]");
    expect(chooseCourt({ ...base, claimPaise: rupees(25_00_000), district: "Nashik" }).suggested).toBeNull();
  });

  it("another district: its courts, by old or new name; a missing court is said plainly", () => {
    expect(chooseCourt({ ...base, claimPaise: rupees(1_00_000), district: "Chhatrapati Sambhajinagar" }).suggested?.id).toBe("abad-civil");
    const c = chooseCourt({ ...base, claimPaise: rupees(5_00_000), district: "Nashik" });
    expect(c.suggested).toBeNull();
    expect(c.notes.join(" ")).toContain("No commercial court for Nashik");
    expect(c.flags).toEqual({ place: true, drtBench: false, noCourt: true, several: false });
  });

  it("gives the notes as flags too, for screens in other languages", () => {
    expect(chooseCourt({ ...base, claimPaise: rupees(20_00_000) }).flags).toEqual({ place: false, drtBench: true, noCourt: false, several: false });
    const two = [...COURTS, { id: "pune-civil-2", name: "Civil Judge Junior Division, Pune", district: "Pune", courtType: "civil" as const }];
    expect(chooseCourt({ ...base, courts: two, claimPaise: rupees(1_00_000) }).flags.several).toBe(true);
  });

  it("amount not known yet: every court of the district, civil first", () => {
    const c = chooseCourt({ ...base, claimPaise: null });
    expect(c.courtType).toBeNull();
    expect(c.candidates.map((x) => x.id)).toEqual(["pune-civil", "pune-comm", "pune-drt"]);
    expect(c.suggested?.id).toBe("pune-civil");
  });

  it("always leaves the place to the advocate", () => {
    for (const claim of [null, rupees(1_00_000), rupees(5_00_000)]) {
      expect(chooseCourt({ ...base, claimPaise: claim }).notes.some((n) => n.startsWith("[[LEGAL_REVIEW]] Place"))).toBe(true);
    }
  });
});
