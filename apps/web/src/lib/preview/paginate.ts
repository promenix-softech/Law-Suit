/**
 * Splits rendered DOCX sections into A4 pages. docx-preview starts a new page only at explicit page
 * breaks, so a generated plaint arrives as one long section; here its blocks are measured and
 * dealt onto pages of the section's own height. Tables break between rows.
 */

/** `keep`: stay on the same page as the next block (a lead-in such as "PARTICULARS OF CLAIM:"). */
export type Block = { top: number; bottom: number; keep?: boolean };

/**
 * Deals blocks (in reading order, positions relative to the content start) onto pages of
 * `available` content height. Returns the block indexes of each page. A block taller than a page
 * gets a page of its own; a `keep` block at the foot of a page moves over with the next one.
 */
export function planPages(blocks: Block[], available: number): number[][] {
  const pages: number[][] = [[]];
  let start = blocks[0]?.top ?? 0;
  blocks.forEach((b, i) => {
    const page = pages[pages.length - 1];
    if (page.length && b.bottom - start > available) {
      const next = [i];
      while (page.length > 1 && blocks[page[page.length - 1]].keep) next.unshift(page.pop()!);
      pages.push(next);
      start = blocks[next[0]].top;
    } else page.push(i);
  });
  return pages.filter((p) => p.length);
}

type Unit = Block & { el: Element; table: HTMLTableElement | null };

/** Space a header/footer takes from the body: docx-preview pulls them into the margin with negative margins. */
function footprint(el: HTMLElement | null): number {
  if (!el) return 0;
  const s = getComputedStyle(el);
  return Math.max(0, el.offsetHeight + parseFloat(s.marginTop) + parseFloat(s.marginBottom));
}

/**
 * docx-preview drops PAGE / NUMPAGES fields, so the office footer reads "Page  of ". Fill in the
 * numbers on the "Page " and " of " runs the templates write; other footers are left alone.
 */
export function numberPages(pages: HTMLElement[]) {
  pages.forEach((page, i) => {
    for (const run of page.querySelectorAll(":scope > header span, :scope > footer span")) {
      if (run.textContent === "Page ") run.textContent = `Page ${i + 1}`;
      else if (run.textContent === " of ") run.textContent = ` of ${pages.length}`;
    }
  });
}

/** Browser only: one rendered section → one or more page-sized sections (clones). */
export function paginateSection(section: HTMLElement): HTMLElement[] {
  const cs = getComputedStyle(section);
  const pageH = parseFloat(cs.minHeight);
  const article = section.querySelector<HTMLElement>(":scope > article");
  if (!article || !(pageH > 0) || section.offsetHeight <= pageH + 1) return [section];

  const header = section.querySelector<HTMLElement>(":scope > header");
  const footer = section.querySelector<HTMLElement>(":scope > footer");
  const available = pageH - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - footprint(header) - footprint(footer);
  if (available < 100) return [section];

  const origin = article.getBoundingClientRect().top;
  const unit = (el: Element, table: HTMLTableElement | null): Unit => {
    const r = el.getBoundingClientRect();
    return { el, table, top: r.top - origin, bottom: r.bottom - origin };
  };
  const units: Unit[] = [];
  for (const el of article.children) {
    if (el instanceof HTMLTableElement && el.rows.length > 1) for (const row of el.rows) units.push(unit(row, el));
    else {
      const u = unit(el, null);
      // A one-line paragraph ending in ":" introduces what follows.
      u.keep = el.tagName === "P" && u.bottom - u.top < 48 && /:\s*$/.test(el.textContent ?? "");
      units.push(u);
    }
  }
  const plan = planPages(units, available);
  if (plan.length < 2) return [section];

  return plan.map((indexes) => {
    const page = section.cloneNode(false) as HTMLElement;
    page.style.height = `${pageH}px`;
    if (header) page.append(header.cloneNode(true));
    const body = article.cloneNode(false) as HTMLElement;
    let table: HTMLTableElement | null = null;
    let rows: HTMLTableSectionElement | null = null;
    for (const i of indexes) {
      const u = units[i];
      if (!u.table) {
        body.append(u.el.cloneNode(true));
        table = null;
        continue;
      }
      if (u.table !== table || !rows) {
        table = u.table;
        const part = table.cloneNode(false) as HTMLTableElement;
        for (const cols of table.querySelectorAll(":scope > colgroup")) part.append(cols.cloneNode(true));
        rows = document.createElement("tbody");
        part.append(rows);
        body.append(part);
      }
      rows.append(u.el.cloneNode(true));
    }
    page.append(body);
    if (footer) page.append(footer.cloneNode(true));
    return page;
  });
}
