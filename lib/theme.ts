// Theme constants shared between the server (root layout reads the cookie) and
// the client ThemeProvider. Kept in a non-"use client" module so server
// components can import these plain values safely.

export type Theme = "dark" | "light";

export const THEME_COOKIE = "agileflow-theme";
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}
