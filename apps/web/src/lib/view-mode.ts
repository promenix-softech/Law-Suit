import "server-only";

import { cookies } from "next/headers";

/**
 * How much the screens show. "simple" (the default) keeps to the next step and folds the rest
 * away; "full" opens everything for people who know the app. A preference only, kept in a cookie.
 */
export type ViewMode = "simple" | "full";
export const VIEW_COOKIE = "view";

export async function getViewMode(): Promise<ViewMode> {
  return (await cookies()).get(VIEW_COOKIE)?.value === "full" ? "full" : "simple";
}
