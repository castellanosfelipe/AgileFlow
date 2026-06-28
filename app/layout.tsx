import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { DEFAULT_THEME, isTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_COOKIE,
  type Language
} from "@/lib/i18n/translations";

const displayFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "AgileFlow",
  description: "Backlog y Kanban para equipos de ingeniería"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();

  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const theme: Theme = isTheme(themeCookie) ? themeCookie : DEFAULT_THEME;
  const langCookie = cookieStore.get(LANGUAGE_COOKIE)?.value;
  const language: Language = isLanguage(langCookie)
    ? langCookie
    : DEFAULT_LANGUAGE;

  return (
    <html
      lang={language}
      className={`${theme} ${displayFont.variable} ${monoFont.variable} ${GeistSans.variable}`}
    >
      <body className={GeistSans.className}>
        <Providers initialTheme={theme} initialLanguage={language}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
