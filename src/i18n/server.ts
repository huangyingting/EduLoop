import { cookies } from "next/headers";
import { LOCALE_COOKIE, resolveLocale } from "./config";
import { translatorFor } from "./messages";

// Server components read the chosen interface language from the request
// cookie. Reading it opts the route into request-time rendering.
export async function getLocale() {
  return resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: translatorFor(locale) };
}
