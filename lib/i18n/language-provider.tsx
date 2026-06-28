"use client";

import * as React from "react";

import {
  DEFAULT_LANGUAGE,
  interpolate,
  LANGUAGE_COOKIE,
  translations,
  type Language,
  type TranslationKey
} from "@/lib/i18n/translations";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type TranslateFn = (
  key: TranslationKey,
  params?: Record<string, string | number>
) => string;

type LanguageContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: TranslateFn;
};

const LanguageContext = React.createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [lang, setLangState] = React.useState<Language>(initialLanguage);

  const setLang = React.useCallback((next: Language) => {
    setLangState(next);
    document.documentElement.lang = next;
    document.cookie = `${LANGUAGE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const toggleLang = React.useCallback(() => {
    setLang(lang === "es" ? "en" : "es");
  }, [lang, setLang]);

  const t = React.useCallback<TranslateFn>(
    (key, params) => {
      const dict = translations[lang] ?? translations[DEFAULT_LANGUAGE];
      const template = dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
      return interpolate(template, params);
    },
    [lang]
  );

  const value = React.useMemo<LanguageContextValue>(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = React.useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
