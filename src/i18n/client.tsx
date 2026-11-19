"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { createTranslator } from "./translate";
import type { Messages, Translator } from "./messages";

type I18nValue = { locale: Locale; t: Translator };

const I18nContext = createContext<I18nValue | null>(null);

// The root layout passes only the active locale's catalog, so the browser
// never downloads the other languages.
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(messages) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function useT() {
  return useI18n().t;
}
