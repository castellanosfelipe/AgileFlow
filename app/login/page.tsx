import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    callbackUrl?: string;
  }>;
};

function getSafeCallbackUrl(callbackUrl?: string) {
  if (!callbackUrl) return "/backlog";

  try {
    const url = new URL(callbackUrl, "http://localhost:3000");
    if (url.origin !== "http://localhost:3000") return "/backlog";
    return `${url.pathname}${url.search}`;
  } catch {
    return callbackUrl.startsWith("/") ? callbackUrl : "/backlog";
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const currentUser = await getCurrentUser();
  const params = searchParams ? await searchParams : {};
  const callbackUrl = getSafeCallbackUrl(params.callbackUrl);

  if (currentUser?.id) {
    redirect(callbackUrl);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Jira Lite
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Directorio Activo
          </h1>
        </div>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
    </main>
  );
}
