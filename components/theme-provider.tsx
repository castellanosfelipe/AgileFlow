"use client";

import * as React from "react";

import { DEFAULT_THEME, THEME_COOKIE, type Theme } from "@/lib/theme";

export type { Theme };

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/**
 * Applies the theme to <html>. The CSS variable system treats `:root` as dark
 * and `.light` as the override, while Tailwind `dark:` variants need the `.dark`
 * class — so exactly one of `dark` / `light` is present at any time.
 */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = React.useState<Theme>(initialTheme);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
