import { describe, expect, it } from "vitest";
import { mergeById, remoteTerm } from "./palette-search";

describe("remoteTerm", () => {
  it("asks for the longest word of the query", () => {
    expect(remoteTerm("patil CS-2026-0012")).toBe("CS-2026-0012");
    expect(remoteTerm("  Ramesh Demo  ")).toBe("Ramesh");
  });

  it("keeps Devanagari names whole", () => {
    expect(remoteTerm("रमेश पाटील")).toBe("पाटील");
  });

  it("has nothing to ask for under two characters", () => {
    expect(remoteTerm("")).toBeNull();
    expect(remoteTerm("a")).toBeNull();
    expect(remoteTerm("% _ *")).toBeNull();
  });

  it("drops LIKE wildcards and filter syntax", () => {
    for (const q of ['a%b_c*d', 'x,y(z)', 'na"me\\x', "o'brien", "a:b;c"]) {
      expect(remoteTerm(q) ?? "").not.toMatch(/[%_*,()"'\\:;]/);
    }
    expect(remoteTerm("100%")).toBe("100");
    expect(remoteTerm('cnr_no.ilike."%"')).toBe("no.ilike.");
  });

  it("caps the length", () => {
    expect(remoteTerm("x".repeat(200))).toHaveLength(40);
  });
});

describe("mergeById", () => {
  it("adds only cases not yet known and keeps the order", () => {
    const known = [{ id: "1" }, { id: "2" }];
    expect(mergeById(known, [{ id: "2" }, { id: "3" }, { id: "3" }])).toEqual([{ id: "1" }, { id: "2" }, { id: "3" }]);
  });

  it("keeps the latest when it grows past the cap", () => {
    expect(mergeById([{ id: "1" }, { id: "2" }], [{ id: "3" }], 2)).toEqual([{ id: "2" }, { id: "3" }]);
  });
});
