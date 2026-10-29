import { describe, expect, it } from "vitest";
import { firmFromHost, firmOrigin, isOwnHost, normaliseFirmCode } from "./firm";

const ROOT = "civilsuits.promenix.in";

describe("normaliseFirmCode", () => {
  it("accepts short lower-case codes, trimming and lower-casing input", () => {
    expect(normaliseFirmCode(" Nirmal ")).toBe("nirmal");
    expect(normaliseFirmCode("satyam-vidhi")).toBe("satyam-vidhi");
  });
  it("rejects bad shapes and reserved names", () => {
    for (const bad of ["", "a", "9lives", "has space", "dot.ted", "x".repeat(31), "www", "API", null, 12]) {
      expect(normaliseFirmCode(bad)).toBeNull();
    }
  });
});

describe("firmFromHost", () => {
  it("reads the firm from its subdomain", () => {
    expect(firmFromHost("nirmal.civilsuits.promenix.in", ROOT)).toBe("nirmal");
    expect(firmFromHost("Nirmal.CivilSuits.Promenix.in:443", ROOT)).toBe("nirmal");
  });
  it("finds no firm on the root, deeper names, other domains or without a root", () => {
    expect(firmFromHost(ROOT, ROOT)).toBeNull();
    expect(firmFromHost("a.b.civilsuits.promenix.in", ROOT)).toBeNull();
    expect(firmFromHost("www.civilsuits.promenix.in", ROOT)).toBeNull();
    expect(firmFromHost("nirmal.evil-civilsuits.promenix.in", ROOT)).toBeNull();
    expect(firmFromHost("civil-suits.vercel.app", ROOT)).toBeNull();
    expect(firmFromHost("nirmal.civilsuits.promenix.in", undefined)).toBeNull();
  });
});

describe("isOwnHost", () => {
  it("keeps the root and firm subdomains, nothing else", () => {
    expect(isOwnHost(ROOT, ROOT)).toBe(true);
    expect(isOwnHost("nirmal.civilsuits.promenix.in", ROOT)).toBe(true);
    expect(isOwnHost("civil-suits-abc.vercel.app", ROOT)).toBe(false);
    expect(isOwnHost("www.civilsuits.promenix.in", ROOT)).toBe(false);
  });
});

it("builds a firm's address", () => {
  expect(firmOrigin("nirmal", ROOT)).toBe("https://nirmal.civilsuits.promenix.in");
});
