import "server-only";

import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, translator, type Lang } from "./i18n";

/** The signed-in user's UI language from the `lang` cookie (default English). */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: translator(lang) };
}
