import { describe, expect, it } from "vitest";
import { numberToWordsMarathi, rupeesInWordsMr } from "./wordsMr";

describe("numberToWordsMarathi", () => {
  it("has a word for every number below 100", () => {
    const words = Array.from({ length: 100 }, (_, i) => numberToWordsMarathi(i));
    expect(new Set(words).size).toBe(100);
    words.forEach((w) => expect(w).toMatch(/^[ऀ-ॿ]+$/));
  });

  it("writes the irregular numbers the standard way", () => {
    expect(numberToWordsMarathi(0)).toBe("शून्य");
    expect(numberToWordsMarathi(19)).toBe("एकोणीस");
    expect(numberToWordsMarathi(25)).toBe("पंचवीस");
    expect(numberToWordsMarathi(39)).toBe("एकोणचाळीस");
    expect(numberToWordsMarathi(48)).toBe("अठ्ठेचाळीस");
    expect(numberToWordsMarathi(55)).toBe("पंचावन्न");
    expect(numberToWordsMarathi(67)).toBe("सदुसष्ट");
    expect(numberToWordsMarathi(77)).toBe("सत्त्याहत्तर");
    expect(numberToWordsMarathi(80)).toBe("ऐंशी");
    expect(numberToWordsMarathi(99)).toBe("नव्व्याण्णव");
  });

  it("writes hundreds as शंभर and <n>शे", () => {
    expect(numberToWordsMarathi(100)).toBe("शंभर");
    expect(numberToWordsMarathi(101)).toBe("एकशे एक");
    expect(numberToWordsMarathi(480)).toBe("चारशे ऐंशी");
    expect(numberToWordsMarathi(900)).toBe("नऊशे");
    expect(numberToWordsMarathi(999)).toBe("नऊशे नव्व्याण्णव");
  });

  it("groups in thousands, lakhs and crores", () => {
    expect(numberToWordsMarathi(1000)).toBe("एक हजार");
    expect(numberToWordsMarathi(3500)).toBe("तीन हजार पाचशे");
    expect(numberToWordsMarathi(100000)).toBe("एक लाख");
    expect(numberToWordsMarathi(1177480)).toBe("अकरा लाख सत्त्याहत्तर हजार चारशे ऐंशी");
    expect(numberToWordsMarathi(10000000)).toBe("एक कोटी");
    expect(numberToWordsMarathi(1234567890)).toBe("एकशे तेवीस कोटी पंचेचाळीस लाख सदुसष्ट हजार आठशे नव्वद");
  });

  it("refuses fractions and negatives", () => {
    expect(() => numberToWordsMarathi(-1)).toThrow(RangeError);
    expect(() => numberToWordsMarathi(1.5)).toThrow(RangeError);
  });
});

describe("rupeesInWordsMr", () => {
  it("writes rupees, and paise only when there are any", () => {
    expect(rupeesInWordsMr(117748000)).toBe("रुपये अकरा लाख सत्त्याहत्तर हजार चारशे ऐंशी फक्त");
    expect(rupeesInWordsMr(149075808)).toBe("रुपये चौदा लाख नव्वद हजार सातशे अठ्ठावन्न आणि आठ पैसे फक्त");
    expect(rupeesInWordsMr(350000)).toBe("रुपये तीन हजार पाचशे फक्त");
    expect(rupeesInWordsMr(0)).toBe("रुपये शून्य फक्त");
  });
});
