"use client";

import { Loader2, LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/lib/i18n/language-provider";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        callbackUrl
      });

      if (!result || result.error) {
        setError(t("login.invalidCredentials"));
        return;
      }

      router.replace(result.url ?? callbackUrl);
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-sm shadow-none">
      <CardHeader>
        <CardTitle>{t("login.cardTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">{t("login.username")}</Label>
            <Input
              autoComplete="username"
              autoFocus
              id="username"
              placeholder={t("login.usernamePlaceholder")}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <Input
              autoComplete="current-password"
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <Button
            className="w-full"
            disabled={isPending || !username.trim() || !password}
            type="submit"
          >
            {isPending ? <Loader2 className="animate-spin" /> : <LogIn />}
            {t("login.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
