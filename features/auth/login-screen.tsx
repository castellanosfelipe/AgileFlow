"use client";

import { SettingsToggle } from "@/components/settings-toggle";
import { LoginForm } from "@/features/auth/login-form";
import { useLanguage } from "@/lib/i18n/language-provider";

export function LoginScreen({ callbackUrl }: { callbackUrl: string }) {
  const { t } = useLanguage();

  return (
    <main className="relative grid min-h-screen place-items-center bg-background px-4">
      <div className="absolute right-4 top-4">
        <SettingsToggle />
      </div>

      <div className="w-full max-w-sm space-y-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-brand">
              <svg
                className="size-4 text-white"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {t("common.appName")}
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {t("login.signInHeading")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
