import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/auth";
import { ensureBackupSchedulerStarted } from "@/lib/backups";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children
}: {
  children: React.ReactNode;
}) {
  ensureBackupSchedulerStarted();

  const user = await getCurrentUser();

  if (!user?.id) {
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
