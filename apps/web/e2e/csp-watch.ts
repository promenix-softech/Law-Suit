import { expect, type BrowserContext } from "@playwright/test";

/**
 * Collects what the browser refuses under the Content-Security-Policy in every page of the
 * context. Call the returned function at the end of the test: it fails if anything was refused.
 */
export function watchCsp(context: BrowserContext): () => void {
  const refused: string[] = [];
  context.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) refused.push(message.text().slice(0, 300));
  });
  return () => expect(refused, "nothing may be refused by the Content-Security-Policy").toEqual([]);
}
