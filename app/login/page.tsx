import { redirect } from "next/navigation";

import { LoginScreen } from "@/features/auth/login-screen";
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

  return <LoginScreen callbackUrl={callbackUrl} />;
}
