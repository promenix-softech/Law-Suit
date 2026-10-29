import { describe, expect, it } from "vitest";
import {
  chooseAcross,
  fitScale,
  fitWidthScale,
  MAX_ZOOM,
  MIN_ZOOM,
  pageLabel,
  spreadPages,
  spreadStart,
  stepTarget,
  zoomIn,
  zoomOut,
} from "./book";

const A4 = { w: 794, h: 1123 };

describe("fitScale", () => {
  it("fits one page by height on a wide screen", () => {
    expect(fitScale({ w: 1600, h: 800 }, A4, 1)).toBeCloseTo(800 / 1123);
  });
  it("fits two pages by width on a narrow-ish screen", () => {
    expect(fitScale({ w: 1000, h: 1400 }, A4, 2)).toBeCloseTo(1000 / (2 * 794));
  });
  it("is 1 for empty sizes (before the first measurement)", () => {
    expect(fitScale({ w: 0, h: 0 }, A4, 1)).toBe(1);
    expect(fitScale({ w: 500, h: 500 }, { w: 0, h: 0 }, 2)).toBe(1);
  });
});

describe("fitWidthScale", () => {
  it("fills the width up to the cap", () => {
    expect(fitWidthScale({ w: 397, h: 10 }, A4)).toBeCloseTo(0.5);
    expect(fitWidthScale({ w: 4000, h: 10 }, A4)).toBe(1);
  });
});

describe("chooseAcross", () => {
  it("shows two pages on a laptop screen", () => {
    expect(chooseAcross({ w: 1300, h: 700 }, A4, 10)).toBe(2);
  });
  it("shows one page on a phone, a short screen or a one-page document", () => {
    expect(chooseAcross({ w: 390, h: 700 }, A4, 10)).toBe(1);
    expect(chooseAcross({ w: 1000, h: 400 }, A4, 10)).toBe(1);
    expect(chooseAcross({ w: 1600, h: 900 }, A4, 1)).toBe(1);
  });
});

describe("spreads", () => {
  it("starts spreads on even pages when two-up", () => {
    expect(spreadStart(0, 2)).toBe(0);
    expect(spreadStart(3, 2)).toBe(2);
    expect(spreadStart(3, 1)).toBe(3);
    expect(spreadStart(-2, 2)).toBe(0);
  });
  it("leaves the right page empty after the last page", () => {
    expect(spreadPages(4, 2, 5)).toEqual([4, null]);
    expect(spreadPages(2, 2, 5)).toEqual([2, 3]);
    expect(spreadPages(2, 1, 5)).toEqual([2, null]);
  });
  it("steps by a whole spread and stops at both ends", () => {
    expect(stepTarget(0, 1, 2, 5)).toBe(2);
    expect(stepTarget(2, 1, 2, 5)).toBe(4);
    expect(stepTarget(4, 1, 2, 5)).toBeNull();
    expect(stepTarget(0, -1, 2, 5)).toBeNull();
    expect(stepTarget(3, -1, 2, 5)).toBe(0);
    expect(stepTarget(4, 1, 1, 5)).toBeNull();
    expect(stepTarget(3, 1, 1, 5)).toBe(4);
  });
  it("labels the visible pages 1-based", () => {
    expect(pageLabel(2, 2, 5)).toEqual({ from: 3, to: 4, total: 5 });
    expect(pageLabel(4, 2, 5)).toEqual({ from: 5, to: 5, total: 5 });
    expect(pageLabel(0, 1, 1)).toEqual({ from: 1, to: 1, total: 1 });
  });
});

describe("zoom", () => {
  it("steps and stays within bounds", () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomOut(1)).toBe(0.8);
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });
});
