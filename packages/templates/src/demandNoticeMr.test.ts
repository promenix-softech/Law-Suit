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
    expect(t).toContain("१. M/S DEMO AGRO TRADERS");
    expect(t).toContain("   तर्फे भागीदार\n   KIRAN TEST PAWAR");
    expect(t).toContain("पत्ता: FLAT ०, SAMPLE HEIGHTS, DEMO ROAD, NASHIK ४२२०००");
    expect(t).toContain("(जामीनदार)");
  });

  it("prints a party in Marathi when the Marathi name and address were typed in", () => {
    const [first, ...rest] = noticeFixture.defendants;
    const t = text({
      defendants: [
        { ...first!, nameMr: "मे. नमुना ॲग्रो ट्रेडर्स", addressMr: "गाळा 0, चाचणी मार्केट यार्ड, नाशिक 422000", through: { ...first!.through!, nameMr: "किरण चाचणी पवार" } },
        ...rest,
      ],
    });
    expect(t).toContain("१. मे. नमुना ॲग्रो ट्रेडर्स");
    expect(t).toContain("   तर्फे भागीदार\n   किरण चाचणी पवार");
    expect(t).toContain("पत्ता: गाळा ०, चाचणी मार्केट यार्ड, नाशिक ४२२०००");
    expect(t).toContain("२. KIRAN TEST PAWAR (जामीनदार)");
  });

  it("names each addressee's role and tabulates every facility", () => {
    const t = text();
    expect(t).toContain("नोटीस घेणार क्र. १ हे कर्जदार आहेत आणि नोटीस घेणार क्र. २ व ३ हे जामीनदार आहेत");
    expect(t).toContain("मुदत कर्ज (for purchase of a tractor-trailer) | रु. ९,५०,०००/- | १०.२५% | ६० महिने | XXXXXX००४१");
    expect(t).toContain("कॅश क्रेडिट (for working capital) | रु. ६,००,०००/- | ९.९०% | लागू नाही | XXXXXX००८७");
  });

  it("demands the computed total, in figures and in Marathi words, within the office's period", () => {
    const t = text();
    expect(t).toContain("रु. ११,७७,४८०/- (अक्षरी रुपये अकरा लाख सत्त्याहत्तर हजार चारशे ऐंशी फक्त)");
    expect(t).toContain("ही नोटीस मिळाल्यापासून ७ दिवसांचे आत आपण सर्वांनी संयुक्तपणे व वैयक्तिकरीत्या");
    expect(t).toContain("व्यावसायिक शुल्क व खर्च रु. ३,५००/-");
    expect(text({ office: { ...officeFixture, noticeFeeRupees: null } })).toContain("व्यावसायिक शुल्क व खर्च आपणांस सोसावा लागेल");
  });

  it("speaks to one addressee and one account in the singular", () => {
    const t = text({ defendants: [noticeFixture.defendants[0]!], facilities: [noticeFixture.facilities[0]!] });
    expect(t).not.toContain("संयुक्तपणे");
    expect(t).toContain("आपले कर्ज खाते");
    expect(t).toContain("कर्ज सुविधेच्या");
    expect(t).not.toMatch(/^१\. M\/S/m);
    expect(t.split("\n").filter((l) => !l.includes("ई-मेल:")).join("\n")).not.toMatch(/[0-9]/);
  });

  it("adds the 12A paragraph only for commercial claims, flagged for review, naming the Act in English", () => {
    const t = text({ isCommercial: true });
    expect(t).toMatch(/\[\[LEGAL_REVIEW\]\] [०-९]+\. .*\(Commercial Courts Act, २०१५\) च्या कलम १२-अ/);
    expect(text()).not.toContain("१२-अ");
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
