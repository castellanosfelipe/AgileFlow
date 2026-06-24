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

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
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
        setError("Usuario o contraseña de Directorio Activo no válidos");
        return;
      }

      router.replace(result.url ?? callbackUrl);
      router.refresh();
    });
  }

  return (
    <Card className="w-full max-w-sm shadow-none">
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">Usuario</Label>
            <Input
              autoComplete="username"
              autoFocus
              id="username"
              placeholder="usuario o correo"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
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
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
