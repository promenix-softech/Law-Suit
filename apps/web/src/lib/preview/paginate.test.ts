import { describe, expect, it } from "vitest";
import { planPages, type Block } from "./paginate";

const blocks = (...heights: number[]): Block[] => {
  let y = 0;
  return heights.map((h) => {
    const b = { top: y, bottom: y + h };
    y += h + 10; // paragraph spacing
    return b;
  });
};

describe("planPages", () => {
  it("keeps everything on one page when it fits", () => {
    expect(planPages(blocks(100, 100, 100), 500)).toEqual([[0, 1, 2]]);
  });
  it("starts a new page when the next block would overflow", () => {
    // 0–100, 110–310, 320–620 → third block ends at 620 > 500
    expect(planPages(blocks(100, 200, 300, 50), 500)).toEqual([[0, 1], [2, 3]]);
  });
  it("measures each page from its own first block", () => {
    expect(planPages(blocks(400, 400, 400), 500)).toEqual([[0], [1], [2]]);
  });
  it("gives a block taller than a page a page of its own", () => {
    expect(planPages(blocks(50, 900, 50), 500)).toEqual([[0], [1], [2]]);
  });
  it("moves a lead-in line over with the block it introduces", () => {
    const b = blocks(300, 20, 300);
    b[1].keep = true;
    expect(planPages(b, 500)).toEqual([[0], [1, 2]]);
  });
  it("never empties a page for a lead-in", () => {
    const b = blocks(20, 600);
    b[0].keep = true;
    expect(planPages(b, 500)).toEqual([[0], [1]]);
  });
  it("returns no pages for no blocks", () => {
    expect(planPages([], 500)).toEqual([]);
  });
});
