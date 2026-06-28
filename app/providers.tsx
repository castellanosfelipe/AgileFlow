"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import * as React from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n/language-provider";
import type { Theme } from "@/lib/theme";
import type { Language } from "@/lib/i18n/translations";

export function Providers({
  children,
  initialTheme,
  initialLanguage
}: {
  children: React.ReactNode;
  initialTheme: Theme;
  initialLanguage: Language;
}) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <LanguageProvider initialLanguage={initialLanguage}>
        <SessionProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </SessionProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
