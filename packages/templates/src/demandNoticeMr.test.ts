import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DemandNoticeInput } from "./demandNotice";
import { buildDemandNoticeMr, joinVa } from "./demandNoticeMr";
import { LEGAL_REVIEW, toPlainText } from "./model";
import { noticeFixture, officeFixture } from "./testFixtures";

const text = (over: Partial<DemandNoticeInput> = {}) => toPlainText(buildDemandNoticeMr({ ...noticeFixture, ...over }));

describe("buildDemandNoticeMr (Marathi demand notice)", () => {
  it("matches the golden text", () => {
    expect(text()).toBe(readFileSync(new URL("./__golden__/demand_notice.mr.txt", import.meta.url), "utf8"));
  });

  it("opens with a review line until the advocate has approved the wording", () => {
    const first = text().split("\n").find((l) => l.startsWith(LEGAL_REVIEW));
    expect(first).toContain("वकिलांनी तपासून मंजूर करायची आहे");
  });

  it("keeps names and addresses as the bank's records have them", () => {
    const t = text();
    expect(t).toContain("[letterhead] DEMO LEGAL ASSOCIATES");
    expect(t).toContain("1. M/S DEMO AGRO TRADERS");
    expect(t).toContain("   तर्फे भागीदार\n   KIRAN TEST PAWAR");
    expect(t).toContain("पत्ता: FLAT 0, SAMPLE HEIGHTS, DEMO ROAD, NASHIK 422000");
    expect(t).toContain("(जामीनदार)");
  });

  it("names each addressee's role and tabulates every facility", () => {
    const t = text();
    expect(t).toContain("नोटीस घेणार क्र. 1 हे कर्जदार आहेत आणि नोटीस घेणार क्र. 2 व 3 हे जामीनदार आहेत");
    expect(t).toContain("Term Loan (for purchase of a tractor-trailer) | रु. 9,50,000/- | 10.25% | 60 महिने | XXXXXX0041");
    expect(t).toContain("Cash Credit (for working capital) | रु. 6,00,000/- | 9.90% | लागू नाही | XXXXXX0087");
  });

  it("demands the computed total, in figures and in Marathi words, within the office's period", () => {
    const t = text();
    expect(t).toContain("रु. 11,77,480/- (अक्षरी रुपये अकरा लाख सत्त्याहत्तर हजार चारशे ऐंशी फक्त)");
    expect(t).toContain("ही नोटीस मिळाल्यापासून 7 दिवसांचे आत आपण सर्वांनी संयुक्तपणे व वैयक्तिकरीत्या");
    expect(t).toContain("व्यावसायिक शुल्क व खर्च रु. 3,500/-");
    expect(text({ office: { ...officeFixture, noticeFeeRupees: null } })).toContain("व्यावसायिक शुल्क व खर्च आपणांस सोसावा लागेल");
  });

  it("speaks to one addressee and one account in the singular", () => {
    const t = text({ defendants: [noticeFixture.defendants[0]!], facilities: [noticeFixture.facilities[0]!] });
    expect(t).not.toContain("संयुक्तपणे");
    expect(t).toContain("आपले कर्ज खाते");
    expect(t).toContain("कर्ज सुविधेच्या");
    expect(t).not.toMatch(/^1\. M\/S/m);
  });

  it("adds the 12A paragraph only for commercial claims, flagged for review, naming the Act in English", () => {
    const t = text({ isCommercial: true });
    expect(t).toMatch(/\[\[LEGAL_REVIEW\]\] \d+\. .*Commercial Courts Act, 2015 च्या कलम 12A/);
    expect(text()).not.toContain("12A");
  });

  it("works without an office profile and refuses bad input", () => {
    expect(text({ office: null })).not.toContain("[letterhead]");
    expect(text({ office: null })).toContain("बँकेचे वकील करिता");
    expect(() => buildDemandNoticeMr({ ...noticeFixture, defendants: [] })).toThrow();
    expect(() => buildDemandNoticeMr({ ...noticeFixture, facilities: [] })).toThrow();
    expect(() => buildDemandNoticeMr({ ...noticeFixture, paymentDays: 0 })).toThrow(RangeError);
  });

  it("joins lists with व", () => {
    expect(joinVa(["1"])).toBe("1");
    expect(joinVa(["1", "2"])).toBe("1 व 2");
    expect(joinVa(["1", "2", "3"])).toBe("1, 2 व 3");
  });
});
