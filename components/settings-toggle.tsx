"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/lib/i18n/language-provider";
import type { Language } from "@/lib/i18n/translations";
import type { Theme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

/**
 * Combined language (ES/EN) + theme (sun/moon) control.
 * Two segmented groups sharing one pill, matching the design reference.
 */
export function SettingsToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-02 p-0.5",
        className
      )}
    >
      {/* Language */}
      <SegmentButton
        active={lang === "es"}
        label="ES"
        title={t("settings.spanish")}
        onClick={() => setLang("es")}
        pressed={lang === "es"}
      />
      <SegmentButton
        active={lang === "en"}
        label="EN"
        title={t("settings.english")}
        onClick={() => setLang("en")}
        pressed={lang === "en"}
      />

      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />

      {/* Theme */}
      <SegmentButton
        active={theme === "light"}
        icon={<Sun className="size-3.5" />}
        title={t("settings.lightMode")}
        onClick={() => setTheme("light")}
        pressed={theme === "light"}
      />
      <SegmentButton
        active={theme === "dark"}
        icon={<Moon className="size-3.5" />}
        title={t("settings.darkMode")}
        onClick={() => setTheme("dark")}
        pressed={theme === "dark"}
      />
    </div>
  );
}

function SegmentButton({
  active,
  label,
  icon,
  title,
  onClick,
  pressed
}: {
  active: boolean;
  label?: string;
  icon?: React.ReactNode;
  title: string;
  onClick: () => void;
  pressed: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-6 min-w-[26px] items-center justify-center rounded-md px-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-brand text-white shadow-sm"
          : "text-muted-foreground hover:bg-surface-03 hover:text-foreground"
      )}
    >
      {icon ?? label}
    </button>
  );
}

// Re-exported so callers don't need to import provider types separately.
export type { Language, Theme };
